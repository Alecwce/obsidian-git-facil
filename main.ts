import {
	type App,
	ItemView,
	Modal,
	Notice,
	Plugin,
	PluginSettingTab,
	Setting,
	type WorkspaceLeaf,
} from "obsidian";
import {
	checkGitStatusPorcelain,
	commitAndPushSelectedFiles,
	getCommitMessage,
	getGitVersion,
	hasGitRemote,
	initGitRepo,
	isGitInstalled,
	isGitRepo,
	parseGitStatusPorcelain,
	pullGitChanges,
	runGit,
	setupRemoteAndFirstCommit,
} from "./gitHelper";

export const GIT_STATUS_VIEW_TYPE = "git-facil-status-view";

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
		await this.loadSettings();

		const executeCommitAndPush = async () => {
			await this.handleCommitAndPush();
		};

		this.addRibbonIcon("rocket", "GitFacil", executeCommitAndPush);

		this.registerView(
			GIT_STATUS_VIEW_TYPE,
			(leaf) => new GitStatusView(leaf, this),
		);

		this.addRibbonIcon("git-compare", "Estado de Git", () => {
			void this.activateView();
		});

		this.addCommand({
			id: "commit-and-push",
			name: "Commit y Push",
			callback: executeCommitAndPush,
		});

		this.addCommand({
			id: "open-git-status-view",
			name: "Abrir panel de Estado de Git",
			callback: () => {
				void this.activateView();
			},
		});

		this.addSettingTab(new GitFacilSettingTab(this.app, this));
		this.configureAutoSync();
	}

	override onunload() {}

	async loadSettings() {
		const loadedData: unknown = await this.loadData();
		if (typeof loadedData === "object" && loadedData !== null) {
			this.settings = Object.assign({}, DEFAULT_SETTINGS, loadedData);
		} else {
			this.settings = Object.assign({}, DEFAULT_SETTINGS);
		}
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

	async activateView() {
		const { workspace } = this.app;
		let leaf: WorkspaceLeaf | null = null;
		const leaves = workspace.getLeavesOfType(GIT_STATUS_VIEW_TYPE);

		if (leaves.length > 0) {
			leaf = leaves[0];
		} else {
			leaf = workspace.getRightLeaf(false);
			if (leaf) {
				await leaf.setViewState({
					type: GIT_STATUS_VIEW_TYPE,
					active: true,
				});
			}
		}

		if (leaf) {
			void workspace.revealLeaf(leaf);
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

export class GitStatusView extends ItemView {
	private plugin: GitFacilPlugin;
	private selectedFiles: Set<string> = new Set();

	constructor(leaf: WorkspaceLeaf, plugin: GitFacilPlugin) {
		super(leaf);
		this.plugin = plugin;
	}

	getViewType(): string {
		return GIT_STATUS_VIEW_TYPE;
	}

	getDisplayText(): string {
		return "Estado de Git";
	}

	override getIcon(): string {
		return "git-compare";
	}

	override async onOpen() {
		await this.refreshView();
	}

	async refreshView() {
		const { containerEl } = this;
		containerEl.empty();
		containerEl.addClass("git-facil-status-view");

		const header = containerEl.createDiv({ cls: "status-view-header" });
		header.createEl("h3", { text: "📊 Estado de Git" });

		const controls = containerEl.createDiv({ cls: "status-view-actions" });

		const btnRefresh = controls.createEl("button", {
			text: "🔄 Actualizar lista",
		});
		btnRefresh.addEventListener("click", () => {
			void this.refreshView();
		});

		const btnPull = controls.createEl("button", {
			text: "⬇️ Bajar cambios (Pull)",
		});
		btnPull.addEventListener("click", () => {
			void (async () => {
				const basePath = this.getBasePath();
				if (!basePath) return;
				new Notice("Bajando cambios...");
				const res = await pullGitChanges(basePath);
				new Notice(res.message);
				await this.refreshView();
			})();
		});

		const basePath = this.getBasePath();
		if (!basePath) {
			containerEl.createDiv({
				text: "❌ No se pudo obtener la ruta de la bóveda",
				cls: "wizard-error",
			});
			return;
		}

		const changedFiles = await parseGitStatusPorcelain(basePath);

		if (changedFiles.length === 0) {
			const emptyState = containerEl.createDiv({ cls: "status-empty-state" });
			emptyState.createEl("h2", { text: "Todo limpio ✅" });
			emptyState.createEl("p", {
				text: "No hay cambios pendientes por guardar o subir.",
			});
			return;
		}

		// Seleccionar todos por defecto
		this.selectedFiles = new Set(changedFiles.map((f) => f.path));

		const btnCommitSelected = containerEl.createEl("button", {
			text: "🚀 Commit y push de lo marcado",
			cls: "mod-cta status-commit-btn",
		});
		btnCommitSelected.addEventListener("click", () => {
			void (async () => {
				const filesToCommit = Array.from(this.selectedFiles);
				if (filesToCommit.length === 0) {
					new Notice("❌ Selecciona al menos un archivo.");
					return;
				}
				new Notice("Comitiendo archivos marcados...");
				const msg = getCommitMessage(
					this.plugin.settings.commitMessageTemplate,
				);
				const res = await commitAndPushSelectedFiles(
					basePath,
					filesToCommit,
					msg,
				);
				new Notice(res.message);
				await this.refreshView();
			})();
		});

		const fileListContainer = containerEl.createDiv({
			cls: "status-file-list",
		});

		for (const file of changedFiles) {
			const fileRow = fileListContainer.createDiv({ cls: "status-file-row" });

			const checkbox = fileRow.createEl("input", {
				type: "checkbox",
			});
			checkbox.checked = this.selectedFiles.has(file.path);
			checkbox.addEventListener("change", () => {
				if (checkbox.checked) {
					this.selectedFiles.add(file.path);
				} else {
					this.selectedFiles.delete(file.path);
				}
			});

			fileRow.createEl("span", {
				text: file.status || "?",
				cls: `status-tag status-tag-${file.status}`,
			});

			fileRow.createEl("span", {
				text: file.path,
				cls: "status-file-path",
			});
		}
	}

	private getBasePath(): string {
		const adapter = this.app.vault.adapter as { getBasePath?: () => string };
		return adapter.getBasePath?.() ?? "";
	}
}

class SetupWizardModal extends Modal {
	private basePath: string;
	private remoteUrl = "";

	constructor(app: App, basePath: string) {
		super(app);
		this.basePath = basePath;
	}

	override onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass("git-facil-wizard");

		contentEl.createEl("h2", {
			text: "🪄 Asistente de configuración de GitFacil",
		});
		contentEl.createEl("p", {
			text: "Configura tu bóveda paso a paso sin usar comandos ni la terminal.",
		});

		// --- PASO 1 ---
		const step1Container = contentEl.createDiv({ cls: "wizard-step" });
		step1Container.createEl("h3", {
			text: "PASO 1: Comprobar si tienes Git instalado",
		});
		const step1Result = step1Container.createDiv({ cls: "wizard-result" });

		const btn1 = step1Container.createEl("button", {
			text: "Comprobar Git",
			cls: "mod-cta",
		});
		btn1.addEventListener("click", () => {
			void (async () => {
				step1Result.setText("Comprobando...");
				step1Result.className = "wizard-result";
				const res = await getGitVersion();
				if (res.success) {
					step1Result.setText(`✅ Git instalado (${res.version})`);
					step1Result.addClass("wizard-success");
				} else {
					step1Result.empty();
					step1Result.addClass("wizard-error");
					step1Result.createSpan({
						text: "❌ Git no encontrado. Descárgalo desde ",
					});
					const link = step1Result.createEl("a", {
						text: "git-scm.com",
						href: "https://git-scm.com",
					});
					link.target = "_blank";
				}
			})();
		});

		// --- PASO 2 ---
		const step2Container = contentEl.createDiv({ cls: "wizard-step" });
		step2Container.createEl("h3", {
			text: "PASO 2: Preparar tu bóveda para respaldos",
		});
		const step2Result = step2Container.createDiv({ cls: "wizard-result" });

		const btn2 = step2Container.createEl("button", {
			text: "Crear repositorio",
			cls: "mod-cta",
		});
		btn2.addEventListener("click", () => {
			void (async () => {
				step2Result.setText("Creando repositorio...");
				step2Result.className = "wizard-result";
				const res = await initGitRepo(this.basePath);
				step2Result.setText(res.message);
				step2Result.addClass(res.success ? "wizard-success" : "wizard-error");
			})();
		});

		// --- PASO 3 ---
		const step3Container = contentEl.createDiv({ cls: "wizard-step" });
		step3Container.createEl("h3", { text: "PASO 3: Conectar con GitHub" });
		step3Container.createEl("p", {
			text: "Pega la dirección de tu repositorio de GitHub (ejemplo: https://github.com/usuario/repo.git):",
		});

		const inputEl = step3Container.createEl("input", {
			type: "text",
			placeholder: "https://github.com/tu-usuario/tu-repositorio.git",
			cls: "wizard-input",
		});
		inputEl.addEventListener("input", (e) => {
			this.remoteUrl = (e.target as HTMLInputElement).value;
		});

		const step3Result = step3Container.createDiv({ cls: "wizard-result" });

		const btn3 = step3Container.createEl("button", {
			text: "Conectar y hacer primer commit",
			cls: "mod-cta",
		});
		btn3.addEventListener("click", () => {
			void (async () => {
				step3Result.setText("Conectando y subiendo tus notas...");
				step3Result.className = "wizard-result";
				const commitMsg = getCommitMessage();
				const res = await setupRemoteAndFirstCommit(
					this.basePath,
					this.remoteUrl,
					commitMsg,
				);
				step3Result.setText(res.message);
				step3Result.addClass(res.success ? "wizard-success" : "wizard-error");
			})();
		});
	}

	override onClose() {
		const { contentEl } = this;
		contentEl.empty();
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

		new Setting(containerEl).setName("Configuración de GitFacil").setHeading();

		new Setting(containerEl)
			.setName("Asistente de configuración")
			.setDesc(
				"Configura tu bóveda con Git paso a paso sin usar comandos ni la terminal.",
			)
			.addButton((button) =>
				button
					.setButtonText("🪄 Configurar mi bóveda")
					.setCta()
					.onClick(() => {
						const adapter = this.app.vault.adapter as {
							getBasePath?: () => string;
						};
						const basePath = adapter.getBasePath?.() ?? "";
						new SetupWizardModal(this.app, basePath).open();
					}),
			);

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
