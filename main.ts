import "./polyfill";
import { Notice, Platform, Plugin, type WorkspaceLeaf } from "obsidian";
import { CloneVaultModal } from "./cloneModal";
import {
	checkGitStatusPorcelain,
	getCommitMessage,
	hasOriginRemote,
	isGitInstalled,
	isGitRepo,
	isPushRejectedMessage,
	runGit,
	syncAndAlignWithRemote,
	syncCleanTree,
} from "./gitHelper";
import { type Language, setLanguage, t } from "./i18n";
import {
	isMobileRepo,
	mobileCommitAndPush,
	mobileGetPendingCount,
	mobilePull,
} from "./mobileGit";
import { GitFacilSettingTab } from "./settingTab";
import { SetupWizardModal } from "./setupWizard";
import { GIT_STATUS_VIEW_TYPE, GitStatusView } from "./statusView";
import { getVaultBasePath } from "./vault";

export { GIT_STATUS_VIEW_TYPE };

export interface GitFacilSettings {
	language: Language;
	commitMessageTemplate: string;
	autoSyncEnabled: boolean;
	autoSyncIntervalMinutes: number;
	syncOnStartup: boolean;
	customGitPath: string;
	githubToken: string;
}

export const DEFAULT_SETTINGS: GitFacilSettings = {
	language: "default",
	commitMessageTemplate: "📝 notas {fecha}",
	autoSyncEnabled: false,
	autoSyncIntervalMinutes: 10,
	syncOnStartup: true,
	customGitPath: "",
	githubToken: "",
};

export default class GitFacilPlugin extends Plugin {
	settings: GitFacilSettings = DEFAULT_SETTINGS;
	private syncIntervalId: number | null = null;
	private isSyncing = false;
	private statusBarEl: HTMLElement | null = null;
	private statusDebounceTimer: number | null = null;

	override async onload() {
		await this.loadSettings();

		const executeCommitAndPush = async () => {
			await this.handleCommitAndPush();
		};

		this.addRibbonIcon("rocket", t("ribbonCommitPush"), executeCommitAndPush);

		this.registerView(
			GIT_STATUS_VIEW_TYPE,
			(leaf) => new GitStatusView(leaf, this),
		);

		this.addRibbonIcon("git-compare", t("ribbonGitStatus"), () => {
			void this.activateView();
		});

		this.addCommand({
			id: "commit-and-push",
			name: t("cmdCommitPush"),
			callback: executeCommitAndPush,
		});

		this.addCommand({
			id: "open-git-status-view",
			name: t("cmdGitStatus"),
			callback: () => {
				void this.activateView();
			},
		});

		this.addCommand({
			id: "open-setup-wizard",
			name: t("cmdOpenSetupWizard"),
			callback: () => {
				const basePath = getVaultBasePath(this.app);
				new SetupWizardModal(this.app, this, basePath).open();
			},
		});

		this.addCommand({
			id: "clone-vault",
			name: "📥 Clonar Bóveda desde GitHub (Clone Vault)",
			callback: () => {
				new CloneVaultModal(this.app, this).open();
			},
		});

		this.addSettingTab(new GitFacilSettingTab(this.app, this));
		this.configureAutoSync();

		// Inicializar barra de estado interactiva
		this.statusBarEl = this.addStatusBarItem();
		this.statusBarEl.addClass("git-facil-status-bar");
		this.statusBarEl.addClass("mod-clickable");
		this.statusBarEl.setAttribute(
			"aria-label",
			"Git Fácil: Estado de sincronización",
		);
		this.statusBarEl.addEventListener("click", () => {
			void this.handleCommitAndPush();
		});
		this.updateStatusBar("idle");

		// Escuchar eventos de la bóveda para reflejar cambios en tiempo real
		const onVaultChange = () => {
			this.triggerDebouncedStatusCheck();
		};
		this.registerEvent(this.app.vault.on("create", onVaultChange));
		this.registerEvent(this.app.vault.on("modify", onVaultChange));
		this.registerEvent(this.app.vault.on("delete", onVaultChange));
		this.registerEvent(this.app.vault.on("rename", onVaultChange));

		if (this.settings.syncOnStartup) {
			window.setTimeout(() => {
				void this.handleStartupSync();
			}, 3000);
		} else {
			window.setTimeout(() => {
				void this.refreshGitStatus();
			}, 1000);
		}
	}

