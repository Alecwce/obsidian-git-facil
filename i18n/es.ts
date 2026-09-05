export const es = {
	// Settings
	languageSettingName: "Idioma / Language",
	languageSettingDesc:
		"Selecciona el idioma de la interfaz del plugin / Select the plugin interface language.",
	settingsHeader: "Configuración",
	wizardSettingName: "Asistente de configuración",
	wizardSettingDesc:
		"Configura tu bóveda con Git paso a paso sin usar comandos ni la terminal.",
	wizardSettingBtn: "🪄 Configurar mi bóveda",
	commitTemplateName: "Plantilla del mensaje de commit",
	commitTemplateDesc:
		"Usa {fecha} para insertar automáticamente la fecha y hora.",
	autoSyncName: "Auto-sync",
	autoSyncDesc:
		"Sincroniza automáticamente los cambios a intervalos regulares.",
	autoSyncIntervalName: "Intervalo de Auto-sync (minutos)",
	autoSyncIntervalDesc:
		"Tiempo en minutos entre cada sincronización automática.",
	customGitPathName: "Ruta personalizada de Git",
	customGitPathDesc:
		"Opcional: Si Git no se detecta automáticamente (ej. macOS/Linux), ingresa la ruta absoluta al ejecutable (ej. /usr/bin/git o /usr/local/bin/git).",
	customGitPathPlaceholder: "git (por defecto)",

	// Ribbon & Commands
	ribbonCommitPush: "GitFacil",
	ribbonGitStatus: "Estado de Git",
	cmdCommitPush: "Commit y Push",
	cmdGitStatus: "Abrir panel de Estado de Git",
	cmdOpenSetupWizard: "Abrir asistente de configuración",

	// Notices & Execution
	errVaultPath: "❌ Error: No se pudo obtener la ruta de la bóveda.",
	errGitNotInstalled:
		"❌ No se encontró Git. Descárgalo de https://git-scm.com",
	errNotRepo:
		"❌ Tu bóveda no es un repositorio Git.\nEjecuta en la terminal de tu bóveda: git init",
	errNoRemote:
		"❌ No hay remote. Ejecuta: git remote add origin <URL-de-tu-repo>",
	noticeNothingToPush: "Nada que subir ✅",
	noticeCommitting: "Comitiendo...",
	noticeCommitPushSuccess: "✅ Commit y push exitosos",
	noticeSyncBusy: "⏳ Ya hay una sincronización en curso...",
	noticeError: "❌ Error: {msg}",

	// Side Panel (GitStatusView)
	statusPanelTitle: "📊 Estado de Git",
	statusPanelBranchLine: "{branch} ↑{ahead} ↓{behind}",
	statusPanelBranchNoUpstream: "{branch} (sin remoto)",
	statusPanelRefreshBtn: "🔄 Actualizar lista",
	statusPanelPullBtn: "⬇️ Bajar cambios (Pull)",
	statusPanelPulling: "Bajando cambios...",
	statusPanelCleanTitle: "Todo limpio ✅",
	statusPanelCleanDesc: "No hay cambios pendientes por guardar o subir.",
	statusPanelCommitSelectedBtn: "🚀 Commit y push de lo marcado",
	statusPanelSelectAtLeastOne: "❌ Selecciona al menos un archivo.",
	statusPanelCommittingSelected: "Comitiendo archivos marcados...",
	statusPanelErrorTitle: "❌ No se pudo leer el estado de Git",
	statusPanelErrorDesc:
		"Revisa que Git esté instalado y que la bóveda sea un repositorio válido.",

	// Pull Notice Results
	pullNoNewChanges: "✅ Sin cambios nuevos",
	pullChangesDownloaded: "✅ Cambios bajados",

	// Anti-Panic Notice
	antiPanicTitle:
		"❌ El push fue rechazado (existen cambios remotos pendientes).",
	antiPanicSubtext:
		"Esto alinea la historia con GitHub sin tocar tus archivos.",
	antiPanicBtn: "🔄 Sincronizar con GitHub",
	antiPanicSyncing: "Sincronizando e intentando push nuevamente...",

	// Setup Wizard Modal
	wizardTitle: "🪄 Asistente de configuración de GitFacil",
	wizardSubtitle:
		"Configura tu bóveda paso a paso sin usar comandos ni la terminal.",
	wizardStep1Title: "PASO 1: Comprobar si tienes Git instalado",
	wizardStep1Btn: "Comprobar Git",
	wizardStep1Checking: "Comprobando...",
	wizardStep1Success: "✅ Git instalado ({version})",
	wizardStep1FailText: "❌ Git no encontrado. Descárgalo desde ",
	wizardStep2Title: "PASO 2: Preparar tu bóveda para respaldos",
	wizardStep2Btn: "Crear repositorio",
	wizardStep2Creating: "Creando repositorio...",
	wizardStep2AlreadyRepo: "Ya es un repositorio Git ✅",
	wizardStep2Success: "Repositorio Git creado exitosamente ✅",
	wizardStep2Error: "❌ Error al crear repositorio: {msg}",
	wizardStep3Title: "PASO 3: Conectar con GitHub",
	wizardStep3Desc:
		"Pega la dirección de tu repositorio de GitHub (ejemplo: https://github.com/usuario/repo.git):",
	wizardStep3Privacy:
		"🔐 Todo lo que Git rastree en tu bóveda se subirá a ese remoto. Usa un repositorio PRIVADO si tus notas no deben ser públicas.",
	preflightNameOk: "✅ Identidad: {name}",
	preflightNameMissing:
		'❌ Falta user.name: git config --global user.name "Tu Nombre"',
	preflightEmailOk: "✅ Email: {email}",
	preflightEmailMissing:
		"❌ Falta user.email: git config --global user.email tu@email.com",
	preflightAuthChecking: "⏳ Comprobando acceso al remoto...",
	preflightAuthOk: "✅ Acceso al remoto verificado",
	preflightAuthFail:
		"❌ Sin acceso al remoto: revisa la URL y tus credenciales",
	ghAvailable: "✅ GitHub CLI: {account}",
	ghMissing:
		"⚠️ gh no instalado (opcional): https://cli.github.com — también puedes pegar la URL manualmente",
	ghNotLogged:
		"⚠️ gh sin sesión: ejecuta `gh auth login` en tu terminal — o usa token manual abajo",
	createRepoTitle: "O crea un repositorio nuevo en GitHub",
	createRepoNamePlaceholder: "nombre-del-repo",
	createRepoPrivate: "Privado (recomendado)",
	createRepoBtn: "Crear repo y subir",
	createRepoCreating: "Creando repositorio...",
	tokenTitle: "O usa un token manual de GitHub",
	tokenDesc:
		"Se guarda en texto plano en la carpeta del plugin. Crea un token con el scope repo mínimo y revócalo si lo expones.",
	tokenPlaceholder: "ghp_...",
	tokenVerifyBtn: "Verificar y guardar",
	tokenClearBtn: "Borrar token",
	tokenVerifying: "Verificando...",
	tokenSavedOk: "✅ Token válido ({login}), guardado",
	tokenInvalid: "❌ Token inválido o sin acceso",
	tokenCleared: "Token borrado",
	tokenSaved: "✅ Token guardado (oculto por seguridad)",
	wizardStep3Placeholder: "https://github.com/tu-usuario/tu-repositorio.git",
	wizardStep3Btn: "Conectar y hacer primer commit",
	wizardStep3Connecting: "Conectando y subiendo tus notas...",
	wizardStep3ErrorEmpty:
		"❌ Por favor ingresa la URL de tu repositorio de GitHub.",
	wizardStep3Success: "Conectado y primer commit subido exitosamente ✅",
	wizardStep3ErrorConnect: "❌ Error al conectar o subir: {msg}",

	// gitHelper messages
	gitHelperCommitSelectedSuccess:
		"✅ Commit y push de los archivos marcados exitoso",
	gitHelperCommitSelectedError: "❌ Error al subir marcados: {msg}",
	gitHelperPullError: "❌ Error al bajar cambios: {msg}",
	gitHelperSyncSuccess:
		"✅ Historia alineada con GitHub e intento de push exitoso",
	gitHelperSyncError: "❌ Error al sincronizar con GitHub: {msg}",
	gitHelperStashPopConflict:
		"⚠️ Sincronizado con GitHub pero no se pudo restaurar tus cambios locales: {msg}. Revisa con: git stash list.",
	wizardStep3ErrorInvalid:
		"❌ URL inválida. Usa https://github.com/usuario/repo(.git) o git@github.com:usuario/repo.git",
};

export type TranslationKeys = keyof typeof es;
