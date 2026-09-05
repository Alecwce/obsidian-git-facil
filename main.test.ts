import { describe, expect, it, vi } from "vitest";
import {
	checkRemoteAuth,
	commitAndPushSelectedFiles,
	getAheadBehind,
	getCommitMessage,
	getCurrentBranch,
	getGitIdentity,
	getGitStatusResult,
	getGitVersion,
	hasOriginRemote,
	hasStagedChanges,
	hasUncommittedChanges,
	initGitRepo,
	isGitInstalled,
	isGitRepo,
	isPushRejectedMessage,
	isValidGitRemoteUrl,
	parseGitStatusPorcelain,
	parsePorcelainOutput,
	parsePorcelainZ,
	pullGitChanges,
	resolveGit,
	setupRemoteAndFirstCommit,
	syncAndAlignWithRemote,
	syncCleanTree,
} from "./gitHelper";
import { en } from "./i18n/en";
import { es } from "./i18n/es";
import { setLanguage, t } from "./i18n/index";

let mockFailRebase = false;
let mockCleanStatus = false;
let mockFailStashPop = false;
let mockNoUpstream = false;
let mockPrestaged = false;
let mockNoOrigin = false;
let mockBranch = "main";
let mockNoIdentity = false;
let mockFailAuth = false;
let mockCleanRemote = false;
const mockCalls: string[][] = [];

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

		mockCalls.push([...args]);

		if (args.includes("--version")) {
			cb(null, { stdout: "git version 2.40.0" });
			return;
		}
		if (args.includes("--is-inside-work-tree")) {
			cb(null, { stdout: "true" });
			return;
		}
		if (args.includes("--abbrev-ref")) {
			cb(null, { stdout: `${mockBranch}\n` });
			return;
		}
		if (args[0] === "remote" && args[1] === "get-url") {
			if (mockNoOrigin) {
				cb(new Error("fatal: No such remote 'origin'"), { stdout: "" });
				return;
			}
			cb(null, { stdout: "https://github.com/user/repo.git" });
			return;
		}
		if (args[0] === "rev-list") {
			if (mockNoUpstream) {
				cb(new Error("fatal: no upstream configured for branch 'main'"), {
					stdout: "",
				});
				return;
			}
			cb(null, { stdout: mockCleanRemote ? "0\t0" : "1\t2" });
			return;
		}
		if (args[0] === "config") {
			if (mockNoIdentity) {
				cb(new Error("config missing"), { stdout: "" });
				return;
			}
			cb(null, {
				stdout: args[1] === "user.name" ? "Alex Tester" : "alex@test.com",
			});
			return;
		}
		if (args[0] === "ls-remote") {
			if (mockFailAuth) {
				cb(new Error("Authentication failed"), { stdout: "" });
				return;
			}
			cb(null, { stdout: "abc123\tHEAD" });
			return;
		}
		if (args[0] === "remote") {
			cb(null, { stdout: "origin" });
			return;
		}
		if (
			args.includes("status") &&
			args.some((a) => a.startsWith("--porcelain"))
		) {
			if (mockCleanStatus) {
				cb(null, { stdout: "" });
				return;
			}
			if (args.includes("-z")) {
				cb(null, { stdout: " M main.ts\0?? note.md\0" });
				return;
			}
			cb(null, { stdout: " M main.ts\n?? note.md" });
			return;
		}
		if (args[0] === "stash") {
			if (args[1] === "pop" && mockFailStashPop) {
				cb(new Error("CONFLICT (content): stash pop failed"), { stdout: "" });
				return;
			}
			cb(null, { stdout: "" });
			return;
		}
		if (args[0] === "diff" && args.includes("--cached")) {
			if (mockPrestaged) {
				cb(new Error("staged changes present"), { stdout: "" });
				return;
			}
			cb(null, { stdout: "" });
			return;
		}
		if (args[0] === "pull") {
			if (args.includes("--rebase") && mockFailRebase) {
				cb(new Error("Conflict during rebase"), { stdout: "" });
				return;
			}
			cb(null, { stdout: "Already up to date." });
			return;
		}
		cb(null, { stdout: "" });
	},
}));

