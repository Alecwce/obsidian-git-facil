import type { TranslationKeys } from "./es";

export const en: Record<TranslationKeys, string> = {
	// Settings
	languageSettingName: "Language / Idioma",
	languageSettingDesc:
		"Select the plugin interface language / Selecciona el idioma de la interfaz del plugin.",
	settingsHeader: "Settings",
	wizardSettingName: "Setup Wizard",
	wizardSettingDesc:
		"Configure your vault with Git step-by-step without terminal commands.",
	wizardSettingBtn: "🪄 Configure my vault",
	commitTemplateName: "Commit message template",
	commitTemplateDesc:
		"Use {fecha} to automatically insert current date and time.",
	autoSyncName: "Auto-sync",
	autoSyncDesc: "Automatically sync changes at regular intervals.",
	autoSyncIntervalName: "Auto-sync interval (minutes)",
	autoSyncIntervalDesc: "Time in minutes between each automatic sync.",
	customGitPathName: "Custom Git binary path",
	customGitPathDesc:
		"Optional: If Git is not automatically detected (e.g. macOS/Linux), enter the absolute path to the git executable (e.g. /usr/bin/git or /usr/local/bin/git).",
	customGitPathPlaceholder: "git (default)",

	// Ribbon & Commands
	ribbonCommitPush: "GitFacil",
	ribbonGitStatus: "Git Status",
	cmdCommitPush: "Commit and Push",
	cmdGitStatus: "Open Git Status panel",
	cmdOpenSetupWizard: "Open setup wizard",

	// Notices & Execution
	errVaultPath: "❌ Error: Could not get vault path.",
	errGitNotInstalled: "❌ Git not found. Download it from https://git-scm.com",
	errNotRepo:
		"❌ Your vault is not a Git repository.\nRun git init in your vault terminal.",
	errNoRemote:
		"❌ No remote configured. Run: git remote add origin <URL-of-your-repo>",
	noticeNothingToPush: "Nothing to push ✅",
	noticeCommitting: "Committing...",
	noticeCommitPushSuccess: "✅ Commit and push successful",
	noticeSyncBusy: "⏳ A sync is already in progress...",
	noticeError: "❌ Error: {msg}",

	// Side Panel (GitStatusView)
	statusPanelTitle: "📊 Git Status",
	statusPanelBranchLine: "{branch} ↑{ahead} ↓{behind}",
	statusPanelBranchNoUpstream: "{branch} (no remote)",
	statusPanelRefreshBtn: "🔄 Refresh list",
	statusPanelPullBtn: "⬇️ Pull changes",
	statusPanelPulling: "Pulling changes...",
	statusPanelCleanTitle: "All clean ✅",
	statusPanelCleanDesc: "No pending changes to save or push.",
	statusPanelCommitSelectedBtn: "🚀 Commit & push selected",
	statusPanelSelectAtLeastOne: "❌ Select at least one file.",
	statusPanelCommittingSelected: "Committing selected files...",
	statusPanelErrorTitle: "❌ Could not read Git status",
	statusPanelErrorDesc:
		"Check that Git is installed and the vault is a valid repository.",

	// Pull Notice Results
	pullNoNewChanges: "✅ No new changes",
	pullChangesDownloaded: "✅ Changes pulled",

	// Anti-Panic Notice
	antiPanicTitle: "❌ Push rejected (remote changes exist).",
	antiPanicSubtext:
		"This aligns history with GitHub without touching your files.",
	antiPanicBtn: "🔄 Sync with GitHub",
	antiPanicSyncing: "Syncing and retrying push...",

	// Setup Wizard Modal
	wizardTitle: "🪄 GitFacil Setup Wizard",
	wizardSubtitle:
		"Configure your vault step-by-step without using commands or terminal.",
	wizardStep1Title: "STEP 1: Check if Git is installed",
	wizardStep1Btn: "Check Git",
	wizardStep1Checking: "Checking...",
	wizardStep1Success: "✅ Git installed ({version})",
	wizardStep1FailText: "❌ Git not found. Download from ",
	wizardStep2Title: "STEP 2: Prepare your vault for backups",
	wizardStep2Btn: "Create repository",
	wizardStep2Creating: "Creating repository...",
	wizardStep2AlreadyRepo: "Already a Git repository ✅",
	wizardStep2Success: "Git repository created successfully ✅",
	wizardStep2Error: "❌ Error creating repository: {msg}",
	wizardStep3Title: "STEP 3: Connect with GitHub",
	wizardStep3Desc:
		"Paste your GitHub repository address (example: https://github.com/user/repo.git):",
	wizardStep3Privacy:
		"🔐 Everything Git tracks in your vault will be uploaded to that remote. Use a PRIVATE repository if your notes must stay private.",
	preflightNameOk: "✅ Identity: {name}",
	preflightNameMissing:
		'❌ Missing user.name: git config --global user.name "Your Name"',
	preflightEmailOk: "✅ Email: {email}",
	preflightEmailMissing:
		"❌ Missing user.email: git config --global user.email you@email.com",
	preflightAuthChecking: "⏳ Checking remote access...",
	preflightAuthOk: "✅ Remote access verified",
	preflightAuthFail: "❌ No remote access: check the URL and your credentials",
	wizardStep3Placeholder: "https://github.com/your-username/your-repo.git",
	wizardStep3Btn: "Connect & make first commit",
	wizardStep3Connecting: "Connecting and uploading your notes...",
	wizardStep3ErrorEmpty: "❌ Please enter your GitHub repository URL.",
	wizardStep3Success: "Connected and first commit uploaded successfully ✅",
	wizardStep3ErrorConnect: "❌ Error connecting or uploading: {msg}",

	// gitHelper messages
	gitHelperCommitSelectedSuccess:
		"✅ Commit and push of selected files successful",
	gitHelperCommitSelectedError: "❌ Error pushing selected files: {msg}",
	gitHelperPullError: "❌ Error pulling changes: {msg}",
	gitHelperSyncSuccess:
		"✅ History aligned with GitHub and push attempt successful",
	gitHelperSyncError: "❌ Error syncing with GitHub: {msg}",
	gitHelperStashPopConflict:
		"⚠️ Synced with GitHub but could not restore your local changes: {msg}. Check with: git stash list.",
	wizardStep3ErrorInvalid:
		"❌ Invalid URL. Use https://github.com/user/repo(.git) or git@github.com:user/repo.git",
};
