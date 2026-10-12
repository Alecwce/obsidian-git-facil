import { type App, Modal, Notice } from "obsidian";
import type GitFacilPlugin from "./main";
import { cloneVault } from "./mobileGit";

export class CloneVaultModal extends Modal {
	private plugin: GitFacilPlugin;
	private repoUrl = "";
	private token = "";
	private branch = "main";

	constructor(app: App, plugin: GitFacilPlugin) {
		super(app);
		this.plugin = plugin;
		this.token = plugin.settings.githubToken || "";
	}

	override onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass("git-facil-wizard");

		const headerEl = contentEl.createDiv({ cls: "wizard-modal-header" });
		headerEl.createEl("h2", {
			text: "📥 Clonar Bóveda desde GitHub",
		});
		const closeBtn = headerEl.createEl("button", {
			text: "✖",
			cls: "wizard-close-btn",
		});
		closeBtn.addEventListener("click", () => this.close());

		contentEl.createEl("p", {
			text: "Descarga todas tus notas, carpetas y lienzos directamente a esta bóveda sin necesidad de terminal ni comandos externos.",
		});

		const formContainer = contentEl.createDiv({ cls: "wizard-step" });

		// URL del repo
		formContainer.createEl("label", {
			text: "URL del repositorio (HTTPS):",
		});
		const inputUrl = formContainer.createEl("input", {
			type: "text",
			placeholder: "https://github.com/tu-usuario/tu-boveda.git",
			cls: "wizard-input",
		});
		inputUrl.value = this.repoUrl;
		inputUrl.addEventListener("input", (e) => {
			this.repoUrl = (e.target as HTMLInputElement).value.trim();
		});

		// Token PAT
		formContainer.createEl("label", {
			text: "Personal Access Token (PAT):",
		});
		const inputToken = formContainer.createEl("input", {
			type: "password",
			placeholder: "ghp_xxxxxxxxxxxxxxxxxxxx",
			cls: "wizard-input",
		});
		inputToken.value = this.token;
		inputToken.addEventListener("input", (e) => {
			this.token = (e.target as HTMLInputElement).value.trim();
		});

		// Rama
		formContainer.createEl("label", {
			text: "Rama (Branch):",
		});
		const inputBranch = formContainer.createEl("input", {
			type: "text",
			placeholder: "main",
			cls: "wizard-input",
		});
		inputBranch.value = this.branch;
		inputBranch.addEventListener("input", (e) => {
			this.branch = (e.target as HTMLInputElement).value.trim() || "main";
		});

		const progressBox = formContainer.createDiv({ cls: "wizard-result" });

		const btnClone = formContainer.createEl("button", {
			text: "🚀 Iniciar Clonación",
			cls: "mod-cta",
		});

		btnClone.addEventListener("click", () => {
			void (async () => {
				if (!this.repoUrl) {
					new Notice("⚠️ Ingresa la URL del repositorio de GitHub.");
					return;
				}
				btnClone.disabled = true;
				progressBox.setText("⏳ Conectando con GitHub y descargando notas...");
				progressBox.className = "wizard-result";

				const res = await cloneVault(
					this.app,
					this.repoUrl,
					this.token,
					this.branch,
					(phase, loaded, total) => {
						if (total > 0) {
							progressBox.setText(`📥 ${phase}: ${loaded}/${total}`);
						} else {
							progressBox.setText(`📥 ${phase}...`);
						}
					},
				);

				if (res.success) {
					progressBox.setText(res.message);
					progressBox.addClass("wizard-success");
					new Notice(res.message);

					// Guardar token en configuración si se ingresó
					if (this.token) {
						this.plugin.settings.githubToken = this.token;
						await this.plugin.saveSettings();
					}

					void this.plugin.refreshGitStatus();
					window.setTimeout(() => {
						this.close();
					}, 2000);
				} else {
					btnClone.disabled = false;
					progressBox.setText(res.message);
					progressBox.addClass("wizard-error");
					new Notice(res.message);
				}
			})();
		});
	}
}
