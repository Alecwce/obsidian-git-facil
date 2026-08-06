import {
	type App,
	ItemView,
	Modal,
	Notice,
	Plugin,
	PluginSettingTab,
	Setting,
	type SettingDefinitionItem,
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
	syncAndAlignWithRemote,
} from "./gitHelper";
import { type Language, setLanguage, t } from "./i18n";

export const GIT_STATUS_VIEW_TYPE = "git-facil-status-view";

export interface GitFacilSettings {
	language: Language;
	commitMessageTemplate: string;
	autoSyncEnabled: boolean;
	autoSyncIntervalMinutes: number;
}

export const DEFAULT_SETTINGS: GitFacilSettings = {
	language: "default",
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
				const adapter = this.app.vault.adapter as {
					getBasePath?: () => string;
				};
				const basePath = adapter.getBasePath?.() ?? "";
				new SetupWizardModal(this.app, basePath).open();
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
			this.app.workspace.setActiveLeaf(leaf, true);
		}
	}

	private showAntiPanicNotice(basePath: string) {
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
				const res = await syncAndAlignWithRemote(basePath);
				new Notice(res.message);
			})();
		});
	}

	private async handleCommitAndPush(isAutoSync = false): Promise<void> {
		try {
			const adapter = this.app.vault.adapter as { getBasePath?: () => string };
			const basePath = adapter.getBasePath?.() ?? "";
			if (!basePath) {
				new Notice(t("errVaultPath"));
				return;
			}

			const installed = await isGitInstalled();
			if (!installed) {
				new Notice(t("errGitNotInstalled"));
				return;
			}

			const inRepo = await isGitRepo(basePath);
			if (!inRepo) {
				new Notice(t("errNotRepo"));
				return;
			}

			const remoteExists = await hasGitRemote(basePath);
			if (!remoteExists) {
				new Notice(t("errNoRemote"));
				return;
			}

			const status = await checkGitStatusPorcelain(basePath);
			if (!status) {
				if (!isAutoSync) {
					new Notice(t("noticeNothingToPush"));
				}
				return;
			}

			new Notice(t("noticeCommitting"));

			await runGit(["add", "-A"], basePath);
			const commitMessage = getCommitMessage(
				this.settings.commitMessageTemplate,
			);
			await runGit(["commit", "-m", commitMessage], basePath);
			await runGit(["push"], basePath);

			new Notice(t("noticeCommitPushSuccess"));
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			if (
				message.includes("rejected") ||
				message.includes("fetch first") ||
				message.includes("non-fast-forward")
			) {
				const adapter = this.app.vault.adapter as {
					getBasePath?: () => string;
				};
				const basePath = adapter.getBasePath?.() ?? "";
				if (basePath) {
					this.showAntiPanicNotice(basePath);
					return;
				}
			}
			new Notice(t("noticeError", { msg: message }));
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
		return t("ribbonGitStatus");
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
		const titleEl = header.createEl("h3", { text: t("statusPanelTitle") });

		const refreshIconBtn = titleEl.createEl("button", {
			text: "🔄",
			cls: "status-refresh-icon-btn",
		});
		refreshIconBtn.title = t("statusPanelRefreshBtn");
		refreshIconBtn.addEventListener("click", () => {
			void this.refreshView();
		});

		const controls = containerEl.createDiv({ cls: "status-view-actions" });

		const btnRefresh = controls.createEl("button", {
			text: t("statusPanelRefreshBtn"),
		});
		btnRefresh.addEventListener("click", () => {
			void this.refreshView();
		});

		const btnPull = controls.createEl("button", {
			text: t("statusPanelPullBtn"),
		});
		btnPull.addEventListener("click", () => {
			void (async () => {
				const basePath = this.getBasePath();
				if (!basePath) return;
				new Notice(t("statusPanelPulling"));
				const res = await pullGitChanges(basePath);
				new Notice(res.message);
				await this.refreshView();
			})();
		});

		const basePath = this.getBasePath();
		if (!basePath) {
			containerEl.createDiv({
				text: t("errVaultPath"),
				cls: "wizard-error",
			});
			return;
		}

		const changedFiles = await parseGitStatusPorcelain(basePath);

		if (changedFiles.length === 0) {
			const emptyState = containerEl.createDiv({ cls: "status-empty-state" });
			emptyState.createEl("h2", { text: t("statusPanelCleanTitle") });
			emptyState.createEl("p", {
				text: t("statusPanelCleanDesc"),
			});
			return;
		}

		this.selectedFiles = new Set(changedFiles.map((f) => f.path));

		const btnCommitSelected = containerEl.createEl("button", {
			text: t("statusPanelCommitSelectedBtn"),
			cls: "mod-cta status-commit-btn",
		});
		btnCommitSelected.addEventListener("click", () => {
			void (async () => {
				const filesToCommit = Array.from(this.selectedFiles);
				if (filesToCommit.length === 0) {
					new Notice(t("statusPanelSelectAtLeastOne"));
					return;
				}
				new Notice(t("statusPanelCommittingSelected"));
				const msg = getCommitMessage(
					this.plugin.settings.commitMessageTemplate,
				);
				const res = await commitAndPushSelectedFiles(
					basePath,
					filesToCommit,
					msg,
				);
				if (res.pushRejected) {
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
							const syncRes = await syncAndAlignWithRemote(basePath);
							new Notice(syncRes.message);
							await this.refreshView();
						})();
					});
				} else {
					new Notice(res.message);
				}
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

			fileRow.createSpan({
				text: file.status || "?",
				cls: `status-tag status-tag-${file.status}`,
			});

			fileRow.createSpan({
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
				const res = await getGitVersion();
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
				const res = await initGitRepo(this.basePath);
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

		const inputEl = step3Container.createEl("input", {
			type: "text",
			placeholder: t("wizardStep3Placeholder"),
			cls: "wizard-input",
		});
		inputEl.addEventListener("input", (e) => {
			this.remoteUrl = (e.target as HTMLInputElement).value;
		});

		const step3Result = step3Container.createDiv({ cls: "wizard-result" });

		const btn3 = step3Container.createEl("button", {
			text: t("wizardStep3Btn"),
			cls: "mod-cta",
		});
		btn3.addEventListener("click", () => {
			void (async () => {
				step3Result.setText(t("wizardStep3Connecting"));
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

	override getSettingDefinitions(): SettingDefinitionItem[] {
		return [
			{
				name: t("languageSettingName"),
				desc: t("languageSettingDesc"),
				control: {
					type: "dropdown",
					key: "language",
					defaultValue: DEFAULT_SETTINGS.language,
					options: {
						default: "Por defecto (Sistema) / Default (System)",
						es: "Español",
						en: "English",
					},
				},
			},
			{
				name: t("commitTemplateName"),
				desc: t("commitTemplateDesc"),
				control: {
					type: "text",
					key: "commitMessageTemplate",
					defaultValue: DEFAULT_SETTINGS.commitMessageTemplate,
					placeholder: "📝 notas {fecha}",
				},
			},
			{
				name: t("autoSyncName"),
				desc: t("autoSyncDesc"),
				control: {
					type: "toggle",
					key: "autoSyncEnabled",
					defaultValue: DEFAULT_SETTINGS.autoSyncEnabled,
				},
			},
			{
				name: t("autoSyncIntervalName"),
				desc: t("autoSyncIntervalDesc"),
				control: {
					type: "number",
					key: "autoSyncIntervalMinutes",
					defaultValue: DEFAULT_SETTINGS.autoSyncIntervalMinutes,
					placeholder: "10",
					min: 1,
				},
			},
		];
	}

	override async setControlValue(key: string, value: unknown): Promise<void> {
		(this.plugin.settings as Record<string, unknown>)[key] = value;
		await this.plugin.saveSettings();
	}
}
