import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import process from "node:process";

const errors = [];
const warnings = [];

function fail(msg) {
	errors.push(msg);
}

function warn(msg) {
	warnings.push(msg);
}

function readJson(path) {
	try {
		return JSON.parse(readFileSync(path, "utf-8"));
	} catch (error) {
		fail(`${path}: no se pudo leer (${error.message})`);
		return null;
	}
}

// --- 1. manifest.json ---
const manifest = readJson("manifest.json");
if (manifest) {
	if (!/^[a-z0-9-]+$/.test(manifest.id ?? "")) {
		fail(
			`manifest id inválido: ${JSON.stringify(manifest.id)} (solo minúsculas, números y guiones)`,
		);
	}
	for (const field of ["id", "name", "description"]) {
		if (
			typeof manifest[field] === "string" &&
			manifest[field].toLowerCase().includes("obsidian")
		) {
			fail(`manifest.${field} no debe incluir "Obsidian"`);
		}
	}
	if (!/^\d+\.\d+\.\d+$/.test(manifest.version ?? "")) {
		fail(`manifest.version debe ser x.y.z sin prefijo v: ${manifest.version}`);
	}
	for (const field of ["name", "description", "author", "minAppVersion"]) {
		if (!manifest[field]) fail(`manifest.${field} es obligatorio`);
	}
	for (const field of ["authorUrl", "fundingUrl"]) {
		const url = manifest[field];
		if (typeof url === "string" && /obsidian\.md/i.test(url)) {
			fail(`manifest.${field} no debe apuntar a obsidian.md`);
		}
	}
}

// --- 2. package.json version == manifest version ---
const pkg = readJson("package.json");
if (pkg && manifest) {
	if (pkg.version !== manifest.version) {
		fail(
			`package.json (${pkg.version}) != manifest.json (${manifest.version})`,
		);
	}
	if (!pkg.scripts?.build) {
		fail(
			"package.json necesita script build (el escáner usa build/build:plugin/compile)",
		);
	} else if (!/production/.test(pkg.scripts.build)) {
		warn(`el script build no parece de producción: ${pkg.scripts.build}`);
	}
}

// --- 3. README + LICENSE ---
if (!existsSync("README.md")) {
	fail("falta README.md");
} else {
	const readme = readFileSync("README.md", "utf-8");
	if (!/us[eo]|installation|instalaci/i.test(readme)) {
		warn("README.md no menciona uso/instalación claramente");
	}
}
if (!existsSync("LICENSE")) fail("falta LICENSE");

// --- 4. Release de GitHub (requiere gh) ---
if (manifest?.version) {
	let ghOk = true;
	try {
		execFileSync("gh", ["--version"], { stdio: "ignore" });
	} catch {
		ghOk = false;
		warn("gh no disponible: se omite la verificación del release");
	}
	if (ghOk) {
		try {
			const out = execFileSync(
				"gh",
				[
					"release",
					"view",
					manifest.version,
					"--json",
					"tagName,assets",
					"-q",
					".assets.[].name",
				],
				{ encoding: "utf-8" },
			);
			const assets = out
				.split("\n")
				.map((s) => s.trim())
				.filter(Boolean);
			for (const required of ["main.js", "manifest.json"]) {
				if (!assets.includes(required)) {
					fail(
						`release ${manifest.version} sin asset requerido: ${required} (hay: ${assets.join(", ")})`,
					);
				}
			}
			if (!assets.includes("styles.css")) {
				warn(`release ${manifest.version} sin styles.css (opcional)`);
			}
		} catch {
			fail(`no existe el GitHub release con tag exacto ${manifest.version}`);
		}
	}
}

// --- Resultado ---
for (const w of warnings) console.log(`⚠️  ${w}`);
if (errors.length > 0) {
	for (const e of errors) console.error(`❌ ${e}`);
	console.error(`\nSubmission check FALLIDO (${errors.length} errores)`);
	process.exit(1);
}
console.log("✅ Submission check OK: listo para community.obsidian.md");
