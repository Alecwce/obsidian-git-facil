import { execFile } from "node:child_process";
import process from "node:process";
import { promisify } from "node:util";
import { t } from "./i18n";

const execFileAsync = promisify(execFile);

const GIT_TIMEOUT_MS = 30_000;
const GIT_REMOTE_TIMEOUT_MS = 120_000;

function gitOpts(cwd: string, remote = false) {
	return { cwd, timeout: remote ? GIT_REMOTE_TIMEOUT_MS : GIT_TIMEOUT_MS };
}

export function isPushRejectedMessage(msg: string): boolean {
	const m = msg.toLowerCase();
	return (
		m.includes("rejected") ||
		m.includes("fetch first") ||
		m.includes("non-fast-forward") ||
		m.includes("failed to push") ||
		m.includes("updates were rejected")
	);
}

const GIT_REMOTE_URL_RE =
	/^(https:\/\/[A-Za-z0-9.-]+\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+(\.git)?\/?|git@[A-Za-z0-9.-]+:[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+(\.git)?)$/;

export function isValidGitRemoteUrl(url: string): boolean {
	const trimmed = url.trim();
	if (!trimmed || /\s/.test(trimmed) || trimmed.startsWith("-")) return false;
	return GIT_REMOTE_URL_RE.test(trimmed);
}

export async function hasUncommittedChanges(
	cwd: string,
	gitPath?: string,
): Promise<boolean> {
	const res = await getGitStatusResult(cwd, gitPath);
	return res.ok && res.files.length > 0;
}

export interface GitChangedFile {
	status: string;
	path: string;
}

export function resolveGit(gitPath?: string): string {
	const trimmed = gitPath?.trim();
	return trimmed && trimmed.length > 0 ? trimmed : "git";
}

export function getCommitMessage(
	template = "📝 notas {fecha}",
	date: Date = new Date(),
): string {
	const pad = (n: number) => n.toString().padStart(2, "0");
	const year = date.getFullYear();
	const month = pad(date.getMonth() + 1);
	const day = pad(date.getDate());
	const hours = pad(date.getHours());
	const minutes = pad(date.getMinutes());

	const dateStr = `${year}-${month}-${day} ${hours}:${minutes}`;
	return template.replace("{fecha}", dateStr);
}

export async function isGitInstalled(gitPath?: string): Promise<boolean> {
	const git = resolveGit(gitPath);
	try {
		await execFileAsync(git, ["--version"]);
		return true;
	} catch {
		return false;
	}
}

export async function getGitVersion(gitPath?: string): Promise<{
	success: boolean;
	version?: string;
}> {
	const git = resolveGit(gitPath);
	try {
		const { stdout } = await execFileAsync(git, ["--version"]);
		return { success: true, version: stdout.trim() };
	} catch {
		return { success: false };
	}
}

export async function getCurrentBranch(
	cwd: string,
	gitPath?: string,
): Promise<string> {
	const git = resolveGit(gitPath);
	try {
		const { stdout } = await execFileAsync(
			git,
			["rev-parse", "--abbrev-ref", "HEAD"],
			gitOpts(cwd),
		);
		const branch = stdout.trim();
		return branch && branch !== "HEAD" ? branch : "main";
	} catch {
		return "main";
	}
}

export interface AheadBehind {
	ahead: number;
	behind: number;
	hasUpstream: boolean;
}

export async function getAheadBehind(
	cwd: string,
	gitPath?: string,
): Promise<AheadBehind> {
	const git = resolveGit(gitPath);
	try {
		const { stdout } = await execFileAsync(
			git,
			["rev-list", "--left-right", "--count", "@{u}...HEAD"],
			gitOpts(cwd),
		);
		const [behindRaw, aheadRaw] = stdout.trim().split(/\s+/);
		const behind = Number.parseInt(behindRaw ?? "0", 10);
		const ahead = Number.parseInt(aheadRaw ?? "0", 10);
		return {
			ahead: Number.isNaN(ahead) ? 0 : ahead,
			behind: Number.isNaN(behind) ? 0 : behind,
			hasUpstream: true,
		};
	} catch {
		return { ahead: 0, behind: 0, hasUpstream: false };
	}
}

export interface CleanSyncResult {
	pulled: boolean;
	behind: number;
	error?: string;
}

// Árbol limpio: fetch + pull si el remoto va por delante. Sin cambios
// locales no puede haber conflicto de rebase; ante cualquier fallo se
// aborta y se reporta sin tocar nada.
export async function syncCleanTree(
	cwd: string,
	gitPath?: string,
): Promise<CleanSyncResult> {
	const git = resolveGit(gitPath);
	try {
		const branch = await getCurrentBranch(cwd, gitPath);
		await execFileAsync(git, ["fetch", "origin"], gitOpts(cwd, true));
		const { behind, hasUpstream } = await getAheadBehind(cwd, gitPath);
		if (!hasUpstream || behind === 0) {
			return { pulled: false, behind: 0 };
		}
		try {
			await execFileAsync(
				git,
				["pull", "--rebase", "origin", branch],
				gitOpts(cwd, true),
			);
		} catch (pullError) {
			try {
				await execFileAsync(git, ["rebase", "--abort"], gitOpts(cwd));
			} catch {
				// Ignorar error al abortar
			}
			const msg =
				pullError instanceof Error ? pullError.message : String(pullError);
			return { pulled: false, behind, error: msg };
		}
		return { pulled: true, behind };
	} catch (error) {
		const msg = error instanceof Error ? error.message : String(error);
		return { pulled: false, behind: 0, error: msg };
	}
}

export interface GitIdentity {
	name: string;
	email: string;
}

export async function getGitIdentity(
	cwd: string,
	gitPath?: string,
): Promise<GitIdentity> {
	const git = resolveGit(gitPath);
	async function config(key: string): Promise<string> {
		try {
			const { stdout } = await execFileAsync(
				git,
				["config", key],
				gitOpts(cwd),
			);
			return stdout.trim();
		} catch {
			return "";
		}
	}
	return {
		name: await config("user.name"),
		email: await config("user.email"),
	};
}

// Comprueba URL + credenciales sin tocar la config: ls-remote directo.
export async function checkRemoteAuth(
	remoteUrl: string,
	gitPath?: string,
): Promise<{ ok: boolean; error?: string }> {
	const git = resolveGit(gitPath);
	const trimmed = remoteUrl.trim();
	if (!isValidGitRemoteUrl(trimmed)) {
		return { ok: false, error: t("wizardStep3ErrorInvalid") };
	}
	try {
		await execFileAsync(
			git,
			["ls-remote", trimmed, "HEAD"],
			gitOpts(process.cwd(), true),
		);
		return { ok: true };
	} catch (error) {
		const msg = error instanceof Error ? error.message : String(error);
		return { ok: false, error: msg };
	}
}

export async function isGitRepo(
	cwd: string,
	gitPath?: string,
): Promise<boolean> {
	const git = resolveGit(gitPath);
	try {
		await execFileAsync(
			git,
			["rev-parse", "--is-inside-work-tree"],
			gitOpts(cwd),
		);
		return true;
	} catch {
		return false;
	}
}

export async function initGitRepo(
	cwd: string,
	gitPath?: string,
): Promise<{ success: boolean; message: string }> {
	const git = resolveGit(gitPath);
	try {
		const isRepo = await isGitRepo(cwd, gitPath);
		if (isRepo) {
			return { success: true, message: t("wizardStep2AlreadyRepo") };
		}
		await execFileAsync(git, ["init", "-b", "main"], gitOpts(cwd));
		return { success: true, message: t("wizardStep2Success") };
	} catch (error) {
		const msg = error instanceof Error ? error.message : String(error);
		return {
			success: false,
			message: t("wizardStep2Error", { msg }),
		};
	}
}

export async function hasGitRemote(
	cwd: string,
	gitPath?: string,
): Promise<boolean> {
	const git = resolveGit(gitPath);
	try {
		const { stdout } = await execFileAsync(git, ["remote"], gitOpts(cwd));
		return stdout.trim().length > 0;
	} catch {
		return false;
	}
}

export async function hasOriginRemote(
	cwd: string,
	gitPath?: string,
): Promise<boolean> {
	const git = resolveGit(gitPath);
	try {
		await execFileAsync(git, ["remote", "get-url", "origin"], gitOpts(cwd));
		return true;
	} catch {
		return false;
	}
}

export async function setupRemoteAndFirstCommit(
	cwd: string,
	remoteUrl: string,
	commitMessage: string,
	gitPath?: string,
): Promise<{ success: boolean; message: string }> {
	const git = resolveGit(gitPath);
	const trimmedUrl = remoteUrl.trim();
	if (!trimmedUrl) {
		return {
			success: false,
			message: t("wizardStep3ErrorEmpty"),
		};
	}
	if (!isValidGitRemoteUrl(trimmedUrl)) {
		return {
			success: false,
			message: t("wizardStep3ErrorInvalid"),
		};
	}

	try {
		const originExists = await hasOriginRemote(cwd, gitPath);
		if (originExists) {
			await execFileAsync(
				git,
				["remote", "set-url", "origin", trimmedUrl],
				gitOpts(cwd),
			);
		} else {
			await execFileAsync(
				git,
				["remote", "add", "origin", trimmedUrl],
				gitOpts(cwd),
			);
		}

		await execFileAsync(git, ["add", "-A"], gitOpts(cwd));

		try {
			await execFileAsync(git, ["commit", "-m", commitMessage], gitOpts(cwd));
		} catch {
			// Si no hay cambios pendientes, continuar al push
		}

		const branch = await getCurrentBranch(cwd, gitPath);
		await execFileAsync(
			git,
			["push", "-u", "origin", branch],
			gitOpts(cwd, true),
		);

		return {
			success: true,
			message: t("wizardStep3Success"),
		};
	} catch (error) {
		const msg = error instanceof Error ? error.message : String(error);
		return {
			success: false,
			message: t("wizardStep3ErrorConnect", { msg }),
		};
	}
}

export function parsePorcelainOutput(stdout: string): GitChangedFile[] {
	const lines = stdout.split("\n").filter((line) => line.trim().length > 0);
	return lines.map((line) => {
		const status = line.slice(0, 2).trim();
		let filePath = line.slice(3).trim();

		if (filePath.includes(" -> ")) {
			const parts = filePath.split(" -> ");
			filePath = parts[parts.length - 1].trim();
		}

		if (filePath.startsWith('"') && filePath.endsWith('"')) {
			filePath = filePath.slice(1, -1);
		}

		return { status, path: filePath };
	});
}

// Formato -z: entradas separadas por NUL, a prueba de nombres con
// espacios, comillas o saltos de línea. En renames el orden es
// "to\0from": la primera ruta es la vigente.
export function parsePorcelainZ(stdout: string): GitChangedFile[] {
	const fields = stdout.split("\0");
	const files: GitChangedFile[] = [];
	for (let i = 0; i < fields.length; i++) {
		const entry = fields[i];
		if (!entry || entry.trim().length === 0) continue;
		const status = entry.slice(0, 2).trim();
		const filePath = entry.slice(3);
		// Renames/copias traen la ruta origen como segundo campo: se consume.
		if (
			(status.startsWith("R") || status.startsWith("C")) &&
			i + 1 < fields.length
		) {
			i++;
		}
		if (!filePath) continue;
		files.push({ status, path: filePath });
	}
	return files;
}

export interface GitStatusResult {
	ok: boolean;
	files: GitChangedFile[];
	error?: string;
}

export async function getGitStatusResult(
	cwd: string,
	gitPath?: string,
): Promise<GitStatusResult> {
	const git = resolveGit(gitPath);
	try {
		const { stdout } = await execFileAsync(
			git,
			["-c", "core.quotepath=false", "status", "--porcelain=v1", "-z"],
			gitOpts(cwd),
		);
		return { ok: true, files: parsePorcelainZ(stdout) };
	} catch (error) {
		const msg = error instanceof Error ? error.message : String(error);
		return { ok: false, files: [], error: msg };
	}
}

export async function parseGitStatusPorcelain(
	cwd: string,
	gitPath?: string,
): Promise<GitChangedFile[]> {
	const res = await getGitStatusResult(cwd, gitPath);
	return res.files;
}

export async function hasStagedChanges(
	cwd: string,
	gitPath?: string,
): Promise<boolean> {
	const git = resolveGit(gitPath);
	try {
		await execFileAsync(git, ["diff", "--cached", "--quiet"], gitOpts(cwd));
		return false;
	} catch {
		return true;
	}
}

export async function commitAndPushSelectedFiles(
	cwd: string,
	filePaths: string[],
	commitMessage: string,
	gitPath?: string,
): Promise<{ success: boolean; message: string; pushRejected?: boolean }> {
	const git = resolveGit(gitPath);
	if (filePaths.length === 0) {
		return {
			success: false,
			message: t("statusPanelSelectAtLeastOne"),
		};
	}

	// Protege cambios ya staged por fuera: commit solo debe incluir lo marcado.
	let stashedIndex = false;
	try {
		if (await hasStagedChanges(cwd, gitPath)) {
			await execFileAsync(
				git,
				["stash", "push", "--staged", "-m", "gitfacil-index"],
				gitOpts(cwd),
			);
			stashedIndex = true;
		}
		await execFileAsync(git, ["add", "--", ...filePaths], gitOpts(cwd));
		await execFileAsync(git, ["commit", "-m", commitMessage], gitOpts(cwd));
		await execFileAsync(git, ["push"], gitOpts(cwd, true));
		if (stashedIndex) {
			try {
				await execFileAsync(git, ["stash", "pop"], gitOpts(cwd));
			} catch (popError) {
				const msg =
					popError instanceof Error ? popError.message : String(popError);
				return {
					success: false,
					message: t("gitHelperStashPopConflict", { msg }),
				};
			}
			stashedIndex = false;
		}
		return {
			success: true,
			message: t("gitHelperCommitSelectedSuccess"),
		};
	} catch (error) {
		if (stashedIndex) {
			try {
				await execFileAsync(git, ["stash", "pop"], gitOpts(cwd));
			} catch {
				// El error original manda; el stash queda guardado
			}
			stashedIndex = false;
		}
		const msg = error instanceof Error ? error.message : String(error);
		const isPushRejected = isPushRejectedMessage(msg);

		return {
			success: false,
			message: t("gitHelperCommitSelectedError", { msg }),
			pushRejected: isPushRejected,
		};
	}
}

export async function pullGitChanges(
	cwd: string,
	gitPath?: string,
): Promise<{ success: boolean; message: string }> {
	const git = resolveGit(gitPath);
	try {
		const { stdout } = await execFileAsync(git, ["pull"], gitOpts(cwd, true));
		if (
			stdout.includes("Already up to date") ||
			stdout.includes("Ya está actualizado")
		) {
			return { success: true, message: t("pullNoNewChanges") };
		}
		return { success: true, message: t("pullChangesDownloaded") };
	} catch (error) {
		const msg = error instanceof Error ? error.message : String(error);
		return {
			success: false,
			message: t("gitHelperPullError", { msg }),
		};
	}
}

export async function syncAndAlignWithRemote(
	cwd: string,
	gitPath?: string,
): Promise<{ success: boolean; message: string }> {
	const git = resolveGit(gitPath);
	let stashed = false;
	try {
		const branch = await getCurrentBranch(cwd, gitPath);
		if (await hasUncommittedChanges(cwd, gitPath)) {
			await execFileAsync(
				git,
				["stash", "push", "-u", "-m", "gitfacil-autostash"],
				gitOpts(cwd),
			);
			stashed = true;
		}
		await execFileAsync(git, ["fetch", "origin"], gitOpts(cwd, true));
		try {
			await execFileAsync(
				git,
				["pull", "--rebase", "origin", branch],
				gitOpts(cwd, true),
			);
		} catch (pullError) {
			// Si hay conflicto durante rebase, abortar para no dejar el repositorio en estado inconsistente
			try {
				await execFileAsync(git, ["rebase", "--abort"], gitOpts(cwd));
			} catch {
				// Ignorar error al abortar
			}
			if (stashed) {
				try {
					await execFileAsync(git, ["stash", "pop"], gitOpts(cwd));
				} catch {
					// El error original del pull es más importante; el stash queda guardado
				}
				stashed = false;
			}
			throw pullError;
		}
		await execFileAsync(git, ["push", "origin", branch], gitOpts(cwd, true));
		if (stashed) {
			try {
				await execFileAsync(git, ["stash", "pop"], gitOpts(cwd));
			} catch (popError) {
				const msg =
					popError instanceof Error ? popError.message : String(popError);
				return {
					success: false,
					message: t("gitHelperStashPopConflict", { msg }),
				};
			}
			stashed = false;
		}
		return {
			success: true,
			message: t("gitHelperSyncSuccess"),
		};
	} catch (error) {
		const msg = error instanceof Error ? error.message : String(error);
		return {
			success: false,
			message: t("gitHelperSyncError", { msg }),
		};
	}
}

export async function checkGitStatusPorcelain(
	cwd: string,
	gitPath?: string,
): Promise<string> {
	const git = resolveGit(gitPath);
	const { stdout } = await execFileAsync(
		git,
		["-c", "core.quotepath=false", "status", "--porcelain"],
		gitOpts(cwd),
	);
	return stdout.trim();
}

export async function runGit(
	args: string[],
	cwd: string,
	gitPath?: string,
	remote = false,
): Promise<string> {
	const git = resolveGit(gitPath);
	const { stdout } = await execFileAsync(git, args, gitOpts(cwd, remote));
	return stdout;
}
