import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export interface GitChangedFile {
	status: string;
	path: string;
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

export async function isGitInstalled(): Promise<boolean> {
	try {
		await execFileAsync("git", ["--version"]);
		return true;
	} catch {
		return false;
	}
}

export async function getGitVersion(): Promise<{
	success: boolean;
	version?: string;
}> {
	try {
		const { stdout } = await execFileAsync("git", ["--version"]);
		return { success: true, version: stdout.trim() };
	} catch {
		return { success: false };
	}
}

export async function isGitRepo(cwd: string): Promise<boolean> {
	try {
		await execFileAsync("git", ["rev-parse", "--is-inside-work-tree"], { cwd });
		return true;
	} catch {
		return false;
	}
}

export async function initGitRepo(
	cwd: string,
): Promise<{ success: boolean; message: string }> {
	try {
		const isRepo = await isGitRepo(cwd);
		if (isRepo) {
			return { success: true, message: "Ya es un repositorio Git ✅" };
		}
		await execFileAsync("git", ["init", "-b", "main"], { cwd });
		return { success: true, message: "Repositorio Git creado exitosamente ✅" };
	} catch (error) {
		const msg = error instanceof Error ? error.message : String(error);
		return { success: false, message: `❌ Error al crear repositorio: ${msg}` };
	}
}

export async function hasGitRemote(cwd: string): Promise<boolean> {
	try {
		const { stdout } = await execFileAsync("git", ["remote"], { cwd });
		return stdout.trim().length > 0;
	} catch {
		return false;
	}
}

export async function setupRemoteAndFirstCommit(
	cwd: string,
	remoteUrl: string,
	commitMessage: string,
): Promise<{ success: boolean; message: string }> {
	const trimmedUrl = remoteUrl.trim();
	if (!trimmedUrl) {
		return {
			success: false,
			message: "❌ Por favor ingresa la URL de tu repositorio de GitHub.",
		};
	}

	try {
		const remoteExists = await hasGitRemote(cwd);
		if (remoteExists) {
			await execFileAsync("git", ["remote", "set-url", "origin", trimmedUrl], {
				cwd,
			});
		} else {
			await execFileAsync("git", ["remote", "add", "origin", trimmedUrl], {
				cwd,
			});
		}

		await execFileAsync("git", ["add", "-A"], { cwd });

		try {
			await execFileAsync("git", ["commit", "-m", commitMessage], { cwd });
		} catch {
			// Si no hay cambios pendientes, continuar al push
		}

		await execFileAsync("git", ["push", "-u", "origin", "main"], { cwd });

		return {
			success: true,
			message: "Conectado y primer commit subido exitosamente ✅",
		};
	} catch (error) {
		const msg = error instanceof Error ? error.message : String(error);
		return {
			success: false,
			message: `❌ Error al conectar o subir: ${msg}`,
		};
	}
}

export async function parseGitStatusPorcelain(
	cwd: string,
): Promise<GitChangedFile[]> {
	try {
		const { stdout } = await execFileAsync("git", ["status", "--porcelain"], {
			cwd,
		});
		const lines = stdout.split("\n").filter((line) => line.trim().length > 0);
		return lines.map((line) => {
			const status = line.slice(0, 2).trim();
			const filePath = line.slice(3).trim();
			return { status, path: filePath };
		});
	} catch {
		return [];
	}
}

export async function commitAndPushSelectedFiles(
	cwd: string,
	filePaths: string[],
	commitMessage: string,
): Promise<{ success: boolean; message: string }> {
	if (filePaths.length === 0) {
		return {
			success: false,
			message: "❌ Selecciona al menos un archivo para subir.",
		};
	}

	try {
		await execFileAsync("git", ["add", "--", ...filePaths], { cwd });
		await execFileAsync("git", ["commit", "-m", commitMessage], { cwd });
		await execFileAsync("git", ["push"], { cwd });
		return {
			success: true,
			message: "✅ Commit y push de los archivos marcados exitoso",
		};
	} catch (error) {
		const msg = error instanceof Error ? error.message : String(error);
		return {
			success: false,
			message: `❌ Error al subir marcados: ${msg}`,
		};
	}
}

export async function pullGitChanges(
	cwd: string,
): Promise<{ success: boolean; message: string }> {
	try {
		const { stdout } = await execFileAsync("git", ["pull"], { cwd });
		if (
			stdout.includes("Already up to date") ||
			stdout.includes("Ya está actualizado")
		) {
			return { success: true, message: "✅ Sin cambios nuevos" };
		}
		return { success: true, message: "✅ Cambios bajados" };
	} catch (error) {
		const msg = error instanceof Error ? error.message : String(error);
		return {
			success: false,
			message: `❌ Error al bajar cambios: ${msg}`,
		};
	}
}

export async function checkGitStatusPorcelain(cwd: string): Promise<string> {
	const { stdout } = await execFileAsync("git", ["status", "--porcelain"], {
		cwd,
	});
	return stdout.trim();
}

export async function runGit(args: string[], cwd: string): Promise<string> {
	const { stdout } = await execFileAsync("git", args, { cwd });
	return stdout;
}
