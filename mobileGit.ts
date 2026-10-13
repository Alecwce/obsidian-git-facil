import git from "isomorphic-git";
import type { App } from "obsidian";
import { ObsidianIsomorphicFsAdapter } from "./fsAdapter";
import {
	getBasicAuthHeaderValue,
	isInternalGitFacilIgnored,
} from "./gitHelper";
import { obsidianHttpClient } from "./httpAdapter";

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
			// Intentar pull para ver si hay cambios remotos
			await git.pull({
				fs,
				http: obsidianHttpClient,
				dir: "",
				singleBranch: true,
				author: { name: authorName, email: authorEmail },
				onAuth: getAuthCallback(token),
			});
			return {
				success: true,
				message: "🟢 Al día: No hay cambios locales pendientes.",
			};
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
		await git.pull({
			fs,
			http: obsidianHttpClient,
			dir: "",
			singleBranch: true,
			author: { name: authorName, email: authorEmail },
			onAuth: getAuthCallback(token),
		});
		return {
			success: true,
			message: "📥 Notas descargadas y actualizadas desde la nube.",
		};
	} catch (error) {
		const msg = error instanceof Error ? error.message : String(error);
		return {
			success: false,
			message: `❌ Error al descargar cambios: ${msg}`,
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
