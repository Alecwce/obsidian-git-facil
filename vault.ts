import type { App } from "obsidian";

export function getVaultBasePath(app: App): string {
	const adapter = app.vault.adapter as { getBasePath?: () => string };
	return adapter.getBasePath?.() ?? "";
}