describe("Internacionalización (i18n)", () => {
	it("debería verificar que los diccionarios es y en tienen exactamente las mismas claves", () => {
		const esKeys = Object.keys(es).sort();
		const enKeys = Object.keys(en).sort();

		expect(esKeys).toEqual(enKeys);
	});

	it("debería cambiar de idioma correctamente con setLanguage y traducir plantillas", () => {
		setLanguage("es");
		expect(t("settingsHeader")).toBe("Configuración");
		expect(t("noticeError", { msg: "Prueba" })).toBe("❌ Error: Prueba");

		setLanguage("en");
		expect(t("settingsHeader")).toBe("Settings");
		expect(t("noticeError", { msg: "Test" })).toBe("❌ Error: Test");

		// Reset a español
		setLanguage("es");
	});
});

describe("resolveGit y personalización de ruta", () => {
	it("debería retornar 'git' por defecto si no se pasa ruta o es vacía", () => {
		expect(resolveGit()).toBe("git");
		expect(resolveGit("")).toBe("git");
		expect(resolveGit("   ")).toBe("git");
	});

	it("debería retornar la ruta personalizada limpia si se especifica", () => {
		expect(resolveGit("/usr/local/bin/git")).toBe("/usr/local/bin/git");
		expect(resolveGit("  C:\\Program Files\\Git\\bin\\git.exe  ")).toBe(
			"C:\\Program Files\\Git\\bin\\git.exe",
		);
	});
});

