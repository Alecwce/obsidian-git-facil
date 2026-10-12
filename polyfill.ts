import { Buffer } from "buffer";

// Polyfill Buffer para entornos móviles (Android / iOS WebView) donde Node.js no está presente
if (
	typeof (globalThis as unknown as { Buffer?: typeof Buffer }).Buffer ===
	"undefined"
) {
	(globalThis as unknown as { Buffer: typeof Buffer }).Buffer = Buffer;
}

if (
	typeof window !== "undefined" &&
	typeof (window as unknown as { Buffer?: typeof Buffer }).Buffer ===
		"undefined"
) {
	(window as unknown as { Buffer: typeof Buffer }).Buffer = Buffer;
}
