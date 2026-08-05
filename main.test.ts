import { describe, expect, it, vi } from "vitest";
import {
	getCommitMessage,
	getGitVersion,
	hasGitRemote,
	initGitRepo,
	isGitInstalled,
	isGitRepo,
	setupRemoteAndFirstCommit,
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
		cb(null, { stdout: "" });
	},
}));

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
