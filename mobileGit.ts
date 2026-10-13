import git from "isomorphic-git";
import type { App } from "obsidian";
import { ObsidianIsomorphicFsAdapter } from "./fsAdapter";
import {
	getBasicAuthHeaderValue,
	isInternalGitFacilIgnored,
	isNetworkOrOfflineError,
} from "./gitHelper";
import { obsidianHttpClient } from "./httpAdapter";
import { t } from "./i18n";

export interface MobileGitResult {
	success: boolean;
	message: string;
}

function getAuthCallback(token?: string) {
	return () => {
		if (token && token.trim().length > 0) {
			const clean = token.trim();
			const basicValue = getBasicAuthHeaderValue(clean);
			return {
				username: "x-access-token",
				password: clean,
				headers: {
					Authorization: `Basic ${basicValue}`,
				},
			};
		}
		return undefined;
	};
}

export async function isMobileRepo(app: App): Promise<boolean> {
	return await app.vault.adapter.exists(".git");
}

export async function cloneVault(
	app: App,
	url: string,
	token?: string,
	branch = "main",
	onProgress?: (phase: string, loaded: number, total: number) => void,
): Promise<MobileGitResult> {
	const fs = new ObsidianIsomorphicFsAdapter(app.vault.adapter);
	const targetBranch = branch.trim() || "main";
	try {
		// Limpiar residuo de .git si una clonación previa falló a la mitad
		if (await app.vault.adapter.exists(".git")) {
			try {
				await app.vault.adapter.rmdir(".git", true);
			} catch {
				// Ignorar si no se puede eliminar
			}
		}

		await git.clone({
			fs,
			http: obsidianHttpClient,
			dir: "",
			url: url.trim(),
			ref: targetBranch,
			singleBranch: true,
			depth: 1,
			noCheckout: true,
			onAuth: getAuthCallback(token),
			onProgress: (event) => {
				onProgress?.(event.phase, event.loaded, event.total);
			},
		});

		const current =
			(await git.currentBranch({ fs, dir: "", fullname: false })) ||
			targetBranch;

		// Checkout con force: true para sobreescribir limpiamente archivos iniciales
		// generados por Obsidian (.obsidian/app.json, plugins, etc.) sin CheckoutConflictError
		await git.checkout({
			fs,
			dir: "",
			ref: current,
			force: true,
			onProgress: (event) => {
				onProgress?.(event.phase, event.loaded, event.total);
			},
		});

		return {
			success: true,
			message: "✅ Bóveda clonada exitosamente desde GitHub.",
		};
	} catch (error) {
		const msg = error instanceof Error ? error.message : String(error);
		return {
			success: false,
			message: `❌ Error al clonar bóveda: ${msg}`,
		};
	}
}

export async function mobileCommitAndPush(
	app: App,
	commitMessage: string,
	token?: string,
	authorName = "Obsidian User",
	authorEmail = "obsidian@user.local",
): Promise<MobileGitResult> {
	const fs = new ObsidianIsomorphicFsAdapter(app.vault.adapter);
	try {
		if (!(await mobileHasRemote(app))) {
			return {
				success: false,
				message:
					"⚠️ No hay repositorio remoto configurado en esta bóveda. Clona tu bóveda o configura la URL remota.",
			};
		}

		const matrix = await git.statusMatrix({ fs, dir: "" });

		let changesCount = 0;
		const cfgDir = app.vault.configDir;
		for (const [filepath, head, workdir, stage] of matrix) {
			if (isInternalGitFacilIgnored(filepath, cfgDir)) {
				continue;
			}

			// Modificado o nuevo
			if (workdir !== stage || (head !== 0 && workdir === 0)) {
				if (workdir === 0) {
					// Archivo eliminado
					await git.remove({ fs, dir: "", filepath });
					changesCount++;
				} else {
					// Archivo nuevo o editado
					await git.add({ fs, dir: "", filepath });
					changesCount++;
				}
			}
		}

		if (changesCount === 0) {
			// Si no hay cambios locales pendientes, bajar cambios de la nube
			return await mobilePull(app, token, authorName, authorEmail);
		}

		await git.commit({
			fs,
			dir: "",
			message: commitMessage,
			author: { name: authorName, email: authorEmail },
		});

		await git.push({
			fs,
			http: obsidianHttpClient,
			dir: "",
			onAuth: getAuthCallback(token),
		});

		return {
			success: true,
			message: "🚀 Notas guardadas y sincronizadas con GitHub con éxito.",
		};
	} catch (error) {
		const msg = error instanceof Error ? error.message : String(error);
		if (isNetworkOrOfflineError(msg)) {
			return {
				success: true,
				message: t("noticeOfflineSavedLocal"),
			};
		}
		return {
			success: false,
			message: `❌ Error de sincronización móvil: ${msg}`,
		};
	}
}

