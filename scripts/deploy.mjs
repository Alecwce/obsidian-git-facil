import { copyFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import process from "node:process";

const DEST_DIR =
	"D:\\z\\OBS\\MI CEREBRO II\\.obsidian\\plugins\\obsidian-git-facil";
const FILES_TO_COPY = ["main.js", "manifest.json", "styles.css"];

async function deploy() {
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