describe("parsePorcelainOutput (Renames, Unicode & File Parsing)", () => {
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

	it("debería manejar correctamente archivos con tildes, eñes y espacios", () => {
		const porcelainUnicode = [
			' M "01 Notas/Sesión de Diseño.md"',
			"?? Artículos/Años 90.md",
			'R  "antiguo nombre.md" -> "Notas/Día 1 y Más.md"',
		].join("\n");

		const parsed = parsePorcelainOutput(porcelainUnicode);

		expect(parsed).toHaveLength(3);
		expect(parsed[0]).toEqual({
			status: "M",
			path: "01 Notas/Sesión de Diseño.md",
		});
		expect(parsed[1]).toEqual({
			status: "??",
			path: "Artículos/Años 90.md",
		});
		expect(parsed[2]).toEqual({
			status: "R",
			path: "Notas/Día 1 y Más.md",
		});
	});

	it("parsePorcelainZ debería soportar NUL, renames y saltos de línea", () => {
		const raw = " M main.ts\0?? nota con espacios.md\0R  nuevo.md\0viejo.md\0";
		expect(parsePorcelainZ(raw)).toEqual([
			{ status: "M", path: "main.ts" },
			{ status: "??", path: "nota con espacios.md" },
			{ status: "R", path: "nuevo.md" },
		]);
		const tricky = "?? línea1\nlínea2.md\0";
		expect(parsePorcelainZ(tricky)).toEqual([
			{ status: "??", path: "línea1\nlínea2.md" },
		]);
		expect(parsePorcelainZ("")).toEqual([]);
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
		mockCalls.length = 0;
		const res = await commitAndPushSelectedFiles(
			"/fake/path",
			["main.ts"],
			"commit msg",
		);
		expect(res.success).toBe(true);
		expect(res.message).toContain("exitoso");
		// Sin staged ajeno: sin stash en la secuencia
		expect(mockCalls.some((c) => c[0] === "stash")).toBe(false);
	});

	it("debería proteger staged ajenos: stash --staged, add, commit, push, pop", async () => {
		mockPrestaged = true;
		mockFailStashPop = false;
		mockCalls.length = 0;
		const res = await commitAndPushSelectedFiles(
			"/fake/path",
			["main.ts"],
			"commit msg",
		);
		expect(res.success).toBe(true);
		const seq = mockCalls.map((c) => c.slice(0, 2).join(" "));
		expect(seq).toEqual([
			"diff --cached",
			"stash push",
			"add --",
			"commit -m",
			"push",
			"stash pop",
		]);
		mockPrestaged = false;
	});

	it("debería detectar staged ajenos con hasStagedChanges", async () => {
		mockPrestaged = true;
		expect(await hasStagedChanges("/fake/path")).toBe(true);
		mockPrestaged = false;
		expect(await hasStagedChanges("/fake/path")).toBe(false);
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

	it("debería obtener la rama actual", async () => {
		const branch = await getCurrentBranch("/fake/path");
		expect(branch).toBe("main");
	});

	it("debería ejecutar syncAndAlignWithRemote con pull rebase de forma segura", async () => {
		mockFailRebase = false;
		const res = await syncAndAlignWithRemote("/fake/path");
		expect(res.success).toBe(true);
		expect(res.message).toContain("alineada");
	});

	it("debería manejar y abortar rebase limpiamente si ocurre un conflicto", async () => {
		mockFailRebase = true;
		const res = await syncAndAlignWithRemote("/fake/path");
		expect(res.success).toBe(false);
		expect(res.message).toContain("Conflict during rebase");
		mockFailRebase = false;
	});

	it("debería sincronizar sin stash cuando el árbol está limpio", async () => {
		mockCleanStatus = true;
		mockFailRebase = false;
		mockFailStashPop = false;
		const dirty = await hasUncommittedChanges("/fake/path");
		expect(dirty).toBe(false);
		const res = await syncAndAlignWithRemote("/fake/path");
		expect(res.success).toBe(true);
		mockCleanStatus = false;
	});

	it("debería reportar conflicto honesto si el stash pop falla tras push", async () => {
		mockCleanStatus = false;
		mockFailRebase = false;
		mockFailStashPop = true;
		const res = await syncAndAlignWithRemote("/fake/path");
		expect(res.success).toBe(false);
		expect(res.message).toContain("stash");
		mockFailStashPop = false;
	});

	it("debería distinguir ok vs error en getGitStatusResult (no falso limpio)", async () => {
		const res = await getGitStatusResult("/fake/path");
		expect(res.ok).toBe(true);
		expect(res.files).toHaveLength(2);
		expect(res.error).toBeUndefined();
	});

	it("debería detectar mensajes de push rechazado de forma centralizada", () => {
		expect(isPushRejectedMessage("error: failed to push some refs")).toBe(true);
		expect(
			isPushRejectedMessage("! [rejected] main -> main (fetch first)"),
		).toBe(true);
		expect(isPushRejectedMessage("non-fast-forward")).toBe(true);
		expect(isPushRejectedMessage("Everything up-to-date")).toBe(false);
	});

	it("debería reportar ahead/behind contra el upstream", async () => {
		mockNoUpstream = false;
		const res = await getAheadBehind("/fake/path");
		expect(res).toEqual({ ahead: 2, behind: 1, hasUpstream: true });
	});

	it("debería marcar sin upstream cuando rev-list falla", async () => {
		mockNoUpstream = true;
		const res = await getAheadBehind("/fake/path");
		expect(res).toEqual({ ahead: 0, behind: 0, hasUpstream: false });
		mockNoUpstream = false;
	});

	it("debería formatear la línea de rama con i18n ES/EN", () => {
		setLanguage("es");
		expect(
			t("statusPanelBranchLine", { branch: "main", ahead: 2, behind: 1 }),
		).toBe("main ↑2 ↓1");
		expect(t("statusPanelBranchNoUpstream", { branch: "main" })).toBe(
			"main (sin remoto)",
		);
		setLanguage("en");
		expect(t("statusPanelBranchNoUpstream", { branch: "main" })).toBe(
			"main (no remote)",
		);
		setLanguage("es");
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
		expect(res.message).toContain("repositorio Git");
	});

	it("debería distinguir origin de otros remotos", async () => {
		mockNoOrigin = false;
		expect(await hasOriginRemote("/fake/path")).toBe(true);
		mockNoOrigin = true;
		expect(await hasOriginRemote("/fake/path")).toBe(false);
		mockNoOrigin = false;
	});

	it("debería empujar a la rama actual, no asumir main", async () => {
		mockBranch = "notes";
		mockCalls.length = 0;
		const res = await setupRemoteAndFirstCommit(
			"/fake/path",
			"https://github.com/user/repo.git",
			"initial commit",
		);
		expect(res.success).toBe(true);
		const push = mockCalls.find((c) => c[0] === "push");
		expect(push).toEqual(["push", "-u", "origin", "notes"]);
		mockBranch = "main";
	});

	it("debería retornar error si la URL remota está vacía", async () => {
		const res = await setupRemoteAndFirstCommit(
			"/fake/path",
			"",
			"initial commit",
		);
		expect(res.success).toBe(false);
		expect(res.message).toContain("ingresa la URL");
	});

	it("debería conectar el remoto y completar el proceso", async () => {
		const res = await setupRemoteAndFirstCommit(
			"/fake/path",
			"https://github.com/user/repo.git",
			"initial commit",
		);
		expect(res.success).toBe(true);
		expect(res.message).toContain("exitosamente");
	});

	it("debería rechazar URLs remotas inválidas sin tocar git", async () => {
		for (const bad of [
			"ftp://github.com/user/repo.git",
			"--upload-pack=evil",
			"not a url",
			"https://",
		]) {
			const res = await setupRemoteAndFirstCommit(
				"/fake/path",
				bad,
				"initial commit",
			);
			expect(res.success).toBe(false);
		}
	});

	it("debería validar URLs https y ssh correctamente", () => {
		expect(isValidGitRemoteUrl("https://github.com/user/repo.git")).toBe(true);
		expect(isValidGitRemoteUrl("https://github.com/user/repo")).toBe(true);
		expect(isValidGitRemoteUrl("git@github.com:user/repo.git")).toBe(true);
		expect(isValidGitRemoteUrl("ftp://github.com/user/repo.git")).toBe(false);
		expect(isValidGitRemoteUrl("--upload-pack=evil")).toBe(false);
		expect(isValidGitRemoteUrl("   ")).toBe(false);
	});
});

describe("sync real con árbol limpio y preflight", () => {
	it("debería bajar cambios remotos aunque no haya nada local", async () => {
		mockCleanRemote = false;
		mockFailRebase = false;
		mockCalls.length = 0;
		const res = await syncCleanTree("/fake/path");
		expect(res.pulled).toBe(true);
		expect(res.behind).toBe(1);
		expect(mockCalls.some((c) => c[0] === "fetch")).toBe(true);
		expect(mockCalls.some((c) => c[0] === "pull")).toBe(true);
	});

	it("debería no hacer pull si el remoto está al día", async () => {
		mockCleanRemote = true;
		mockCalls.length = 0;
		const res = await syncCleanTree("/fake/path");
		expect(res.pulled).toBe(false);
		expect(mockCalls.some((c) => c[0] === "pull")).toBe(false);
		mockCleanRemote = false;
	});

	it("debería reportar error honesto si el pull del árbol limpio falla", async () => {
		mockCleanRemote = false;
		mockFailRebase = true;
		const res = await syncCleanTree("/fake/path");
		expect(res.pulled).toBe(false);
		expect(res.error).toContain("Conflict during rebase");
		mockFailRebase = false;
	});

	it("debería leer la identidad Git configurada", async () => {
		mockNoIdentity = false;
		const id = await getGitIdentity("/fake/path");
		expect(id).toEqual({ name: "Alex Tester", email: "alex@test.com" });
		mockNoIdentity = true;
		const empty = await getGitIdentity("/fake/path");
		expect(empty).toEqual({ name: "", email: "" });
		mockNoIdentity = false;
	});

	it("debería verificar auth del remoto sin tocar la config", async () => {
		mockFailAuth = false;
		mockCalls.length = 0;
		const ok = await checkRemoteAuth("https://github.com/user/repo.git");
		expect(ok.ok).toBe(true);
		expect(mockCalls.some((c) => c[0] === "ls-remote")).toBe(true);
		mockFailAuth = true;
		const bad = await checkRemoteAuth("https://github.com/user/repo.git");
		expect(bad.ok).toBe(false);
		mockFailAuth = false;
		const invalid = await checkRemoteAuth("not a url");
		expect(invalid.ok).toBe(false);
	});
});
