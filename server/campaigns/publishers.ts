import type {
  MockDeliveryStore,
  Platform,
  PublisherKey,
  PublishInput,
  PublishResult,
  SocialPublisher,
} from "./types";

export class PublisherConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PublisherConfigurationError";
  }
}

class MockPublisher implements SocialPublisher {
  constructor(
    public readonly key: "mock_x" | "mock_linkedin",
    private readonly store: MockDeliveryStore
  ) {}

  async publish(input: PublishInput): Promise<PublishResult> {
    const delivery = await this.store.recordMockDelivery({ ...input, adapter: this.key });
    return {
      adapter: this.key,
      deliveryReference: delivery.deliveryReference,
      resultPayload: { preview: delivery.preview, recordedAt: delivery.createdAt.toISOString() },
      duplicate: delivery.duplicate,
    };
  }
}

class TelegramPublisher implements SocialPublisher {
  readonly key = "telegram" as const;

  constructor(
    private readonly token: string | undefined,
    private readonly chatId: string | undefined
  ) {}

  async publish(input: PublishInput): Promise<PublishResult> {
    if (!this.token || !this.chatId) {
      throw new PublisherConfigurationError(
        "Telegram publishing is not configured. Provide TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID before scheduling a Telegram delivery."
      );
    }

    const auditMarker = `\n\n[sms:${input.idempotencyKey}]`;
    const message = `${input.content.slice(0, 4096 - auditMarker.length)}${auditMarker}`;
    const response = await fetch(`https://api.telegram.org/bot${this.token}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: this.chatId, text: message, disable_web_page_preview: false }),
    });
    const body = (await response.json()) as {
      ok?: boolean;
      description?: string;
      result?: { message_id?: number; chat?: { username?: string } };
    };
    if (!response.ok || !body.ok || !body.result?.message_id) {
      throw new Error(body.description ?? "Telegram did not confirm delivery.");
    }

    const username = body.result.chat?.username;
    return {
      adapter: "telegram",
      deliveryReference: `telegram:${body.result.message_id}`,
      deliveryUrl: username ? `https://t.me/${username}/${body.result.message_id}` : undefined,
      resultPayload: { messageId: body.result.message_id, chatUsername: username ?? null },
      duplicate: false,
    };
  }
}

export function resolveAdapterKey(platform: Platform, overrides: Partial<Record<Platform, PublisherKey>> = {}): PublisherKey {
  if (overrides[platform]) return overrides[platform]!;
  const configured = process.env[`PUBLISHER_${platform.toUpperCase()}`] as PublisherKey | undefined;
  if (configured === "telegram" || configured === "mock_x" || configured === "mock_linkedin") {
    return configured;
  }
  return platform === "x" ? "mock_x" : platform === "linkedin" ? "mock_linkedin" : "telegram";
}

export function createPublisher(
  key: PublisherKey,
  dependencies: { mockStore: MockDeliveryStore; telegramToken?: string; telegramChatId?: string }
): SocialPublisher {
  if (key === "mock_x" || key === "mock_linkedin") {
    return new MockPublisher(key, dependencies.mockStore);
  }
  return new TelegramPublisher(dependencies.telegramToken, dependencies.telegramChatId);
}