	updateStatusBar(status: "idle" | "syncing" | "dirty" | "error", count = 0) {
		if (!this.statusBarEl) return;
		this.statusBarEl.removeClass(
			"status-idle",
			"status-syncing",
			"status-dirty",
			"status-error",
		);
		this.statusBarEl.addClass(`status-${status}`);
		if (status === "syncing") {
			this.statusBarEl.setText("⏳ Git: Sincronizando...");
			this.statusBarEl.setAttribute(
				"title",
				"Sincronizando notas con GitHub...",
			);
		} else if (status === "dirty") {
			this.statusBarEl.setText(
				`🟡 Git: ${count} cambio${count > 1 ? "s" : ""} (Subir)`,
			);
			this.statusBarEl.setAttribute(
				"title",
				`Hay ${count} cambio${count > 1 ? "s" : ""} sin subir. Haz clic para guardar y sincronizar.`,
			);
		} else if (status === "error") {
			this.statusBarEl.setText("🔴 Git: Error / Atención");
			this.statusBarEl.setAttribute(
				"title",
				"Error o conflicto de sincronización. Haz clic para reintentar.",
			);
		} else {
			this.statusBarEl.setText("🟢 Git: Al día");
			this.statusBarEl.setAttribute(
				"title",
				"Todas tus notas están sincronizadas con la nube.",
			);
		}
	}

	triggerDebouncedStatusCheck() {
		if (this.statusDebounceTimer !== null) {
			window.clearTimeout(this.statusDebounceTimer);
		}
		this.statusDebounceTimer = window.setTimeout(() => {
			void this.refreshGitStatus();
		}, 1500);
	}

	async refreshGitStatus() {
		if (this.isSyncing) return;
		if (!Platform.isDesktop) {
			try {
				const count = await mobileGetPendingCount(this.app);
				if (count === 0) {
					this.updateStatusBar("idle");
				} else {
					this.updateStatusBar("dirty", count);
				}
			} catch {
				// Silencioso
			}
			return;
		}

		const basePath = getVaultBasePath(this.app);
		if (!basePath) return;
		try {
			const status = await checkGitStatusPorcelain(
				basePath,
				this.settings.customGitPath,
			);
			if (!status) {
				this.updateStatusBar("idle");
			} else {
				const lines = status.split("\n").filter((l) => l.trim().length > 0);
				this.updateStatusBar("dirty", lines.length);
			}
		} catch {
			// Silencioso si no es repositorio inicializado
		}
	}

	private async handleStartupSync() {
		if (!Platform.isDesktop) {
			try {
				if (await isMobileRepo(this.app)) {
					const res = await mobilePull(this.app, this.settings.githubToken);
					if (res.success) {
						new Notice("🔄 GitFacil: Bóveda actualizada desde la nube ✅");
					}
				}
			} catch {
				// Silencioso al inicio
			} finally {
				void this.refreshGitStatus();
			}
			return;
		}

		const basePath = getVaultBasePath(this.app);
		if (!basePath) return;
		try {
			const isRepo = await isGitRepo(basePath, this.settings.customGitPath);
			if (!isRepo) return;
			const hasRemote = await hasOriginRemote(
				basePath,
				this.settings.customGitPath,
			);
			if (!hasRemote) return;
			const res = await syncCleanTree(
				basePath,
				this.settings.customGitPath,
				this.settings.githubToken,
			);
			if (res.pulled) {
				new Notice("🔄 GitFacil: Bóveda actualizada desde la nube ✅");
			}
		} catch {
			// Silencioso al inicio para no molestar si no hay red
		} finally {
			void this.refreshGitStatus();
		}
	}

	override onunload() {
		if (this.syncIntervalId !== null) {
			window.clearInterval(this.syncIntervalId);
			this.syncIntervalId = null;
		}
		if (this.statusDebounceTimer !== null) {
			window.clearTimeout(this.statusDebounceTimer);
			this.statusDebounceTimer = null;
		}
	}

	async loadSettings() {
		const loadedData: unknown = await this.loadData();
		if (typeof loadedData === "object" && loadedData !== null) {
			this.settings = Object.assign({}, DEFAULT_SETTINGS, loadedData);
		} else {
			this.settings = Object.assign({}, DEFAULT_SETTINGS);
		}
		setLanguage(this.settings.language);
	}

