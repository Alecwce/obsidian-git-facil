import { Buffer } from "buffer/";

// Polyfill Buffer para entornos móviles y navegadores
if (typeof window !== "undefined") {
	const win = window as unknown as { Buffer?: typeof Buffer };
	if (typeof win.Buffer === "undefined") {
		win.Buffer = Buffer;
	}
}
