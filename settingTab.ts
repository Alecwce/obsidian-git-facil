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
				name: t("btnGenerateToken"),
				desc: "Abre GitHub para generar un Token de Acceso Personal (PAT) con alcance 'repo'.",
				action: () => {
					window.open(
						"https://github.com/settings/tokens/new?description=Obsidian+GitFacil&scopes=repo",
						"_blank",
					);
				},
			},
			{
				name: t("btnTestToken"),
				desc: "Verifica que el token configurado pueda comunicarse con GitHub.",
				action: () => {
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
}