	async saveSettings() {
		setLanguage(this.settings.language);
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
			await workspace.revealLeaf(leaf);
			workspace.setActiveLeaf(leaf, { focus: true });
			const rightSplit = workspace.rightSplit as {
				expand?: () => void;
			};
			if (rightSplit?.expand) {
				rightSplit.expand();
			}
		}
	}

	showAntiPanicNotice(basePath: string, onSynced?: () => void) {
		const notice = new Notice("", 0);
		const container = notice.messageEl;
		container.empty();
		container.createDiv({
			text: t("antiPanicTitle"),
		});
		container.createEl("p", {
			text: t("antiPanicSubtext"),
			cls: "notice-subtext",
		});
		const syncBtn = container.createEl("button", {
			text: t("antiPanicBtn"),
			cls: "mod-cta notice-sync-btn",
		});
		syncBtn.addEventListener("click", () => {
			void (async () => {
				notice.hide();
				new Notice(t("antiPanicSyncing"));
				const res = await syncAndAlignWithRemote(
					basePath,
					this.settings.customGitPath,
					this.settings.githubToken || undefined,
				);
				new Notice(res.message);
				onSynced?.();
			})();
		});
	}

	private async handleCommitAndPush(isAutoSync = false): Promise<void> {
		if (this.isSyncing) {
			if (!isAutoSync) {
				new Notice(t("noticeSyncBusy"));
			}
			return;
		}
		this.isSyncing = true;
		this.updateStatusBar("syncing");
		try {
			const token = this.settings.githubToken?.trim() || undefined;

			// En móvil o dispositivos sin Git nativo usamos el motor independiente isomorphic-git
			if (!Platform.isDesktop) {
				new Notice(t("noticeCommitting"));
				const commitMessage = getCommitMessage(
					this.settings.commitMessageTemplate,
				);
				const res = await mobileCommitAndPush(this.app, commitMessage, token);
				new Notice(res.message);
				if (res.success) {
					this.updateStatusBar("idle");
				} else {
					this.updateStatusBar("error");
				}
				return;
			}

			const basePath = getVaultBasePath(this.app);
			if (!basePath) {
				new Notice(t("errVaultPath"));
				return;
			}

			const gitPath = this.settings.customGitPath;
			const installed = await isGitInstalled(gitPath);
			if (!installed) {
				new Notice(t("errGitNotInstalled"));
				this.updateStatusBar("error");
				return;
			}

			const inRepo = await isGitRepo(basePath, gitPath);
			if (!inRepo) {
				new Notice(t("errNotRepo"));
				return;
			}

			const remoteExists = await hasOriginRemote(basePath, gitPath);
			if (!remoteExists) {
				new Notice(t("errNoRemote"));
				return;
			}

			const status = await checkGitStatusPorcelain(basePath, gitPath);
			if (!status) {
				// Árbol limpio: igual puede haber cambios remotos por bajar.
				const clean = await syncCleanTree(basePath, gitPath, token);
				if (clean.pulled) {
					new Notice(t("pullChangesDownloaded"));
				} else if (!isAutoSync) {
					if (clean.error) {
						new Notice(t("gitHelperPullError", { msg: clean.error }));
					} else {
						new Notice(t("noticeNothingToPush"));
					}
				}
				return;
			}

			new Notice(t("noticeCommitting"));

			await runGit(["add", "-A"], basePath, gitPath);
			const commitMessage = getCommitMessage(
				this.settings.commitMessageTemplate,
			);
			await runGit(["commit", "-m", commitMessage], basePath, gitPath);
			await runGit(["push"], basePath, gitPath, true, token);

			new Notice(t("noticeCommitPushSuccess"));
		} catch (error) {
			this.updateStatusBar("error");
			const message = error instanceof Error ? error.message : String(error);
			if (isPushRejectedMessage(message)) {
				const basePath = getVaultBasePath(this.app);
				if (basePath) {
					this.showAntiPanicNotice(basePath);
					return;
				}
			}
			new Notice(t("noticeError", { msg: message }));
		} finally {
			this.isSyncing = false;
			void this.refreshGitStatus();
		}
	}
}
