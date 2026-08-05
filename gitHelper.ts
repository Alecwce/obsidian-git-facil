import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

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

export async function isGitRepo(cwd: string): Promise<boolean> {
	try {
		await execFileAsync("git", ["rev-parse", "--is-inside-work-tree"], { cwd });
		return true;
	} catch {
		return false;
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
