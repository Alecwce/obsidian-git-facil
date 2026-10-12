import type { DataAdapter } from "obsidian";
import { describe, expect, it } from "vitest";
import { ObsidianIsomorphicFsAdapter } from "./fsAdapter";

class MockDataAdapter {
	files: Map<string, string | Uint8Array> = new Map();
	folders: Set<string> = new Set();

	async exists(path: string): Promise<boolean> {
		return this.files.has(path) || this.folders.has(path);
	}

	async read(path: string): Promise<string> {
		const val = this.files.get(path);
		if (val === undefined) throw new Error("File not found");
		if (typeof val === "string") return val;
		return new TextDecoder().decode(val);
	}

	async readBinary(path: string): Promise<ArrayBuffer> {
		const val = this.files.get(path);
		if (val === undefined) throw new Error("File not found");
		if (typeof val === "string") {
			return new TextEncoder().encode(val).buffer;
		}
		return val.buffer.slice(
			val.byteOffset,
			val.byteOffset + val.byteLength,
		) as ArrayBuffer;
	}

	async write(path: string, data: string): Promise<void> {
		this.files.set(path, data);
	}

	async writeBinary(path: string, data: ArrayBuffer): Promise<void> {
		this.files.set(path, new Uint8Array(data));
	}

	async mkdir(path: string): Promise<void> {
		this.folders.add(path);
	}

	async rmdir(path: string, _recursive?: boolean): Promise<void> {
		this.folders.delete(path);
		for (const key of this.files.keys()) {
			if (key.startsWith(`${path}/`)) this.files.delete(key);
		}
	}

	async remove(path: string): Promise<void> {
		this.files.delete(path);
		this.folders.delete(path);
	}

	async list(path: string): Promise<{ files: string[]; folders: string[] }> {
		const files: string[] = [];
		const folders: string[] = [];
		const prefix = path ? `${path}/` : "";
		for (const key of this.files.keys()) {
			if (key.startsWith(prefix)) {
				const rest = key.slice(prefix.length);
				if (!rest.includes("/")) files.push(key);
			}
		}
		for (const key of this.folders) {
			if (key.startsWith(prefix)) {
				const rest = key.slice(prefix.length);
				if (!rest.includes("/")) folders.push(key);
			}
		}
		return { files, folders };
	}

	async stat(path: string) {
		if (this.files.has(path)) {
			const data = this.files.get(path);
			const size =
				typeof data === "string" ? data.length : data?.byteLength || 0;
			return {
				type: "file" as const,
				size,
				mtime: Date.now(),
				ctime: Date.now(),
			};
		}
		if (this.folders.has(path)) {
			return {
				type: "folder" as const,
				size: 0,
				mtime: Date.now(),
				ctime: Date.now(),
			};
		}
		return null;
	}
}

describe("ObsidianIsomorphicFsAdapter", () => {
	it("debería devolver stats con campos completos requeridos por isomorphic-git", async () => {
		const mock = new MockDataAdapter();
		await mock.write("nota.md", "# Contenido");
		const fs = new ObsidianIsomorphicFsAdapter(mock as unknown as DataAdapter);

		const stat = await fs.promises.stat("nota.md");
		expect(stat.isFile()).toBe(true);
		expect(stat.isDirectory()).toBe(false);
		expect(stat.size).toBe(11);
		expect(typeof stat.mtimeMs).toBe("number");
		expect(typeof stat.ctimeMs).toBe("number");
		expect(stat.mtime instanceof Date).toBe(true);
		expect(stat.ctime instanceof Date).toBe(true);
		expect(typeof stat.mtime.valueOf()).toBe("number");
		expect(typeof stat.ctime.valueOf()).toBe("number");
		expect(typeof stat.mtimeSeconds).toBe("number");
		expect(typeof stat.ctimeSeconds).toBe("number");
		expect(typeof stat.mode).toBe("number");
	});

	it("debería lanzar error ENOENT en archivos inexistentes", async () => {
		const mock = new MockDataAdapter();
		const fs = new ObsidianIsomorphicFsAdapter(mock as unknown as DataAdapter);

		try {
			await fs.promises.stat("inexistente.md");
			expect.unreachable();
		} catch (error) {
			const err = error as Error & { code?: string };
			expect(err.code).toBe("ENOENT");
		}
	});

	it("debería escribir archivos creando directorios padre automáticamente", async () => {
		const mock = new MockDataAdapter();
		const fs = new ObsidianIsomorphicFsAdapter(mock as unknown as DataAdapter);

		await fs.promises.writeFile(".git/objects/4b/test.txt", "objeto git");
		const content = await fs.promises.readFile(".git/objects/4b/test.txt", {
			encoding: "utf8",
		});
		expect(content).toBe("objeto git");
	});

	it("debería soportar checkout con force: true sobreescribiendo archivos preexistentes", async () => {
		const git = await import("isomorphic-git");
		const mock = new MockDataAdapter();
		const fs = new ObsidianIsomorphicFsAdapter(mock as unknown as DataAdapter);

		// Inicializar repo en mock fs
		await git.default.init({ fs, dir: "", defaultBranch: "main" });
		await fs.promises.writeFile("nota.md", "remoto");
		await git.default.add({ fs, dir: "", filepath: "nota.md" });
		await git.default.commit({
			fs,
			dir: "",
			message: "commit inicial",
			author: { name: "test", email: "test@example.com" },
		});

		// Simular archivo local preexistente con contenido diferente y sin index
		await fs.promises.writeFile("nota.md", "local conflictivo");
		await fs.promises.unlink(".git/index");

		// Checkout forzado debe sobreescribir sin arrojar CheckoutConflictError
		await git.default.checkout({
			fs,
			dir: "",
			ref: "main",
			force: true,
		});

		const res = await fs.promises.readFile("nota.md", { encoding: "utf8" });
		expect(res).toBe("remoto");
	});
});
