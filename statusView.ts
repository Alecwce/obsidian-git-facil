import { ItemView, Notice, type WorkspaceLeaf } from "obsidian";
import {
	commitAndPushSelectedFiles,
	getAheadBehind,
	getCommitMessage,
	getCurrentBranch,
	getGitStatusResult,
	pullGitChanges,
} from "./gitHelper";
import { t } from "./i18n";
import type GitFacilPlugin from "./main";
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
				const basePath = getVaultBasePath(this.app);
				if (!basePath) return;
				new Notice(t("statusPanelPulling"));
				const res = await pullGitChanges(
					basePath,
					this.plugin.settings.customGitPath,
				);
				new Notice(res.message);
				await this.refreshView();
			})();
		});

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
			const errBox = containerEl.createDiv({ cls: "status-empty-state" });
			errBox.createEl("h2", { text: t("statusPanelErrorTitle") });
			errBox.createEl("p", { text: t("statusPanelErrorDesc") });
			return;
		}

		const changedFiles = status.files;
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
					this.plugin.settings.customGitPath,
				);
				if (res.pushRejected) {
					this.plugin.showAntiPanicNotice(basePath, () => {
						void this.refreshView();
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
}
