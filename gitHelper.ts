import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export function getCommitMessage(date: Date = new Date()): string {
	const pad = (n: number) => n.toString().padStart(2, "0");
	const year = date.getFullYear();
	const month = pad(date.getMonth() + 1);
	const day = pad(date.getDate());
	const hours = pad(date.getHours());
	const minutes = pad(date.getMinutes());

	return `📝 notas ${year}-${month}-${day} ${hours}:${minutes}`;
}

export async function runGit(args: string[], cwd: string): Promise<string> {
	const { stdout } = await execFileAsync("git", args, { cwd });
	return stdout;
}

export async function checkGitStatusPorcelain(cwd: string): Promise<string> {
	const stdout = await runGit(["status", "--porcelain"], cwd);
	return stdout.trim();
}
