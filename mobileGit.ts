import git from "isomorphic-git";
import type { App } from "obsidian";
import { ObsidianIsomorphicFsAdapter } from "./fsAdapter";
import { obsidianHttpClient } from "./httpAdapter";

export interface MobileGitResult {
	success: boolean;
	message: string;
}

function getAuthCallback(token?: string) {
	return () => {
		if (token && token.trim().length > 0) {
			const clean = token.trim();
			const basicValue =
				typeof btoa === "function"
					? btoa(`x-access-token:${clean}`)
					: Buffer.from(`x-access-token:${clean}`).toString("base64");
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
		const matrix = await git.statusMatrix({ fs, dir: "" });

		let changesCount = 0;
		for (const [filepath, head, workdir, stage] of matrix) {
			// Ignorar archivos dentro de .obsidian/workspace o .trash
			if (
				filepath.startsWith(".trash") ||
				filepath.includes("workspace") ||
				filepath === ".git"
			) {
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

export async function mobilePull(
	app: App,
	token?: string,
	authorName = "Obsidian User",
	authorEmail = "obsidian@user.local",
): Promise<MobileGitResult> {
	const fs = new ObsidianIsomorphicFsAdapter(app.vault.adapter);
	try {
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
		for (const [filepath, head, workdir, stage] of matrix) {
			if (
				filepath.startsWith(".trash") ||
				filepath.includes("workspace") ||
				filepath === ".git"
			) {
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
