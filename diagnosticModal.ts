import { type App, Modal, Notice } from "obsidian";
import { getSanitizedDiagnosticReport } from "./gitHelper";
import { t } from "./i18n";
import type GitFacilPlugin from "./main";

export class DiagnosticModal extends Modal {
	private plugin: GitFacilPlugin;

	constructor(app: App, plugin: GitFacilPlugin) {
		super(app);
		this.plugin = plugin;
	}

	override onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass("git-facil-wizard");
		contentEl.addClass("git-facil-diagnostic-modal");

		const headerEl = contentEl.createDiv({ cls: "wizard-modal-header" });
		headerEl.createEl("h2", {
			text: t("diagnosticModalTitle"),
		});
		const closeBtn = headerEl.createEl("button", {
			text: "✖",
			cls: "wizard-close-btn",
		});
		closeBtn.addEventListener("click", () => this.close());

		const badge = contentEl.createDiv({ cls: "diagnostic-privacy-badge" });
		badge.setText(t("diagnosticPrivacyBadge"));

		const reportText = getSanitizedDiagnosticReport(
			this.plugin.manifest.version,
			this.plugin.lastError || undefined,
		);

		const preEl = contentEl.createEl("pre", { cls: "diagnostic-pre" });
		preEl.setText(reportText);

		const actions = contentEl.createDiv({ cls: "diagnostic-actions" });

		const copyBtn = actions.createEl("button", {
			text: t("diagnosticBtnCopy"),
			cls: "mod-cta",
		});
		copyBtn.addEventListener("click", () => {
			void (async () => {
				await navigator.clipboard.writeText(reportText);
				new Notice(t("diagnosticCopySuccess"));
			})();
		});

		const githubBtn = actions.createEl("button", {
			text: t("diagnosticBtnGitHub"),
		});
		githubBtn.addEventListener("click", () => {
			const title = encodeURIComponent(
				`[Bug]: Diagnóstico GitFacil ${this.plugin.manifest.version}`,
			);
			const body = encodeURIComponent(
				`### Descripción del problema\n(Escribe aquí qué estabas haciendo cuando ocurrió el error)\n\n${reportText}`,
			);
			const url = `https://github.com/Alecwce/obsidian-git-facil/issues/new?title=${title}&body=${body}`;
			window.open(url, "_blank");
		});
	}

	override onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}
