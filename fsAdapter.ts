import { type DataAdapter, normalizePath } from "obsidian";

function throwObjectNotFoundError(path: string): never {
	const err = new Error(
		`ENOENT: no such file or directory, stat '${path}'`,
	) as Error & { code: string };
	err.code = "ENOENT";
	throw err;
}

export interface IsomorphicStat {
	isFile: () => boolean;
	isDirectory: () => boolean;
	isSymbolicLink: () => boolean;
	size: number;
	mtimeMs: number;
	ctimeMs: number;
	mtime: Date;
	ctime: Date;
	mtimeSeconds: number;
	mtimeNanoseconds: number;
	ctimeSeconds: number;
	ctimeNanoseconds: number;
	mode: number;
	ino: number;
	dev: number;
	uid: number;
	gid: number;
}

export class ObsidianIsomorphicFsAdapter {
	private adapter: DataAdapter;

	promises: {
		readFile: (
			path?: string,
			options?: { encoding?: string },
		) => Promise<string | Uint8Array>;
		writeFile: (
			path: string,
			data: Uint8Array | string,
			options?: { encoding?: string },
		) => Promise<void>;
		unlink: (path: string) => Promise<void>;
		readdir: (path?: string) => Promise<string[]>;
		mkdir: (path: string, options?: { recursive?: boolean }) => Promise<void>;
		rmdir: (path: string) => Promise<void>;
		stat: (path?: string) => Promise<IsomorphicStat>;
		lstat: (path?: string) => Promise<IsomorphicStat>;
		readlink: (path: string) => Promise<string>;
		symlink: (target: string, path: string) => Promise<void>;
	};

	readFile: (
		path?: string,
		options?: { encoding?: string },
	) => Promise<string | Uint8Array>;
	writeFile: (
		path: string,
		data: Uint8Array | string,
		options?: { encoding?: string },
	) => Promise<void>;
	unlink: (path: string) => Promise<void>;
	readdir: (path?: string) => Promise<string[]>;
	mkdir: (path: string, options?: { recursive?: boolean }) => Promise<void>;
	rmdir: (path: string) => Promise<void>;
	stat: (path?: string) => Promise<IsomorphicStat>;
	lstat: (path?: string) => Promise<IsomorphicStat>;
	readlink: (path: string) => Promise<string>;
	symlink: (target: string, path: string) => Promise<void>;

