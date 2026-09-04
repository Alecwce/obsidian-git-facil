import { en } from "./en";
import { es, type TranslationKeys } from "./es";

export type Language = "es" | "en" | "default";
export type { TranslationKeys };

const localeMap: Record<string, typeof es> = {
	es,
	en,
};

let currentLanguage: "es" | "en" = "es";

export function setLanguage(lang: Language): void {
	if (lang === "default") {
		const navLang =
			typeof window !== "undefined"
				? (window.localStorage?.getItem("language") ??
					navigator.language ??
					"es")
				: "es";
		currentLanguage = navLang.toLowerCase().startsWith("es") ? "es" : "en";
	} else {
		currentLanguage = lang;
	}
}

export function getCurrentLanguage(): "es" | "en" {
	return currentLanguage;
}

export function t(
	key: TranslationKeys,
	vars?: Record<string, string | number>,
): string {
	const dict = localeMap[currentLanguage] ?? es;
	let text = dict[key] ?? es[key] ?? key;

	if (vars) {
		for (const [vKey, val] of Object.entries(vars)) {
			text = text.replace(new RegExp(`\\{${vKey}\\}`, "g"), String(val));
		}
	}

	return text;
}
