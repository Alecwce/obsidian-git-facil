import { describe, expect, it } from "vitest";
import { getCommitMessage } from "./gitHelper";

describe("getCommitMessage", () => {
	it("debería generar el mensaje de commit con el formato correcto 📝 notas <YYYY-MM-DD HH:mm>", () => {
		const testDate = new Date(2026, 7, 4, 17, 45, 0); // 2026-08-04 17:45
		const message = getCommitMessage(testDate);
		expect(message).toBe("📝 notas 2026-08-04 17:45");
	});
});
