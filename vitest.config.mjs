import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		alias: {
			obsidian: new URL("./tests/obsidian-mock.ts", import.meta.url).pathname,
		},
	},
});
