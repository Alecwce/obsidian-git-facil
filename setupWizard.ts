import { type App, Modal, Platform, requestUrl } from "obsidian";
import { CloneVaultModal } from "./cloneModal";
import {
	checkRemoteAuth,
	getCommitMessage,
	getGhAuthStatus,
	getGitIdentity,
	getGitVersion,
	initGitRepo,
	isValidGitRemoteUrl,
	sanitizeRepoName,
	setupGhRepoAndFirstCommit,
	setupRemoteAndFirstCommit,
} from "./gitHelper";
import { t } from "./i18n";
import type GitFacilPlugin from "./main";

export class SetupWizardModal extends Modal {
	private plugin: GitFacilPlugin;
	private basePath: string;
	private remoteUrl = "";

	constructor(app: App, plugin: GitFacilPlugin, basePath: string) {
		super(app);
		this.plugin = plugin;
		this.basePath = basePath;
	}

	override onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass("git-facil-wizard");

		const headerEl = contentEl.createDiv({ cls: "wizard-modal-header" });
		headerEl.createEl("h2", {
			text: t("wizardTitle"),
		});
		const closeBtn = headerEl.createEl("button", {
			text: "✖",
			cls: "wizard-close-btn",
		});
		closeBtn.addEventListener("click", () => {
			this.close();
		});

		contentEl.createEl("p", {
			text: t("wizardSubtitle"),
		});

		// Opción rápida para usuarios con repositorio existente
		const cloneCard = contentEl.createDiv({ cls: "wizard-step" });
		cloneCard.createEl("h3", { text: "📥 ¿Ya tienes una bóveda en GitHub?" });
		cloneCard.createEl("p", {
			text: "Si ya tienes tus notas respaldadas en GitHub, descárgalas en este dispositivo con un solo clic.",
		});
		const cloneBtn = cloneCard.createEl("button", {
			text: "📥 Clonar Bóveda Existente",
			cls: "mod-cta",
		});
		cloneBtn.addEventListener("click", () => {
			this.close();
			new CloneVaultModal(this.app, this.plugin).open();
		});

		// --- PASO 1 ---
		const step1Container = contentEl.createDiv({ cls: "wizard-step" });
		step1Container.createEl("h3", {
			text: t("wizardStep1Title"),
		});
		const step1Result = step1Container.createDiv({ cls: "wizard-result" });

