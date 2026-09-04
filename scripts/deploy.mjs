import { existsSync, readFileSync } from "node:fs";
import { copyFile, mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import process from "node:process";

// Intentar leer .env si existe de manera nativa sin dependencias extra
function loadEnv() {
	if (existsSync(".env")) {
		try {
			const envContent = readFileSync(".env", "utf-8");
			for (const line of envContent.split("\n")) {
				const trimmed = line.trim();
				if (!trimmed || trimmed.startsWith("#")) continue;
				const [key, ...vals] = trimmed.split("=");
				if (key && !process.env[key.trim()]) {
					process.env[key.trim()] = vals
						.join("=")
						.trim()
						.replace(/^["']|["']$/g, "");
				}
			}
		} catch {
			// Ignorar si no se puede leer
		}
	}
}

loadEnv();

function getDestinationDir() {
	// 1. Argumento por línea de comandos: node scripts/deploy.mjs <ruta>
	if (process.argv[2]) {
		return resolve(process.argv[2]);
	}

	// 2. Variable de entorno explícita para la carpeta del plugin
	if (process.env.DEST_DIR) {
		return resolve(process.env.DEST_DIR);
	}

	// 3. Variable de entorno para la raíz del Vault
	if (process.env.OBSIDIAN_VAULT_PATH) {
		const vault = process.env.OBSIDIAN_VAULT_PATH;
		if (vault.includes(".obsidian")) {
			return resolve(vault);
		}
		return resolve(join(vault, ".obsidian", "plugins", "git-facil"));
	}

	// 4. Fallback legacy solo en Windows
	if (process.platform === "win32") {
		return "D:\\z\\OBS\\MI CEREBRO II\\.obsidian\\plugins\\git-facil";
	}

	return null;
}

const DEST_DIR = getDestinationDir();
const FILES_TO_COPY = ["main.js", "manifest.json", "styles.css"];

async function deploy() {
	if (!DEST_DIR) {
		console.error(
			"❌ No se encontró la ruta de destino para el despliegue.\n" +
				"👉 Por favor define la variable OBSIDIAN_VAULT_PATH en tu entorno o en un archivo .env\n" +
				"   Ejemplo en .env: OBSIDIAN_VAULT_PATH=/home/usuario/MiVault\n" +
				"   O pasa la ruta por parámetro: node scripts/deploy.mjs /ruta/al/vault",
		);
		process.exit(1);
	}

	try {
		console.log(`📂 Creando directorio de destino: ${DEST_DIR}`);
		await mkdir(DEST_DIR, { recursive: true });

		for (const file of FILES_TO_COPY) {
			const targetPath = join(DEST_DIR, file);
			console.log(`📋 Copiando ${file} -> ${targetPath}`);
			await copyFile(file, targetPath);
		}

		console.log("✅ Despliegue completado con éxito.");
	} catch (error) {
		console.error("❌ Error durante el despliegue:", error);
		process.exit(1);
	}
}

deploy();
