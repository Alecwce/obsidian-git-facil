import {
	type App,
	Notice,
	PluginSettingTab,
	type SettingDefinitionItem,
} from "obsidian";
import { checkRemoteAuth } from "./gitHelper";
import { t } from "./i18n";
import type GitFacilPlugin from "./main";
import { DEFAULT_SETTINGS } from "./main";

export class GitFacilSettingTab extends PluginSettingTab {
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
			{
				name: t("syncOnStartupName"),
				desc: t("syncOnStartupDesc"),
				control: {
					type: "toggle",
					key: "syncOnStartup",
					defaultValue: DEFAULT_SETTINGS.syncOnStartup,
				},
			},
			{
				name: t("githubTokenName"),
				desc: t("githubTokenDesc"),
				control: {
					type: "text",
					key: "githubToken",
					defaultValue: DEFAULT_SETTINGS.githubToken,
					placeholder: t("githubTokenPlaceholder"),
				},
			},
			{
				name: t("customGitPathName"),
				desc: t("customGitPathDesc"),
				control: {
					type: "text",
					key: "customGitPath",
					defaultValue: DEFAULT_SETTINGS.customGitPath,
					placeholder: t("customGitPathPlaceholder"),
				},
			},
		];
	}

	override async setControlValue(key: string, value: unknown): Promise<void> {
		(this.plugin.settings as unknown as Record<string, unknown>)[key] = value;
		await this.plugin.saveSettings();
	}

	override display(): void {
		super.display();

		const container = this.containerEl;

		// Card de Token y Conexión Rápida
		const tokenSection = container.createDiv({
			cls: "git-facil-settings-card",
		});
		tokenSection.style.margin = "18px 0";
		tokenSection.style.padding = "14px";
		tokenSection.style.borderRadius = "8px";
		tokenSection.style.backgroundColor = "var(--background-secondary)";
		tokenSection.style.border = "1px solid var(--background-modifier-border)";

		tokenSection.createEl("h3", {
			text: "🔑 Conexión Rápida con GitHub (PAT)",
		});
		tokenSection.createEl("p", {
			text: "Para sincronizar con repositorios privados sin ingresar tu contraseña manualmente, genera un Token de Acceso Personal (PAT) con permiso 'repo'.",
			cls: "setting-item-description",
		});

		const btnRow = tokenSection.createDiv({ cls: "git-facil-btn-row" });
		btnRow.style.display = "flex";
		btnRow.style.gap = "10px";
		btnRow.style.marginTop = "10px";

		const genBtn = btnRow.createEl("button", {
			text: t("btnGenerateToken"),
			cls: "mod-cta",
		});
		genBtn.addEventListener("click", () => {
			window.open(
				"https://github.com/settings/tokens/new?description=Obsidian+GitFacil&scopes=repo",
				"_blank",
			);
		});

		const testBtn = btnRow.createEl("button", {
			text: t("btnTestToken"),
		});
		testBtn.addEventListener("click", () => {
			void (async () => {
				const token = this.plugin.settings.githubToken?.trim();
				if (!token) {
					new Notice("⚠️ Ingresa un token arriba antes de probar.");
					return;
				}
				new Notice("🔍 Probando autenticación con GitHub...");
				const res = await checkRemoteAuth(
					"https://github.com/Alecwce/ryukami-labs-vault.git",
					this.plugin.settings.customGitPath,
					token,
				);
				if (res.ok) {
					new Notice(t("noticeTestTokenSuccess"));
				} else {
					new Notice(
						`${t("noticeTestTokenFail")}: ${res.error || "Token inválido"}`,
					);
				}
			})();
		});

		// Card de Guía Multi-dispositivo y prevención de riesgos
		const guideSection = container.createDiv({ cls: "git-facil-guide-card" });
		guideSection.style.margin = "18px 0";
		guideSection.style.padding = "14px";
		guideSection.style.borderRadius = "8px";
		guideSection.style.backgroundColor = "var(--background-secondary)";
		guideSection.style.border = "1px solid var(--background-modifier-border)";

		guideSection.createEl("h3", {
			text: "🛡️ Guía para Sincronizar entre Móvil y PC",
		});
		const list = guideSection.createEl("ul");
		list.style.paddingLeft = "20px";
		list.style.fontSize = "0.9em";
		list.style.lineHeight = "1.6";

		list.createEl("li", {
			text: "✅ Regla de Oro: Haz 'Pull' (o activa Sincronizar al iniciar) antes de empezar a escribir en la laptop.",
		});
		list.createEl("li", {
			text: "🚀 Al terminar de escribir: Haz 'Commit y Push' (icono de cohete) para que tus notas suban a la nube de inmediato.",
		});
		list.createEl("li", {
			text: "📱 En Móviles: Puedes sincronizar tus notas con el mismo repositorio usando Obsidian Git o Termux en Android.",
		});
		list.createEl("li", {
			text: "🔒 Tus notas son 100% privadas: El token no se guarda en el historial de Git y las notas solo existen en tu cuenta de GitHub.",
		});
	}
}
