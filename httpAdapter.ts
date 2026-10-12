import { requestUrl } from "obsidian";

export interface GitHttpRequest {
	url: string;
	method?: string;
	headers?: Record<string, string>;
	body?: AsyncIterable<Uint8Array> | Uint8Array;
}

export interface GitHttpResponse {
	url: string;
	method?: string;
	statusCode: number;
	statusMessage: string;
	headers: Record<string, string>;
	body?: AsyncIterableIterator<Uint8Array>;
}

export const obsidianHttpClient = {
	request: async (req: GitHttpRequest): Promise<GitHttpResponse> => {
		let arrayBufferBody: ArrayBuffer | undefined;

		if (req.body) {
			if (req.body instanceof Uint8Array) {
				arrayBufferBody = req.body.buffer.slice(
					req.body.byteOffset,
					req.body.byteOffset + req.body.byteLength,
				) as ArrayBuffer;
			} else {
				const chunks: Uint8Array[] = [];
				for await (const chunk of req.body) {
					chunks.push(chunk);
				}
				const totalLength = chunks.reduce((acc, c) => acc + c.length, 0);
				const combined = new Uint8Array(totalLength);
				let offset = 0;
				for (const c of chunks) {
					combined.set(c, offset);
					offset += c.length;
				}
				arrayBufferBody = combined.buffer;
			}
		}

		const response = await requestUrl({
			url: req.url,
			method: req.method || "GET",
			headers: req.headers,
			body: arrayBufferBody,
			throw: false,
		});

		return {
			url: req.url,
			method: req.method,
			statusCode: response.status,
			statusMessage:
				response.status >= 200 && response.status < 300 ? "OK" : "Error",
			headers: response.headers,
			body: (async function* () {
				if (response.arrayBuffer && response.arrayBuffer.byteLength > 0) {
					yield new Uint8Array(response.arrayBuffer);
				}
			})(),
		};
	},
};
