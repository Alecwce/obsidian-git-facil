import { ItemView, Notice, Platform, type WorkspaceLeaf } from "obsidian";
import { DiagnosticModal } from "./diagnosticModal";
import {
	commitAndPushSelectedFiles,
	detectHeavyFiles,
	discardFileChanges,
	getAheadBehind,
	getCurrentBranch,
	getGitStatusResult,
	getRecentCommits,
	getSmartCommitMessage,
	pullGitChanges,
	type RecentCommit,
} from "./gitHelper";
import { t } from "./i18n";
import type GitFacilPlugin from "./main";
import {
	mobileCommitAndPushSelectedFiles,
	mobileDiscardFile,
	mobileGetRecentCommits,
	mobileGetStatus,
	mobilePull,
} from "./mobileGit";
import { getVaultBasePath } from "./vault";

export const GIT_STATUS_VIEW_TYPE = "git-facil-status-view";

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

		const branchLine = header.createSpan({ cls: "status-branch-line" });
		void (async () => {
			if (!Platform.isDesktop) {
				const status = await mobileGetStatus(this.app);
				if (!status.ok) {
					branchLine.setText("⚠️ Git móvil no inicializado");
				} else if (!status.hasRemote) {
					branchLine.setText(`📍 ${status.branch} (sin remoto configurado)`);
				} else {
					branchLine.setText(`📍 ${status.branch} ☁️ origin`);
				}
			} else {
				const bp = getVaultBasePath(this.app);
				if (!bp) return;
				const gitPath = this.plugin.settings.customGitPath;
				const [branch, { ahead, behind, hasUpstream }] = await Promise.all([
					getCurrentBranch(bp, gitPath),
					getAheadBehind(bp, gitPath),
				]);
				branchLine.setText(
					hasUpstream
						? t("statusPanelBranchLine", { branch, ahead, behind })
						: t("statusPanelBranchNoUpstream", { branch }),
				);
			}
		})();

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
				new Notice(t("statusPanelPulling"));
				if (!Platform.isDesktop) {
					const res = await mobilePull(
						this.app,
						this.plugin.settings.githubToken || undefined,
					);
					new Notice(res.message);
				} else {
					const basePath = getVaultBasePath(this.app);
					if (!basePath) return;
					const res = await pullGitChanges(
						basePath,
						this.plugin.settings.customGitPath,
						this.plugin.settings.githubToken || undefined,
					);
					new Notice(res.message);
				}
				await this.refreshView();
				void this.plugin.refreshGitStatus();
			})();
		});

		let changedFiles: { path: string; status: string }[] = [];
		if (!Platform.isDesktop) {
			const mobileStatus = await mobileGetStatus(this.app);
			if (!mobileStatus.ok) {
				this.plugin.lastError =
					mobileStatus.error || "Error al leer estado móvil";
				const errBox = containerEl.createDiv({ cls: "status-empty-state" });
				errBox.createEl("h2", { text: t("statusPanelErrorTitle") });
				errBox.createEl("p", {
					text: mobileStatus.error || t("statusPanelErrorDesc"),
				});
				const btnDiag = errBox.createEl("button", {
					text: t("diagnosticSettingBtn"),
					cls: "mod-cta status-diag-btn",
				});
				btnDiag.addEventListener("click", () => {
					new DiagnosticModal(this.app, this.plugin).open();
				});
				return;
			}
			changedFiles = mobileStatus.files;
		} else {
			const basePath = getVaultBasePath(this.app);
			if (!basePath) {
				containerEl.createDiv({
					text: t("errVaultPath"),
					cls: "wizard-error",
				});
				return;
			}

			const gitPath = this.plugin.settings.customGitPath;
			const status = await getGitStatusResult(basePath, gitPath);

			if (!status.ok) {
				this.plugin.lastError = status.error || "Error al leer estado nativo";
				const errBox = containerEl.createDiv({ cls: "status-empty-state" });
				errBox.createEl("h2", { text: t("statusPanelErrorTitle") });
				errBox.createEl("p", { text: t("statusPanelErrorDesc") });
				const btnDiag = errBox.createEl("button", {
					text: t("diagnosticSettingBtn"),
					cls: "mod-cta status-diag-btn",
				});
				btnDiag.addEventListener("click", () => {
					new DiagnosticModal(this.app, this.plugin).open();
				});
				return;
			}
			changedFiles = status.files;
		}

		if (changedFiles.length === 0) {
			const emptyState = containerEl.createDiv({ cls: "status-empty-state" });
			emptyState.createEl("h2", { text: t("statusPanelCleanTitle") });
			emptyState.createEl("p", {
				text: t("statusPanelCleanDesc"),
			});
		} else {
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

					const heavy = await detectHeavyFiles(this.app, filesToCommit);
					if (heavy.length > 0) {
						new Notice(
							t("statusPanelHeavyFilesDetected", {
								names: heavy.map((h) => h.path).join(", "),
								size: heavy[0]?.sizeMB || "50",
							}),
							8000,
						);
						return;
					}

					new Notice(t("statusPanelCommittingSelected"));
					const msg = getSmartCommitMessage(
						filesToCommit,
						this.plugin.settings.commitMessageTemplate,
					);
					if (!Platform.isDesktop) {
						const res = await mobileCommitAndPushSelectedFiles(
							this.app,
							filesToCommit,
							msg,
							this.plugin.settings.githubToken || undefined,
						);
						new Notice(res.message);
						if (!res.success) {
							this.plugin.lastError = res.message;
						}
					} else {
						const basePath = getVaultBasePath(this.app);
						if (!basePath) return;
						const res = await commitAndPushSelectedFiles(
							basePath,
							filesToCommit,
							msg,
							this.plugin.settings.customGitPath,
							this.plugin.settings.githubToken || undefined,
						);
						if (res.pushRejected) {
							this.plugin.lastError = "Push rejected by remote";
							this.plugin.showAntiPanicNotice(basePath, () => {
								void this.refreshView();
							});
						} else {
							new Notice(res.message);
							if (!res.success) {
								this.plugin.lastError = res.message;
							}
						}
					}
					await this.refreshView();
					void this.plugin.refreshGitStatus();
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

				const btnDiscard = fileRow.createEl("button", {
					cls: "status-file-discard-btn",
					text: "✕",
				});
				btnDiscard.title = t("statusPanelDiscardBtnTooltip");
				btnDiscard.addEventListener("click", (e) => {
					e.stopPropagation();
					void (async () => {
						const confirmed = window.confirm(
							t("statusPanelDiscardConfirm", { path: file.path }),
						);
						if (!confirmed) return;

						if (!Platform.isDesktop) {
							const res = await mobileDiscardFile(
								this.app,
								file.path,
								file.status,
							);
							new Notice(res.message);
						} else {
							const basePath = getVaultBasePath(this.app);
							if (!basePath) return;
							if (file.status === "?") {
								try {
									await this.app.vault.adapter.remove(file.path);
									new Notice(
										t("statusPanelDiscardSuccess", { path: file.path }),
									);
								} catch (err) {
									new Notice(`❌ ${String(err)}`);
								}
							} else {
								const res = await discardFileChanges(
									basePath,
									file.path,
									file.status,
									this.plugin.settings.customGitPath,
								);
								new Notice(res.message);
							}
						}
						await this.refreshView();
						void this.plugin.refreshGitStatus();
					})();
				});
			}
		}

		await this.renderRecentCommits(containerEl);
	}

	private async renderRecentCommits(containerEl: HTMLElement) {
		const recentCommitsContainer = containerEl.createDiv({
			cls: "status-recent-commits-section",
		});

		const recentTitleRow = recentCommitsContainer.createDiv({
			cls: "status-recent-title-row",
		});
		recentTitleRow.createEl("h4", {
			text: t("statusPanelRecentCommitsTitle", { count: "5" }),
		});

		let recentCommits: RecentCommit[] = [];
		if (!Platform.isDesktop) {
			recentCommits = await mobileGetRecentCommits(this.app, 5);
		} else {
			const basePath = getVaultBasePath(this.app);
			if (basePath) {
				recentCommits = await getRecentCommits(
					basePath,
					this.plugin.settings.customGitPath,
					5,
				);
			}
		}

		if (recentCommits.length === 0) {
			const emptyRow = recentCommitsContainer.createDiv({
				cls: "status-recent-empty",
			});
			emptyRow.setText(t("statusPanelNoRecentCommits"));
			return;
		}

		const commitsList = recentCommitsContainer.createDiv({
			cls: "status-recent-commits-list",
		});

		for (const commit of recentCommits) {
			const item = commitsList.createDiv({
				cls: "status-recent-commit-item",
			});

			const topRow = item.createDiv({ cls: "status-commit-item-top" });
			topRow.createSpan({
				cls: "status-commit-hash",
				text: commit.hash,
			});
			if (commit.relativeTime) {
				topRow.createSpan({
					cls: "status-commit-time",
					text: commit.relativeTime,
				});
			}

			const msgRow = item.createDiv({
				cls: "status-commit-msg",
				text: commit.message,
			});
			msgRow.title = commit.message;
		}
	}
}
