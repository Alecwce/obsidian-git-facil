import { type App, Modal } from "obsidian";
import {
	getCommitMessage,
	getGitVersion,
	initGitRepo,
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
					this.plugin.settings.customGitPath,
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
