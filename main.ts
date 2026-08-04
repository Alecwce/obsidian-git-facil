import { Notice, Plugin } from "obsidian";
import { checkGitStatusPorcelain, getCommitMessage, runGit } from "./gitHelper";

interface FileAdapter {
	getBasePath?: () => string;
}

export default class GitFacilPlugin extends Plugin {
	override async onload() {
		console.log("Cargando plugin Git Fácil");

		const executeCommitAndPush = async () => {
			await this.handleCommitAndPush();
		};

		this.addRibbonIcon("rocket", "Git Fácil", executeCommitAndPush);

		this.addCommand({
			id: "commit-and-push",
			name: "Git Fácil: Commit y Push",
			callback: executeCommitAndPush,
		});
	}

	override onunload() {
		console.log("Desinstalando plugin Git Fácil");
	}

	private async handleCommitAndPush(): Promise<void> {
		try {
			const adapter = this.app.vault.adapter as FileAdapter;
			const basePath = adapter.getBasePath?.() ?? "";
			if (!basePath) {
				new Notice("❌ Error: No se pudo obtener la ruta de la bóveda.");
				return;
			}

			const status = await checkGitStatusPorcelain(basePath);
			if (!status) {
				new Notice("Nada que subir ✅");
				return;
			}

			new Notice("Comitiendo...");

			await runGit(["add", "-A"], basePath);
			const commitMessage = getCommitMessage();
			await runGit(["commit", "-m", commitMessage], basePath);
			await runGit(["push"], basePath);

			new Notice("✅ Commit y push exitosos");
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			new Notice(`❌ Error: ${message}`);
		}
	}
}
