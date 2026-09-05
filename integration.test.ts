import { execFileSync } from "node:child_process";
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
	commitAndPushSelectedFiles,
	getAheadBehind,
	getCurrentBranch,
	getGitIdentity,
	getGitStatusResult,
	hasOriginRemote,
	initGitRepo,
	parseGitStatusPorcelain,
	syncAndAlignWithRemote,
	syncCleanTree,
} from "./gitHelper";

const BASE_FLAGS = [
	"-c",
	"user.name=GitFacil Test",
	"-c",
	"user.email=test@gitfacil.dev",
	"-c",
	"init.defaultBranch=main",
	"-c",
	"commit.gpgsign=false",
];

function git(args: string[], cwd: string): string {
	return execFileSync("git", [...BASE_FLAGS, ...args], {
		cwd,
		encoding: "utf-8",
		timeout: 60_000,
	});
}

function makeRepo(): { dir: string; remote: string } {
	const root = mkdtempSync(join(tmpdir(), "gitfacil-"));
	const remote = join(root, "remote.git");
	const dir = join(root, "local");
	execFileSync("git", ["init", "--bare", remote], { timeout: 60_000 });
	// El bare nace con HEAD en master inexistente: apuntarlo a main para
	// que los clones arranquen en la rama correcta (como hacen los forges).
	execFileSync(
		"git",
		["--git-dir", remote, "symbolic-ref", "HEAD", "refs/heads/main"],
		{
			timeout: 60_000,
		},
	);
	execFileSync("git", ["init", "-b", "main", dir], { timeout: 60_000 });
	git(["config", "user.name", "GitFacil Test"], dir);
	git(["config", "user.email", "test@gitfacil.dev"], dir);
	git(["config", "commit.gpgsign", "false"], dir);
	return { dir, remote };
}

function commitFile(dir: string, name: string, content: string, msg: string) {
	writeFileSync(join(dir, name), content);
	git(["add", name], dir);
	git(["commit", "-m", msg], dir);
}

function cleanup(path: string) {
	rmSync(path, { recursive: true, force: true });
}

function rootOf(dir: string): string {
	return join(dir, "..");
}

let gitAvailable = false;
try {
	execFileSync("git", ["--version"], { stdio: "ignore", timeout: 10_000 });
	gitAvailable = true;
} catch {
	gitAvailable = false;
}

