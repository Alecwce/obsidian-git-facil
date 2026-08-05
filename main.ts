import { type App, Notice, Plugin, PluginSettingTab, Setting } from "obsidian";
import {
	checkGitStatusPorcelain,
	getCommitMessage,
	hasGitRemote,
	isGitInstalled,
	isGitRepo,
	runGit,
} from "./gitHelper";

export interface GitFacilSettings {
	commitMessageTemplate: string;
	autoSyncEnabled: boolean;
	autoSyncIntervalMinutes: number;
}

export const DEFAULT_SETTINGS: GitFacilSettings = {
	commitMessageTemplate: "📝 notas {fecha}",
	autoSyncEnabled: false,
	autoSyncIntervalMinutes: 10,
};

export default class GitFacilPlugin extends Plugin {
	settings: GitFacilSettings = DEFAULT_SETTINGS;
	private syncIntervalId: number | null = null;

	override async onload() {
		console.log("Cargando plugin Git Fácil");
		await this.loadSettings();

		const executeCommitAndPush = async () => {
			await this.handleCommitAndPush();
		};

		this.addRibbonIcon("rocket", "Git Fácil", executeCommitAndPush);

		this.addCommand({
			id: "commit-and-push",
			name: "Git Fácil: Commit y Push",
			callback: executeCommitAndPush,
		});

		this.addSettingTab(new GitFacilSettingTab(this.app, this));
		this.configureAutoSync();
	}

	override onunload() {
		console.log("Desinstalando plugin Git Fácil");
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
		this.configureAutoSync();
	}

	configureAutoSync() {
		if (this.syncIntervalId !== null) {
			window.clearInterval(this.syncIntervalId);
			this.syncIntervalId = null;
		}

		if (
			this.settings.autoSyncEnabled &&
			this.settings.autoSyncIntervalMinutes > 0
		) {
			const intervalMs = this.settings.autoSyncIntervalMinutes * 60 * 1000;
			this.syncIntervalId = this.registerInterval(
				window.setInterval(() => {
					void this.handleCommitAndPush(true);
				}, intervalMs),
			);
		}
	}

	private async handleCommitAndPush(isAutoSync = false): Promise<void> {
		try {
			const adapter = this.app.vault.adapter as { getBasePath?: () => string };
			const basePath = adapter.getBasePath?.() ?? "";
			if (!basePath) {
				new Notice("❌ Error: No se pudo obtener la ruta de la bóveda.");
				return;
			}

			const installed = await isGitInstalled();
			if (!installed) {
				new Notice("❌ No se encontró Git. Descárgalo de https://git-scm.com");
				return;
			}

			const inRepo = await isGitRepo(basePath);
			if (!inRepo) {
				new Notice(
					"❌ Tu bóveda no es un repositorio Git.\nEjecuta en la terminal de tu bóveda: git init",
				);
				return;
			}

			const remoteExists = await hasGitRemote(basePath);
			if (!remoteExists) {
				new Notice(
					"❌ No hay remote. Ejecuta: git remote add origin <URL-de-tu-repo>",
				);
				return;
			}

			const status = await checkGitStatusPorcelain(basePath);
			if (!status) {
				if (!isAutoSync) {
					new Notice("Nada que subir ✅");
				}
				return;
			}

			new Notice("Comitiendo...");

			await runGit(["add", "-A"], basePath);
			const commitMessage = getCommitMessage(
				this.settings.commitMessageTemplate,
			);
			await runGit(["commit", "-m", commitMessage], basePath);
			await runGit(["push"], basePath);

			new Notice("✅ Commit y push exitosos");
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			new Notice(`❌ Error: ${message}`);
		}
	}
}

class GitFacilSettingTab extends PluginSettingTab {
	plugin: GitFacilPlugin;

	constructor(app: App, plugin: GitFacilPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		containerEl.createEl("h2", { text: "Configuración de Git Fácil" });

		new Setting(containerEl)
			.setName("Plantilla del mensaje de commit")
			.setDesc("Usa {fecha} para insertar automáticamente la fecha y hora.")
			.addText((text) =>
				text
					.setPlaceholder("📝 notas {fecha}")
					.setValue(this.plugin.settings.commitMessageTemplate)
					.onChange(async (value) => {
						this.plugin.settings.commitMessageTemplate = value;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("Auto-sync")
			.setDesc("Sincroniza automáticamente los cambios a intervalos regulares.")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.autoSyncEnabled)
					.onChange(async (value) => {
						this.plugin.settings.autoSyncEnabled = value;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("Intervalo de Auto-sync (minutos)")
			.setDesc("Tiempo en minutos entre cada sincronización automática.")
			.addText((text) =>
				text
					.setPlaceholder("10")
					.setValue(String(this.plugin.settings.autoSyncIntervalMinutes))
					.onChange(async (value) => {
						const num = Number.parseInt(value, 10);
						if (!Number.isNaN(num) && num > 0) {
							this.plugin.settings.autoSyncIntervalMinutes = num;
							await this.plugin.saveSettings();
						}
					}),
			);
	}
}