	constructor(adapter: DataAdapter) {
		this.adapter = adapter;

		const cleanPath = (p?: string): string => {
			if (!p) return "";
			const rel = p.replace(/^\.\//, "").replace(/^[/\\]+/, "");
			if (rel === "." || rel === "./") return "";
			if (
				rel.startsWith(".git/") ||
				rel === ".git" ||
				rel.startsWith(".git\\")
			) {
				return rel.replace(/\\/g, "/");
			}
			if (typeof normalizePath === "function") {
				return normalizePath(rel);
			}
			return rel.replace(/\\/g, "/").replace(/\/+/g, "/");
		};

		const ensureDir = async (dirPath: string): Promise<void> => {
			if (!dirPath || dirPath === "." || dirPath === "/") return;
			const segments = dirPath.split("/").filter(Boolean);
			let current = "";
			for (const segment of segments) {
				current = current ? `${current}/${segment}` : segment;
				if (!(await this.adapter.exists(current))) {
					try {
						await this.adapter.mkdir(current);
					} catch {
						// Ignorar si ya fue creado concurrentemente
					}
				}
			}
		};

		const statFn = async (path?: string): Promise<IsomorphicStat> => {
			const p = cleanPath(path);
			if (!p || p === "." || p === "/") {
				const now = Date.now();
				const nowSec = Math.floor(now / 1000);
				const nowNano = (now % 1000) * 1_000_000;
				return {
					isFile: () => false,
					isDirectory: () => true,
					isSymbolicLink: () => false,
					size: 0,
					mtimeMs: now,
					ctimeMs: now,
					mtime: new Date(now),
					ctime: new Date(now),
					mtimeSeconds: nowSec,
					mtimeNanoseconds: nowNano,
					ctimeSeconds: nowSec,
					ctimeNanoseconds: nowNano,
					mode: 0o040755,
					ino: 0,
					dev: 0,
					uid: 0,
					gid: 0,
				};
			}

			const stat = await this.adapter.stat(p);
			if (!stat) {
				throwObjectNotFoundError(path || "");
			}

			const mtime = stat.mtime || Date.now();
			const ctime = stat.ctime || mtime;
			const mtimeSec = Math.floor(mtime / 1000);
			const mtimeNano = (mtime % 1000) * 1_000_000;
			const ctimeSec = Math.floor(ctime / 1000);
			const ctimeNano = (ctime % 1000) * 1_000_000;

			return {
				isFile: () => stat.type === "file",
				isDirectory: () => stat.type === "folder",
				isSymbolicLink: () => false,
				size: stat.size || 0,
				mtimeMs: mtime,
				ctimeMs: ctime,
				mtime: new Date(mtime),
				ctime: new Date(ctime),
				mtimeSeconds: mtimeSec,
				mtimeNanoseconds: mtimeNano,
				ctimeSeconds: ctimeSec,
				ctimeNanoseconds: ctimeNano,
				mode: stat.type === "folder" ? 0o040755 : 0o100644,
				ino: 0,
				dev: 0,
				uid: 0,
				gid: 0,
			};
		};

		const readFileFn = async (
			path = "",
			options?: { encoding?: string },
		): Promise<string | Uint8Array> => {
			const p = cleanPath(path);
			if (!p) throwObjectNotFoundError(path);
			if (!(await this.adapter.exists(p))) {
				throwObjectNotFoundError(path);
			}
			try {
				if (options?.encoding === "utf8" || options?.encoding === "utf-8") {
					return await this.adapter.read(p);
				}
				const buf = await this.adapter.readBinary(p);
				return new Uint8Array(buf);
			} catch {
				throwObjectNotFoundError(path);
			}
		};

		const writeFileFn = async (
			path: string,
			data: Uint8Array | string,
		): Promise<void> => {
			const p = cleanPath(path);
			if (!p) return;
			const lastSlash = p.lastIndexOf("/");
			if (lastSlash > 0) {
				const parent = p.slice(0, lastSlash);
				await ensureDir(parent);
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
		};

		const unlinkFn = async (path: string): Promise<void> => {
			const p = cleanPath(path);
			if (!p) return;
			if (await this.adapter.exists(p)) {
				try {
					await this.adapter.remove(p);
				} catch {
					// Ignorar si fue eliminado concurrentemente
				}
			}
		};

		const readdirFn = async (path = ""): Promise<string[]> => {
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
		};

		const mkdirFn = async (path: string): Promise<void> => {
			const p = cleanPath(path);
			if (!p || p === "." || p === "/") return;
			await ensureDir(p);
		};

		const rmdirFn = async (path: string): Promise<void> => {
			const p = cleanPath(path);
			if (!p) return;
			if (await this.adapter.exists(p)) {
				try {
					await this.adapter.rmdir(p, true);
				} catch {
					// Ignorar si ya fue eliminado
				}
			}
		};

		const readlinkFn = async (path: string): Promise<string> => {
			const err = new Error(
				`EINVAL: invalid argument, readlink '${path}'`,
			) as Error & { code: string };
			err.code = "EINVAL";
			throw err;
		};

		const symlinkFn = async (): Promise<void> => {
			throw new Error("Symlinks no soportados en Obsidian DataAdapter.");
		};

		this.promises = {
			readFile: readFileFn,
			writeFile: writeFileFn,
			unlink: unlinkFn,
			readdir: readdirFn,
			mkdir: mkdirFn,
			rmdir: rmdirFn,
			stat: statFn,
			lstat: statFn,
			readlink: readlinkFn,
			symlink: symlinkFn,
		};

		this.readFile = readFileFn;
		this.writeFile = writeFileFn;
		this.unlink = unlinkFn;
		this.readdir = readdirFn;
		this.mkdir = mkdirFn;
		this.rmdir = rmdirFn;
		this.stat = statFn;
		this.lstat = statFn;
		this.readlink = readlinkFn;
		this.symlink = symlinkFn;
	}
}