export async function mobileHasRemote(
	app: App,
	remoteName = "origin",
): Promise<boolean> {
	const fs = new ObsidianIsomorphicFsAdapter(app.vault.adapter);
	try {
		const remotes = await git.listRemotes({ fs, dir: "" });
		return remotes.some((r) => r.remote === remoteName);
	} catch {
		return false;
	}
}

export async function mobileGetRemoteUrl(
	app: App,
	remoteName = "origin",
): Promise<string | null> {
	const fs = new ObsidianIsomorphicFsAdapter(app.vault.adapter);
	try {
		const remotes = await git.listRemotes({ fs, dir: "" });
		const found = remotes.find((r) => r.remote === remoteName);
		return found?.url || null;
	} catch {
		return null;
	}
}

export async function mobileSetRemoteUrl(
	app: App,
	url: string,
	remoteName = "origin",
): Promise<MobileGitResult> {
	const fs = new ObsidianIsomorphicFsAdapter(app.vault.adapter);
	const cleanUrl = url.trim();
	try {
		if (!(await app.vault.adapter.exists(".git"))) {
			await git.init({ fs, dir: "", defaultBranch: "main" });
		}
		const remotes = await git.listRemotes({ fs, dir: "" });
		if (remotes.some((r) => r.remote === remoteName)) {
			await git.deleteRemote({ fs, dir: "", remote: remoteName });
		}
		await git.addRemote({ fs, dir: "", remote: remoteName, url: cleanUrl });
		return {
			success: true,
			message: `✅ Repositorio remoto ${remoteName} configurado correctamente.`,
		};
	} catch (error) {
		const msg = error instanceof Error ? error.message : String(error);
		return {
			success: false,
			message: `❌ Error al configurar remoto: ${msg}`,
		};
	}
}

export function refreshMobileFileTree(app: App): void {
	try {
		const leaves = app.workspace.getLeavesOfType("file-explorer");
		for (const leaf of leaves) {
			const view = leaf.view as unknown as { reload?: () => void };
			if (typeof view.reload === "function") {
				view.reload();
			}
		}
	} catch {
		// Silencioso si no está disponible la vista
	}
}

export const smartMergeDriver = async ({
	contents,
	path,
}: {
	branches: string[];
	contents: string[];
	path: string;
}): Promise<{ mergedText: string; cleanMerge: boolean }> => {
	const [_base, _ours, theirs] = contents;
	const normalized = path.replace(/\\/g, "/");

	// 1. Archivos internos de Git y Obsidian: priorizar la versión remota consolidada
	if (
		normalized === ".gitignore" ||
		normalized === ".stignore" ||
		normalized.startsWith(".obsidian/") ||
		normalized.startsWith(".obsidian\\")
	) {
		return { cleanMerge: true, mergedText: theirs };
	}

	// 2. Notas de usuario: fusionar preservando ambos contenidos si divergieron
	if (_ours && theirs && _ours !== theirs) {
		const combined = `${_ours.trim()}\n\n---\n<!-- 🔄 Sincronizado desde otro dispositivo -->\n${theirs.trim()}\n`;
		return { cleanMerge: true, mergedText: combined };
	}

	return { cleanMerge: true, mergedText: theirs || _ours };
};

