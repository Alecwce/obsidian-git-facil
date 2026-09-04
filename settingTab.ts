import {
	type App,
	PluginSettingTab,
	type SettingDefinitionItem,
} from "obsidian";
import { t } from "./i18n";
import { DEFAULT_SETTINGS } from "./main";
import type GitFacilPlugin from "./main";

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