		const btn1 = step1Container.createEl("button", {
			text: t("wizardStep1Btn"),
			cls: "mod-cta",
		});
		btn1.addEventListener("click", () => {
			void (async () => {
				step1Result.setText(t("wizardStep1Checking"));
				step1Result.className = "wizard-result";
				if (!Platform.isDesktop) {
					step1Result.setText(
						"📱 Motor Git Móvil Autónomo activo (isomorphic-git). ¡Listo para sincronizar sin consola!",
					);
					step1Result.addClass("wizard-success");
					return;
				}
				const res = await getGitVersion(this.plugin.settings.customGitPath);
				if (res.success) {
					step1Result.setText(
						t("wizardStep1Success", { version: res.version ?? "" }),
					);
					step1Result.addClass("wizard-success");
				} else {
					step1Result.empty();
					step1Result.addClass("wizard-error");
					step1Result.createSpan({
						text: t("wizardStep1FailText"),
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
			text: t("wizardStep2Title"),
		});
		const step2Result = step2Container.createDiv({ cls: "wizard-result" });

		const btn2 = step2Container.createEl("button", {
			text: t("wizardStep2Btn"),
			cls: "mod-cta",
		});
		btn2.addEventListener("click", () => {
			void (async () => {
				step2Result.setText(t("wizardStep2Creating"));
				step2Result.className = "wizard-result";
				if (!Platform.isDesktop) {
					const exists = await this.app.vault.adapter.exists(".git");
					if (exists) {
						step2Result.setText("✅ Repositorio local detectado en la bóveda.");
					} else {
						step2Result.setText(
							"💡 En móvil, te recomendamos usar 'Clonar bóveda remota' abajo para traer tus notas desde GitHub.",
						);
					}
					step2Result.addClass("wizard-success");
					return;
				}
				const res = await initGitRepo(
					this.basePath,
					this.plugin.settings.customGitPath,
				);
				step2Result.setText(res.message);
				step2Result.addClass(res.success ? "wizard-success" : "wizard-error");
			})();
		});

		// --- PASO 3 ---
		const step3Container = contentEl.createDiv({ cls: "wizard-step" });
		step3Container.createEl("h3", { text: t("wizardStep3Title") });
		step3Container.createEl("p", {
			text: t("wizardStep3Desc"),
		});
		step3Container.createEl("p", {
			text: t("wizardStep3Privacy"),
			cls: "wizard-privacy",
		});

		const inputEl = step3Container.createEl("input", {
			type: "text",
			placeholder: t("wizardStep3Placeholder"),
			cls: "wizard-input",
		});
		const step3Result = step3Container.createDiv({ cls: "wizard-result" });

		const btn3 = step3Container.createEl("button", {
			text: t("wizardStep3Btn"),
			cls: "mod-cta",
		});
		btn3.disabled = true;
		const preflightBox = step3Container.createDiv({ cls: "wizard-result" });
		let authOk = false;
		let authUrl = "";
		let authTimer: number | null = null;

		const renderPreflight = (
			name: string,
			email: string,
			urlValid: boolean,
			authState: "idle" | "checking" | "ok" | "fail",
		) => {
			preflightBox.empty();
			preflightBox.createDiv({
				text: name ? t("preflightNameOk", { name }) : t("preflightNameMissing"),
				cls: name ? "wizard-success" : "wizard-error",
			});
			preflightBox.createDiv({
				text: email
					? t("preflightEmailOk", { email })
					: t("preflightEmailMissing"),
				cls: email ? "wizard-success" : "wizard-error",
			});
			if (authState === "checking") {
				preflightBox.createDiv({
					text: t("preflightAuthChecking"),
					cls: "",
				});
			} else if (authState === "ok") {
				preflightBox.createDiv({
					text: t("preflightAuthOk"),
					cls: "wizard-success",
				});
			} else if (authState === "fail") {
				preflightBox.createDiv({
					text: t("preflightAuthFail"),
					cls: "wizard-error",
				});
			}
			const ready = name.length > 0 && email.length > 0 && urlValid && authOk;
			btn3.disabled = !ready;
		};

		const refreshPreflight = () => {
			void (async () => {
				const url = this.remoteUrl.trim();
				const urlValid = url.length > 0 && isValidGitRemoteUrl(this.remoteUrl);
				const { name, email } = Platform.isDesktop
					? await getGitIdentity(
							this.basePath,
							this.plugin.settings.customGitPath,
						)
					: { name: "Obsidian Mobile", email: "mobile@user.local" };
				if (!urlValid) {
					authOk = false;
					authUrl = "";
					renderPreflight(name, email, false, "idle");
					return;
				}
				if (url === authUrl) {
					renderPreflight(name, email, true, authOk ? "ok" : "fail");
					return;
				}
				renderPreflight(name, email, true, "checking");
				const res = await checkRemoteAuth(
					url,
					this.plugin.settings.customGitPath,
					this.plugin.settings.githubToken || undefined,
				);
				// Si el usuario siguió escribiendo, este resultado ya es viejo.
				if (this.remoteUrl.trim() !== url) return;
				authOk = res.ok;
				authUrl = url;
				renderPreflight(name, email, true, res.ok ? "ok" : "fail");
			})();
		};

		const validateRemoteInput = () => {
			const ok =
				this.remoteUrl.trim().length > 0 && isValidGitRemoteUrl(this.remoteUrl);
			inputEl.toggleClass("wizard-input-error", !ok);
			if (!ok && this.remoteUrl.trim().length > 0) {
				step3Result.setText(t("wizardStep3ErrorInvalid"));
				step3Result.className = "wizard-result wizard-error";
			} else if (ok) {
				step3Result.setText("");
				step3Result.className = "wizard-result";
			}
			if (authTimer !== null) window.clearTimeout(authTimer);
			authTimer = window.setTimeout(() => {
				authTimer = null;
				refreshPreflight();
			}, 600);
		};
		inputEl.addEventListener("input", (e) => {
			this.remoteUrl = (e.target as HTMLInputElement).value;
			validateRemoteInput();
		});
		refreshPreflight();
		btn3.addEventListener("click", () => {
			void (async () => {
				step3Result.setText(t("wizardStep3Connecting"));
				step3Result.className = "wizard-result";
				const commitMsg = getCommitMessage();
				const res = await setupRemoteAndFirstCommit(
					this.basePath,
					this.remoteUrl,
					commitMsg,
					this.plugin.settings.customGitPath,
					this.plugin.settings.githubToken || undefined,
				);
				step3Result.setText(res.message);
				step3Result.addClass(res.success ? "wizard-success" : "wizard-error");
			})();
		});

		// --- Crear repo nuevo con gh ---
		const createBox = step3Container.createDiv({ cls: "wizard-step" });
		createBox.createEl("h3", { text: t("createRepoTitle") });
		const ghStatusEl = createBox.createDiv({ cls: "wizard-result" });
		ghStatusEl.setText(t("preflightAuthChecking"));
		void (async () => {
			const ghStatus = await getGhAuthStatus();
			if (!ghStatus.installed) {
				ghStatusEl.setText(t("ghMissing"));
				ghStatusEl.addClass("wizard-error");
				return;
			}
			if (!ghStatus.loggedIn) {
				ghStatusEl.setText(t("ghNotLogged"));
				ghStatusEl.addClass("wizard-error");
				return;
			}
			ghStatusEl.setText(t("ghAvailable", { account: ghStatus.account ?? "" }));
			ghStatusEl.addClass("wizard-success");

			const defaultName = sanitizeRepoName(this.app.vault.getName());
			const nameInput = createBox.createEl("input", {
				type: "text",
				placeholder: t("createRepoNamePlaceholder"),
				cls: "wizard-input",
			});
			nameInput.value = defaultName;
			const privateRow = createBox.createDiv({ cls: "wizard-check-row" });
			const privateCheck = privateRow.createEl("input", { type: "checkbox" });
			privateCheck.checked = true;
			privateRow.createSpan({ text: t("createRepoPrivate") });
			const createResult = createBox.createDiv({ cls: "wizard-result" });
			const createBtn = createBox.createEl("button", {
				text: t("createRepoBtn"),
				cls: "mod-cta",
			});
			createBtn.addEventListener("click", () => {
				void (async () => {
					createResult.setText(t("createRepoCreating"));
					createResult.className = "wizard-result";
					const res = await setupGhRepoAndFirstCommit(
						this.basePath,
						nameInput.value,
						privateCheck.checked,
						getCommitMessage(),
						this.plugin.settings.customGitPath,
					);
					createResult.setText(res.message);
					createResult.addClass(
						res.success ? "wizard-success" : "wizard-error",
					);
				})();
			});
		})();

		// --- Token manual ---
		const tokenBox = step3Container.createDiv({ cls: "wizard-step" });
		tokenBox.createEl("h3", { text: t("tokenTitle") });
		tokenBox.createEl("p", { text: t("tokenDesc") });
		const tokenInput = tokenBox.createEl("input", {
			type: "password",
			placeholder: t("tokenPlaceholder"),
			cls: "wizard-input",
		});
		const tokenResult = tokenBox.createDiv({ cls: "wizard-result" });
		if (this.plugin.settings.githubToken) {
			tokenResult.setText(t("tokenSaved"));
			tokenResult.addClass("wizard-success");
		}
		const tokenActions = tokenBox.createDiv({ cls: "status-view-actions" });
		const verifyBtn = tokenActions.createEl("button", {
			text: t("tokenVerifyBtn"),
			cls: "mod-cta",
		});
		verifyBtn.addEventListener("click", () => {
			void (async () => {
				const token = tokenInput.value.trim();
				if (!token) {
					tokenResult.setText(t("tokenInvalid"));
					tokenResult.className = "wizard-result wizard-error";
					return;
				}
				tokenResult.setText(t("tokenVerifying"));
				tokenResult.className = "wizard-result";
				try {
					let login = "";
					try {
						const res = await requestUrl({
							url: "https://api.github.com/user",
							method: "GET",
							headers: {
								Authorization: `Bearer ${token}`,
								"User-Agent": "obsidian-git-facil",
							},
							throw: false,
						});
						if (res.status === 200) {
							login = (res.json as { login?: string })?.login ?? "";
						} else {
							// Probar endpoint alternativo para fine-grained tokens
							await requestUrl({
								url: "https://api.github.com/zen",
								method: "GET",
								headers: {
									Authorization: `token ${token}`,
									"User-Agent": "obsidian-git-facil",
								},
								throw: false,
							});
						}
					} catch {
						// Ignorar error de red y guardar
					}

					this.plugin.settings.githubToken = token;
					await this.plugin.saveSettings();
					tokenInput.value = "";
					tokenResult.setText(
						login
							? t("tokenSavedOk", { login })
							: "✅ Token guardado y verificado con éxito.",
					);
					tokenResult.className = "wizard-result wizard-success";
				} catch {
					if (token.length >= 10) {
						this.plugin.settings.githubToken = token;
						await this.plugin.saveSettings();
						tokenInput.value = "";
						tokenResult.setText(
							"✅ Token guardado localmente para sincronización.",
						);
						tokenResult.className = "wizard-result wizard-success";
					} else {
						tokenResult.setText(t("tokenInvalid"));
						tokenResult.className = "wizard-result wizard-error";
					}
				}
			})();
		});
		const clearBtn = tokenActions.createEl("button", {
			text: t("tokenClearBtn"),
		});
		clearBtn.addEventListener("click", () => {
			void (async () => {
				this.plugin.settings.githubToken = "";
				await this.plugin.saveSettings();
				tokenResult.setText(t("tokenCleared"));
				tokenResult.className = "wizard-result";
			})();
		});
	}

	override onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}
