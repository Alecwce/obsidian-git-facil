import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { t } from "./i18n";

const execFileAsync = promisify(execFile);

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
			{ cwd },
		);
		const branch = stdout.trim();
		return branch && branch !== "HEAD" ? branch : "main";
	} catch {
		return "main";
	}
}

export async function isGitRepo(
	cwd: string,
	gitPath?: string,
): Promise<boolean> {
	const git = resolveGit(gitPath);
	try {
		await execFileAsync(git, ["rev-parse", "--is-inside-work-tree"], { cwd });
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
		await execFileAsync(git, ["init", "-b", "main"], { cwd });
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
		const { stdout } = await execFileAsync(git, ["remote"], { cwd });
		return stdout.trim().length > 0;
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

	try {
		const remoteExists = await hasGitRemote(cwd, gitPath);
		if (remoteExists) {
			await execFileAsync(git, ["remote", "set-url", "origin", trimmedUrl], {
				cwd,
			});
		} else {
			await execFileAsync(git, ["remote", "add", "origin", trimmedUrl], {
				cwd,
			});
		}

		await execFileAsync(git, ["add", "-A"], { cwd });

		try {
			await execFileAsync(git, ["commit", "-m", commitMessage], { cwd });
		} catch {
			// Si no hay cambios pendientes, continuar al push
		}

		await execFileAsync(git, ["push", "-u", "origin", "main"], { cwd });

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

export async function parseGitStatusPorcelain(
	cwd: string,
	gitPath?: string,
): Promise<GitChangedFile[]> {
	const git = resolveGit(gitPath);
	try {
		const { stdout } = await execFileAsync(
			git,
			["-c", "core.quotepath=false", "status", "--porcelain"],
			{ cwd },
		);
		return parsePorcelainOutput(stdout);
	} catch {
		return [];
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

	try {
		await execFileAsync(git, ["add", "--", ...filePaths], { cwd });
		await execFileAsync(git, ["commit", "-m", commitMessage], { cwd });
		await execFileAsync(git, ["push"], { cwd });
		return {
			success: true,
			message: t("gitHelperCommitSelectedSuccess"),
		};
	} catch (error) {
		const msg = error instanceof Error ? error.message : String(error);
		const isPushRejected =
			msg.includes("rejected") ||
			msg.includes("fetch first") ||
			msg.includes("non-fast-forward");

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
		const { stdout } = await execFileAsync(git, ["pull"], { cwd });
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
	try {
		const branch = await getCurrentBranch(cwd, gitPath);
		await execFileAsync(git, ["fetch", "origin"], { cwd });
		try {
			await execFileAsync(git, ["pull", "--rebase", "origin", branch], {
				cwd,
			});
		} catch (pullError) {
			// Si hay conflicto durante rebase, abortar para no dejar el repositorio en estado inconsistente
			try {
				await execFileAsync(git, ["rebase", "--abort"], { cwd });
			} catch {
				// Ignorar error al abortar
			}
			throw pullError;
		}
		await execFileAsync(git, ["push", "origin", branch], { cwd });
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
		{ cwd },
	);
	return stdout.trim();
}

export async function runGit(
	args: string[],
	cwd: string,
	gitPath?: string,
): Promise<string> {
	const git = resolveGit(gitPath);
	const { stdout } = await execFileAsync(git, args, { cwd });
	return stdout;
}
