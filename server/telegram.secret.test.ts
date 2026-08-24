import { describe, expect, it } from "vitest";

const token = process.env.TELEGRAM_BOT_TOKEN;

describe("Telegram publisher credentials", () => {
  it.skipIf(!token)("validates the configured bot token with Telegram getMe", async () => {
    const response = await fetch(`https://api.telegram.org/bot${token}/getMe`, {
      signal: AbortSignal.timeout(12_000),
    });
    const body = (await response.json()) as { ok?: boolean; description?: string };

    expect(response.ok, body.description).toBe(true);
    expect(body.ok, body.description).toBe(true);
  }, 15_000);
});
