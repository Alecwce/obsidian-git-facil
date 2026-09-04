import { describe, expect, it, vi } from "vitest";
import {
	commitAndPushSelectedFiles,
	getCommitMessage,
	getCurrentBranch,
	getGitVersion,
	hasGitRemote,
	initGitRepo,
	isGitInstalled,
	isGitRepo,
	parseGitStatusPorcelain,
	parsePorcelainOutput,
	pullGitChanges,
	resolveGit,
	setupRemoteAndFirstCommit,
	syncAndAlignWithRemote,
} from "./gitHelper";
import { en } from "./i18n/en";
import { es } from "./i18n/es";
import { setLanguage, t } from "./i18n/index";

let mockFailRebase = false;

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
		if (args.includes("--abbrev-ref")) {
			cb(null, { stdout: "main\n" });
			return;
		}
		if (args[0] === "remote") {
			cb(null, { stdout: "origin" });
			return;
		}
		if (args.includes("status") && args.includes("--porcelain")) {
			cb(null, { stdout: " M main.ts\n?? note.md" });
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
		expect(res.message).toContain("exitoso");
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
});
