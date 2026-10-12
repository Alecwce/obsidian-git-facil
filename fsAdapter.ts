import { type DataAdapter, normalizePath } from "obsidian";

function throwObjectNotFoundError(path: string): never {
	const err = new Error(
		`ENOENT: no such file or directory, stat '${path}'`,
	) as Error & { code: string };
	err.code = "ENOENT";
	throw err;
}

export class ObsidianIsomorphicFsAdapter {
	private adapter: DataAdapter;

	promises: {
		readFile: (
			path: string,
			options?: { encoding?: string },
		) => Promise<string | Uint8Array>;
		writeFile: (
			path: string,
			data: Uint8Array | string,
			options?: { encoding?: string },
		) => Promise<void>;
		unlink: (path: string) => Promise<void>;
		readdir: (path: string) => Promise<string[]>;
		mkdir: (path: string, options?: { recursive?: boolean }) => Promise<void>;
		rmdir: (path: string) => Promise<void>;
		stat: (path: string) => Promise<{
			isFile: () => boolean;
			isDirectory: () => boolean;
			isSymbolicLink: () => boolean;
			size: number;
			mtimeMs: number;
			mode: number;
			ino: number;
			dev: number;
			uid: number;
			gid: number;
		}>;
		lstat: (path: string) => Promise<{
			isFile: () => boolean;
			isDirectory: () => boolean;
			isSymbolicLink: () => boolean;
			size: number;
			mtimeMs: number;
			mode: number;
			ino: number;
			dev: number;
			uid: number;
			gid: number;
		}>;
		readlink: (path: string) => Promise<string>;
		symlink: (target: string, path: string) => Promise<void>;
	};

	constructor(adapter: DataAdapter) {
		this.adapter = adapter;

		const cleanPath = (p: string) => {
			const rel = p.replace(/^[/\\]+/, "");
			if (rel.startsWith(".git/") || rel === ".git") {
				return rel;
			}
			return normalizePath(rel);
		};

		this.promises = {
			readFile: async (path: string, options?: { encoding?: string }) => {
				const p = cleanPath(path);
				if (options?.encoding === "utf8" || options?.encoding === "utf-8") {
					return await this.adapter.read(p);
				}
				const buf = await this.adapter.readBinary(p);
				return new Uint8Array(buf);
			},

			writeFile: async (path: string, data: Uint8Array | string) => {
				const p = cleanPath(path);
				const lastSlash = p.lastIndexOf("/");
				if (lastSlash > 0) {
					const parent = p.slice(0, lastSlash);
					if (!(await this.adapter.exists(parent))) {
						await this.adapter.mkdir(parent);
					}
				}
				if (typeof data === "string") {
					await this.adapter.write(p, data);
				} else {
					const arrayBuffer = data.buffer.slice(
						data.byteOffset,
						data.byteOffset + data.byteLength,
					) as ArrayBuffer;
					await this.adapter.writeBinary(p, arrayBuffer);
				}
			},

			unlink: async (path: string) => {
				const p = cleanPath(path);
				if (await this.adapter.exists(p)) {
					await this.adapter.remove(p);
				}
			},

			readdir: async (path: string) => {
				const p = cleanPath(path);
				if (p && !(await this.adapter.exists(p))) {
					throwObjectNotFoundError(path);
				}
				const listing = await this.adapter.list(p);
				const names = [...listing.files, ...listing.folders].map((item) => {
					const segments = item.split(/[/\\]/);
					return segments[segments.length - 1];
				});
				return names;
			},

			mkdir: async (path: string) => {
				const p = cleanPath(path);
				if (!(await this.adapter.exists(p))) {
					await this.adapter.mkdir(p);
				}
			},

			rmdir: async (path: string) => {
				const p = cleanPath(path);
				if (await this.adapter.exists(p)) {
					await this.adapter.rmdir(p, true);
				}
			},

			stat: async (path: string) => {
				const p = cleanPath(path);
				if (!p) {
					return {
						isFile: () => false,
						isDirectory: () => true,
						isSymbolicLink: () => false,
						size: 0,
						mtimeMs: Date.now(),
						mode: 0o777,
						ino: 0,
						dev: 0,
						uid: 0,
						gid: 0,
					};
				}
				const stat = await this.adapter.stat(p);
				if (!stat) {
					throwObjectNotFoundError(path);
				}
				return {
					isFile: () => stat.type === "file",
					isDirectory: () => stat.type === "folder",
					isSymbolicLink: () => false,
					size: stat.size || 0,
					mtimeMs: stat.mtime || Date.now(),
					mode: stat.type === "folder" ? 0o777 : 0o666,
					ino: 0,
					dev: 0,
					uid: 0,
					gid: 0,
				};
			},

			lstat: async (path: string) => {
				return await this.promises.stat(path);
			},

			readlink: async () => {
				throw new Error("Symlinks no soportados en Obsidian DataAdapter.");
			},

			symlink: async () => {
				throw new Error("Symlinks no soportados en Obsidian DataAdapter.");
			},
		};
	}
}