async function performMobilePull(
	fs: ObsidianIsomorphicFsAdapter,
	token?: string,
	authorName = "Obsidian User",
	authorEmail = "obsidian@user.local",
): Promise<{ pulled: boolean }> {
	const current =
		(await git.currentBranch({ fs, dir: "", fullname: false })) || "main";

	const { fetchHead } = await git.fetch({
		fs,
		http: obsidianHttpClient,
		dir: "",
		ref: current,
		singleBranch: true,
		onAuth: getAuthCallback(token),
	});

	if (!fetchHead) {
		return { pulled: false };
	}

	let beforeOid: string | null = null;
	try {
		beforeOid = await git.resolveRef({ fs, dir: "", ref: current });
	} catch {
		// Silencioso
	}

	try {
		await git.merge({
			fs,
			dir: "",
			ours: current,
			theirs: fetchHead,
			fastForward: true,
			mergeDriver: smartMergeDriver,
			abortOnConflict: false,
			author: { name: authorName, email: authorEmail },
			committer: { name: authorName, email: authorEmail },
		});
	} catch {
		// Fallback anti-pánico: si el merge de 3 vías encuentra conflicto irresoluble,
		// alinear la rama local directamente con el remoto de GitHub
		try {
			await git.writeRef({
				fs,
				dir: "",
				ref: `refs/heads/${current}`,
				value: fetchHead,
				force: true,
			});
		} catch {
			// Silencioso
		}
	}

	let afterOid: string | null = null;
	try {
		afterOid = await git.resolveRef({ fs, dir: "", ref: current });
	} catch {
		// Silencioso
	}

	// Forzar checkout para sobreescribir working tree limpiamente evitando conflictos
	await git.checkout({
		fs,
		dir: "",
		ref: current,
		force: true,
	});

	return { pulled: beforeOid !== afterOid };
}

export async function mobilePull(
	app: App,
	token?: string,
	authorName = "Obsidian User",
	authorEmail = "obsidian@user.local",
): Promise<MobileGitResult> {
	const fs = new ObsidianIsomorphicFsAdapter(app.vault.adapter);
	try {
		if (!(await mobileHasRemote(app))) {
			return {
				success: false,
				message:
					"⚠️ No hay repositorio remoto configurado en esta bóveda. Clona tu bóveda o configura la URL remota.",
			};
		}
		const { pulled } = await performMobilePull(
			fs,
			token,
			authorName,
			authorEmail,
		);
		refreshMobileFileTree(app);
		if (pulled) {
			return {
				success: true,
				message: "📥 Notas descargadas y actualizadas desde la nube.",
			};
		}
		return {
			success: true,
			message: "🟢 Tu bóveda ya está al día con la nube.",
		};
	} catch (error) {
		const msg = error instanceof Error ? error.message : String(error);
		if (isNetworkOrOfflineError(msg)) {
			return {
				success: false,
				message: t("noticeOfflinePull"),
			};
		}
		return {
			success: false,
			message: `❌ Error al descargar cambios: ${msg}`,
		};
	}
}

export async function mobileFullSync(
	app: App,
	commitMessage: string,
	token?: string,
	authorName = "Obsidian User",
	authorEmail = "obsidian@user.local",
): Promise<MobileGitResult> {
	const fs = new ObsidianIsomorphicFsAdapter(app.vault.adapter);
	try {
		if (!(await mobileHasRemote(app))) {
			return {
				success: false,
				message:
					"⚠️ No hay repositorio remoto configurado en esta bóveda. Clona tu bóveda o configura la URL remota.",
			};
		}

		// 1. Descargar y combinar cambios remotos primero (pull)
		try {
			await performMobilePull(fs, token, authorName, authorEmail);
		} catch (pullErr) {
			const pMsg = pullErr instanceof Error ? pullErr.message : String(pullErr);
			if (isNetworkOrOfflineError(pMsg)) {
				return {
					success: false,
					message: t("noticeOfflinePull"),
				};
			}
		}

		// 2. Comprobar cambios locales, staging y commit
		const matrix = await git.statusMatrix({ fs, dir: "" });
		let changesCount = 0;
		const cfgDir = app.vault.configDir;
		for (const [filepath, head, workdir, stage] of matrix) {
			if (isInternalGitFacilIgnored(filepath, cfgDir)) {
				continue;
			}
			if (workdir !== stage || (head !== 0 && workdir === 0)) {
				if (workdir === 0) {
					await git.remove({ fs, dir: "", filepath });
					changesCount++;
				} else {
					await git.add({ fs, dir: "", filepath });
					changesCount++;
				}
			}
		}

		if (changesCount > 0) {
			await git.commit({
				fs,
				dir: "",
				message: commitMessage,
				author: { name: authorName, email: authorEmail },
			});
		}

		// 3. Subir todos los commits locales a la nube
		try {
			await git.push({
				fs,
				http: obsidianHttpClient,
				dir: "",
				onAuth: getAuthCallback(token),
			});
		} catch (pushErr) {
			const pMsg = pushErr instanceof Error ? pushErr.message : String(pushErr);
			if (isNetworkOrOfflineError(pMsg)) {
				return {
					success: true,
					message: t("noticeOfflineSavedLocal"),
				};
			}
			throw pushErr;
		}

		refreshMobileFileTree(app);
		return {
			success: true,
			message: t("noticeFullSyncSuccess"),
		};
	} catch (error) {
		const msg = error instanceof Error ? error.message : String(error);
		return {
			success: false,
			message: `❌ Error en sincronización completa: ${msg}`,
		};
	}
}

