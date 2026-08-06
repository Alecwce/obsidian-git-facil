import { describe, expect, it, vi } from "vitest";
import {
	commitAndPushSelectedFiles,
	getCommitMessage,
	getGitVersion,
	hasGitRemote,
	initGitRepo,
	isGitInstalled,
	isGitRepo,
	parseGitStatusPorcelain,
	parsePorcelainOutput,
	pullGitChanges,
	setupRemoteAndFirstCommit,
	syncAndAlignWithRemote,
} from "./gitHelper";

vi.mock("node:child_process", () => ({
	execFile: (
		_file: string,
		args: string[],
		options: unknown,
		callback?: (err: Error | null, stdout: { stdout: string }) => void,
	) => {
		const cb = (typeof options === "function" ? options : callback) as (
			err: Error | null,
			stdout: { stdout: string },
		) => void;

		if (args.includes("--version")) {
			cb(null, { stdout: "git version 2.40.0" });
			return;
		}
		if (args.includes("--is-inside-work-tree")) {
			cb(null, { stdout: "true" });
			return;
		}
		if (args[0] === "remote") {
			cb(null, { stdout: "origin" });
			return;
		}
		if (args.includes("--porcelain")) {
			cb(null, { stdout: " M main.ts\n?? note.md" });
			return;
		}
		if (args[0] === "pull") {
			cb(null, { stdout: "Already up to date." });
			return;
		}
		cb(null, { stdout: "" });
	},
}));

describe("parsePorcelainOutput (Renames & File Parsing)", () => {
	it("debería manejar casos M, ??, D y R con flecha (renames)", () => {
		const porcelainRaw = [
			" M src/main.ts",
			"?? new-note.md",
			" D deleted.txt",
			"R  old-name.md -> new-name.md",
		].join("\n");

		const parsed = parsePorcelainOutput(porcelainRaw);

		expect(parsed).toHaveLength(4);
		expect(parsed[0]).toEqual({ status: "M", path: "src/main.ts" });
		expect(parsed[1]).toEqual({ status: "??", path: "new-note.md" });
		expect(parsed[2]).toEqual({ status: "D", path: "deleted.txt" });
		expect(parsed[3]).toEqual({ status: "R", path: "new-name.md" });
	});
});

describe("getCommitMessage", () => {
	it("debería usar la plantilla por defecto {fecha}", () => {
		const testDate = new Date(2026, 7, 4, 17, 45, 0);
		const message = getCommitMessage(undefined, testDate);
		expect(message).toBe("📝 notas 2026-08-04 17:45");
	});

	it("debería permitir plantillas personalizadas", () => {
		const testDate = new Date(2026, 7, 4, 17, 45, 0);
		const message = getCommitMessage("Backup diario - {fecha}", testDate);
		expect(message).toBe("Backup diario - 2026-08-04 17:45");
	});
});

describe("gitHelper panel lateral y anti-pánico", () => {
	it("debería parsear el estado de git porcelain correctamente", async () => {
		const files = await parseGitStatusPorcelain("/fake/path");
		expect(files).toHaveLength(2);
		expect(files[0]).toEqual({ status: "M", path: "main.ts" });
		expect(files[1]).toEqual({ status: "??", path: "note.md" });
	});

	it("debería hacer commit y push de archivos marcados", async () => {
		const res = await commitAndPushSelectedFiles(
			"/fake/path",
			["main.ts"],
			"commit msg",
		);
		expect(res.success).toBe(true);
		expect(res.message).toContain("Commit y push de los archivos marcados");
	});

	it("debería retornar error si no se selecciona ningún archivo", async () => {
		const res = await commitAndPushSelectedFiles(
			"/fake/path",
			[],
			"commit msg",
		);
		expect(res.success).toBe(false);
		expect(res.message).toContain("Selecciona al menos un archivo");
	});

	it("debería hacer pull de cambios y detectar cuando está actualizado", async () => {
		const res = await pullGitChanges("/fake/path");
		expect(res.success).toBe(true);
		expect(res.message).toBe("✅ Sin cambios nuevos");
	});

	it("debería ejecutar syncAndAlignWithRemote (botón anti-pánico)", async () => {
		const res = await syncAndAlignWithRemote("/fake/path");
		expect(res.success).toBe(true);
		expect(res.message).toContain("Historia alineada con GitHub");
	});
});

describe("gitHelper comprobaciones de entorno y wizard", () => {
	it("debería detectar si git está instalado", async () => {
		const installed = await isGitInstalled();
		expect(installed).toBe(true);
	});

	it("debería obtener la versión de git", async () => {
		const res = await getGitVersion();
		expect(res.success).toBe(true);
		expect(res.version).toContain("git version 2.40.0");
	});

	it("debería detectar si la carpeta es un repositorio git", async () => {
		const repo = await isGitRepo("/fake/path");
		expect(repo).toBe(true);
	});

	it("debería responder adecuadamente al crear un repositorio existente", async () => {
		const res = await initGitRepo("/fake/path");
		expect(res.success).toBe(true);
		expect(res.message).toBe("Ya es un repositorio Git ✅");
	});

	it("debería detectar si el repositorio tiene remote", async () => {
		const remote = await hasGitRemote("/fake/path");
		expect(remote).toBe(true);
	});

	it("debería retornar error si la URL remota está vacía", async () => {
		const res = await setupRemoteAndFirstCommit(
			"/fake/path",
			"",
			"initial commit",
		);
		expect(res.success).toBe(false);
		expect(res.message).toContain("Por favor ingresa la URL");
	});

	it("debería conectar el remoto y completar el proceso", async () => {
		const res = await setupRemoteAndFirstCommit(
			"/fake/path",
			"https://github.com/user/repo.git",
			"initial commit",
		);
		expect(res.success).toBe(true);
		expect(res.message).toContain(
			"Conectado y primer commit subido exitosamente",
		);
	});
});
