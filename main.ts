import { Notice, Plugin, type WorkspaceLeaf } from "obsidian";
import {
	checkGitStatusPorcelain,
	getCommitMessage,
	hasGitRemote,
	isGitInstalled,
	isGitRepo,
	isPushRejectedMessage,
	runGit,
	syncAndAlignWithRemote,
} from "./gitHelper";
import { type Language, setLanguage, t } from "./i18n";
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
	customGitPath: string;
}

export const DEFAULT_SETTINGS: GitFacilSettings = {
	language: "default",
	commitMessageTemplate: "📝 notas {fecha}",
	autoSyncEnabled: false,
	autoSyncIntervalMinutes: 10,
	customGitPath: "",
};

export default class GitFacilPlugin extends Plugin {
	settings: GitFacilSettings = DEFAULT_SETTINGS;
	private syncIntervalId: number | null = null;
	private isSyncing = false;

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

		this.addSettingTab(new GitFacilSettingTab(this.app, this));
		this.configureAutoSync();
	}

	override onunload() {
		if (this.syncIntervalId !== null) {
			window.clearInterval(this.syncIntervalId);
			this.syncIntervalId = null;
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
			this.app.workspace.setActiveLeaf(leaf, { focus: true });
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
		try {
			const basePath = getVaultBasePath(this.app);
			if (!basePath) {
				new Notice(t("errVaultPath"));
				return;
			}

			const gitPath = this.settings.customGitPath;
			const installed = await isGitInstalled(gitPath);
			if (!installed) {
				new Notice(t("errGitNotInstalled"));
				return;
			}

			const inRepo = await isGitRepo(basePath, gitPath);
			if (!inRepo) {
				new Notice(t("errNotRepo"));
				return;
			}

			const remoteExists = await hasGitRemote(basePath, gitPath);
			if (!remoteExists) {
				new Notice(t("errNoRemote"));
				return;
			}

			const status = await checkGitStatusPorcelain(basePath, gitPath);
			if (!status) {
				if (!isAutoSync) {
					new Notice(t("noticeNothingToPush"));
				}
				return;
			}

			new Notice(t("noticeCommitting"));

			await runGit(["add", "-A"], basePath, gitPath);
			const commitMessage = getCommitMessage(
				this.settings.commitMessageTemplate,
			);
			await runGit(["commit", "-m", commitMessage], basePath, gitPath);
			await runGit(["push"], basePath, gitPath);

			new Notice(t("noticeCommitPushSuccess"));
		} catch (error) {
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
		}
	}
}