export async function mobileGetPendingCount(app: App): Promise<number> {
	const fs = new ObsidianIsomorphicFsAdapter(app.vault.adapter);
	try {
		if (!(await app.vault.adapter.exists(".git"))) {
			return 0;
		}
		const matrix = await git.statusMatrix({ fs, dir: "" });
		let count = 0;
		const cfgDir = app.vault.configDir;
		for (const [filepath, head, workdir, stage] of matrix) {
			if (isInternalGitFacilIgnored(filepath, cfgDir)) {
				continue;
			}
			if (workdir !== stage || (head !== 0 && workdir === 0)) {
				count++;
			}
		}
		return count;
	} catch {
		return 0;
	}
}

export interface MobileFileStatus {
	path: string;
	status: string;
}

export interface MobileStatusResult {
	ok: boolean;
	branch: string;
	hasRemote: boolean;
	files: MobileFileStatus[];
	error?: string;
}

export async function mobileGetStatus(app: App): Promise<MobileStatusResult> {
	const fs = new ObsidianIsomorphicFsAdapter(app.vault.adapter);
	try {
		if (!(await app.vault.adapter.exists(".git"))) {
			return {
				ok: false,
				branch: "main",
				hasRemote: false,
				files: [],
				error: "Git no inicializado en la bóveda",
			};
		}
		const branch =
			(await git.currentBranch({ fs, dir: "", fullname: false })) || "main";
		const hasRemote = await mobileHasRemote(app);
		const matrix = await git.statusMatrix({ fs, dir: "" });
		const files: MobileFileStatus[] = [];
		const cfgDir = app.vault.configDir;

		for (const [filepath, head, workdir, stage] of matrix) {
			if (isInternalGitFacilIgnored(filepath, cfgDir)) {
				continue;
			}

			if (head === 1 && workdir === 1 && stage === 1) {
				continue;
			}

			let status = "M";
			if (workdir === 0) {
				status = "D";
			} else if (head === 0 && stage === 0) {
				status = "?";
			} else if (head === 0) {
				status = "A";
			} else if (workdir === 2 || stage !== 1) {
				status = "M";
			}

			files.push({ path: filepath, status });
		}

		return { ok: true, branch, hasRemote, files };
	} catch (error) {
		const msg = error instanceof Error ? error.message : String(error);
		return {
			ok: false,
			branch: "main",
			hasRemote: false,
			files: [],
			error: msg,
		};
	}
}

export async function mobileCommitAndPushSelectedFiles(
	app: App,
	files: string[],
	commitMessage: string,
	token?: string,
	authorName = "Obsidian User",
	authorEmail = "obsidian@user.local",
): Promise<MobileGitResult> {
	const fs = new ObsidianIsomorphicFsAdapter(app.vault.adapter);
	try {
		if (!(await mobileHasRemote(app))) {
			return {
				success: false,
				message:
					"⚠️ No hay repositorio remoto configurado en esta bóveda. Clona tu bóveda o configura la URL remota.",
			};
		}
		const cfgDir = app.vault.configDir;
		for (const filepath of files) {
			if (isInternalGitFacilIgnored(filepath, cfgDir)) continue;
			const exists = await app.vault.adapter.exists(filepath);
			if (exists) {
				await git.add({ fs, dir: "", filepath });
			} else {
				await git.remove({ fs, dir: "", filepath });
			}
		}

		await git.commit({
			fs,
			dir: "",
			message: commitMessage,
			author: { name: authorName, email: authorEmail },
		});

		await git.push({
			fs,
			http: obsidianHttpClient,
			dir: "",
			onAuth: getAuthCallback(token),
		});

		return {
			success: true,
			message: "🚀 Archivos seleccionados sincronizados con éxito.",
		};
	} catch (error) {
		const msg = error instanceof Error ? error.message : String(error);
		return {
			success: false,
			message: `❌ Error al subir cambios: ${msg}`,
		};
	}
}