describe.skipIf(!gitAvailable)("integration con git real", () => {
	it("initGitRepo crea repo real", async () => {
		const root = mkdtempSync(join(tmpdir(), "gitfacil-"));
		try {
			const vault = join(root, "vault");
			mkdirSync(vault);
			const res = await initGitRepo(vault);
			expect(res.success).toBe(true);
			expect(existsSync(join(vault, ".git"))).toBe(true);
			const again = await initGitRepo(vault);
			expect(again.success).toBe(true);
		} finally {
			cleanup(root);
		}
	});

	it("detecta archivos unicode y renombres", async () => {
		const { dir } = makeRepo();
		try {
			commitFile(dir, "Sesión de Diseño.md", "hola", "base");
			writeFileSync(join(dir, "Notas nuevas.md"), "x");
			git(["mv", "Sesión de Diseño.md", "Renombrada.md"], dir);
			const files = await parseGitStatusPorcelain(dir);
			const paths = files.map((f) => f.path);
			expect(paths).toContain("Notas nuevas.md");
			expect(paths).toContain("Renombrada.md");
		} finally {
			cleanup(rootOf(dir));
		}
	});

	it("detecta nombres infernales con salto de línea (formato -z)", async () => {
		const { dir } = makeRepo();
		try {
			commitFile(dir, "base.md", "b", "base");
			const evil = "línea1\nlínea2.md";
			writeFileSync(join(dir, evil), "x");
			const res = await getGitStatusResult(dir);
			expect(res.ok).toBe(true);
			expect(res.files.map((f) => f.path)).toContain(evil);
		} finally {
			cleanup(rootOf(dir));
		}
	});

	it("commit seleccionado sube B y restaura A staged", async () => {
		const { dir, remote } = makeRepo();
		try {
			commitFile(dir, "base.md", "b", "base");
			git(["remote", "add", "origin", remote], dir);
			git(["push", "-u", "origin", "main"], dir);
			writeFileSync(join(dir, "a-secreto.md"), "a");
			git(["add", "a-secreto.md"], dir);
			writeFileSync(join(dir, "b-nota.md"), "b");
			const res = await commitAndPushSelectedFiles(
				dir,
				["b-nota.md"],
				"sube B",
			);
			expect(res.success).toBe(true);
			const log = git(["log", "--format=%s", "-1"], dir);
			expect(log.trim()).toBe("sube B");
			const show = git(["show", "--name-only", "--format=", "HEAD"], dir);
			expect(show).toContain("b-nota.md");
			expect(show).not.toContain("a-secreto.md");
			// A sigue staged tras el pop
			const staged = git(["diff", "--cached", "--name-only"], dir);
			expect(staged).toContain("a-secreto.md");
		} finally {
			cleanup(rootOf(dir));
		}
	});

	it("push rechazado real cuando el remoto avanza por otro lado", async () => {
		const { dir, remote } = makeRepo();
		try {
			commitFile(dir, "base.md", "b", "base");
			git(["remote", "add", "origin", remote], dir);
			git(["push", "-u", "origin", "main"], dir);
			// Otro clon avanza el remoto
			const other = join(rootOf(dir), "other");
			git(["clone", remote, other], rootOf(dir));
			git(["checkout", "-B", "main"], other);
			writeFileSync(join(other, "otro.md"), "x");
			git(["add", "."], other);
			git(["commit", "-m", "otro"], other);
			git(["push", "origin", "main"], other);
			// Local commitea otra cosa e intenta push
			writeFileSync(join(dir, "local.md"), "y");
			const res = await commitAndPushSelectedFiles(dir, ["local.md"], "local");
			expect(res.success).toBe(false);
			expect(res.pushRejected).toBe(true);
			cleanup(other);
		} finally {
			cleanup(rootOf(dir));
		}
	});

	it("rama distinta de main y ahead/behind reales", async () => {
		const { dir, remote } = makeRepo();
		try {
			commitFile(dir, "base.md", "b", "base");
			git(["remote", "add", "origin", remote], dir);
			git(["checkout", "-b", "notes"], dir);
			expect(await getCurrentBranch(dir)).toBe("notes");
			git(["push", "-u", "origin", "notes"], dir);
			writeFileSync(join(dir, "nueva.md"), "x");
			git(["add", "."], dir);
			git(["commit", "-m", "una mas"], dir);
			const ab = await getAheadBehind(dir);
			expect(ab.hasUpstream).toBe(true);
			expect(ab.ahead).toBe(1);
			expect(await hasOriginRemote(dir)).toBe(true);
		} finally {
			cleanup(rootOf(dir));
		}
	});

	it("syncCleanTree baja cambios con árbol limpio", async () => {
		const { dir, remote } = makeRepo();
		try {
			commitFile(dir, "base.md", "b", "base");
			git(["remote", "add", "origin", remote], dir);
			git(["push", "-u", "origin", "main"], dir);
			const other = join(rootOf(dir), "other");
			git(["clone", remote, other], rootOf(dir));
			git(["checkout", "-B", "main"], other);
			writeFileSync(join(other, "remota.md"), "x");
			git(["add", "."], other);
			git(["commit", "-m", "remota"], other);
			git(["push", "origin", "main"], other);
			const res = await syncCleanTree(dir);
			expect(res.pulled).toBe(true);
			expect(res.behind).toBe(1);
			cleanup(other);
		} finally {
			cleanup(rootOf(dir));
		}
	});

	it("syncAndAlignWithRemote con stash real", async () => {
		const { dir, remote } = makeRepo();
		try {
			commitFile(dir, "base.md", "b", "base");
			git(["remote", "add", "origin", remote], dir);
			git(["push", "-u", "origin", "main"], dir);
			writeFileSync(join(dir, "pendiente.md"), "p");
			const res = await syncAndAlignWithRemote(dir);
			expect(res.success).toBe(true);
		} finally {
			cleanup(rootOf(dir));
		}
	});

	it("identidad git real", async () => {
		const { dir } = makeRepo();
		try {
			const id = await getGitIdentity(dir);
			expect(id).toEqual({
				name: "GitFacil Test",
				email: "test@gitfacil.dev",
			});
		} finally {
			cleanup(rootOf(dir));
		}
	});
});
