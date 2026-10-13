import {
	type App,
	Notice,
	PluginSettingTab,
	requestUrl,
	type Setting,
	type SettingDefinitionItem,
} from "obsidian";
import { CloneVaultModal } from "./cloneModal";
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
				render: (setting: Setting) => {
					let isVisible = false;
					let textInputEl: HTMLInputElement | null = null;
					setting
						.addText((text) => {
							textInputEl = text.inputEl;
							textInputEl.type = "password";
							text
								.setPlaceholder(t("githubTokenPlaceholder"))
								.setValue(this.plugin.settings.githubToken ?? "")
								.onChange(async (val) => {
									this.plugin.settings.githubToken = val;
									await this.plugin.saveSettings();
								});
						})
						.addExtraButton((btn) => {
							btn
								.setIcon("eye")
								.setTooltip(t("tokenVisibilityToggle"))
								.onClick(() => {
									isVisible = !isVisible;
									if (textInputEl) {
										textInputEl.type = isVisible ? "text" : "password";
									}
									btn.setIcon(isVisible ? "eye-off" : "eye");
								});
						});
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
						try {
							const res = await requestUrl({
								url: "https://api.github.com/user",
								method: "GET",
								headers: {
									Authorization: `Bearer ${token}`,
									"User-Agent": "obsidian-git-facil",
								},
								throw: false,
							});
							if (res.status === 200) {
								const login = (res.json as { login?: string })?.login ?? "";
								new Notice(
									login
										? `✅ Conexión con GitHub exitosa (Usuario: @${login})`
										: t("noticeTestTokenSuccess"),
								);
								return;
							}
							if (res.status === 401) {
								new Notice(
									"❌ Token rechazado por GitHub: credenciales inválidas o expiradas.",
								);
								return;
							}
							// Para Fine-grained tokens sin permiso de usuario, probar con /zen
							const zenRes = await requestUrl({
								url: "https://api.github.com/zen",
								method: "GET",
								headers: {
									Authorization: `token ${token}`,
									"User-Agent": "obsidian-git-facil",
								},
								throw: false,
							});
							if (zenRes.status === 200) {
								new Notice("✅ Token reconocido por GitHub exitosamente.");
							} else {
								new Notice(
									`⚠️ GitHub respondió con código ${res.status}. Verifica que el token tenga permiso 'repo'.`,
								);
							}
						} catch (error) {
							const msg =
								error instanceof Error ? error.message : String(error);
							new Notice(`❌ Error de conexión al probar token: ${msg}`);
						}
					})();
				},
			},
			{
				name: "📥 Clonar o Conectar Bóveda desde GitHub",
				desc: "Descarga o conecta un repositorio existente de GitHub en este dispositivo.",
				action: () => {
					new CloneVaultModal(this.app, this.plugin).open();
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
