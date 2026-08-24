import type { ClaimedDueSlot } from "../db";
import { createPublisher, resolveAdapterKey } from "./publishers";
import type { MockDeliveryStore, Platform, PublisherKey, SocialPublisher } from "./types";

export interface DueSlotStore {
  claimDueSlots(now: Date, limit?: number, staleAfterMs?: number): Promise<ClaimedDueSlot[]>;
  createPublishAttempt(input: {
    slotId: number;
    idempotencyKey: string;
    attemptNumber: number;
    adapter: PublisherKey;
  }): Promise<number>;
  completePublishAttempt(input: {
    attemptId: number;
    slotId: number;
    variantId: number;
    deliveryReference: string;
    deliveryUrl?: string;
    resultPayload: Record<string, unknown>;
  }): Promise<void>;
  failPublishAttempt(input: { attemptId: number; slotId: number; errorMessage: string }): Promise<void>;
}

export type DueSlotRunSummary = {
  claimed: number;
  delivered: number;
  failed: number;
  recoveredDuplicates: number;
};

export class DueSlotProcessor {
  constructor(
    private readonly store: DueSlotStore,
    private readonly resolvePublisher: (platform: Platform) => SocialPublisher
  ) {}

  async run(now = new Date()): Promise<DueSlotRunSummary> {
    const dueSlots = await this.store.claimDueSlots(now);
    const summary: DueSlotRunSummary = { claimed: dueSlots.length, delivered: 0, failed: 0, recoveredDuplicates: 0 };

    for (const slot of dueSlots) {
      const publisher = this.resolvePublisher(slot.platform);
      const attemptId = await this.store.createPublishAttempt({
        slotId: slot.slotId,
        idempotencyKey: slot.idempotencyKey,
        attemptNumber: slot.attemptNumber,
        adapter: publisher.key,
      });
      try {
        const result = await publisher.publish({
          slotId: slot.slotId,
          idempotencyKey: slot.idempotencyKey,
          platform: slot.platform,
          content: slot.content,
        });
        await this.store.completePublishAttempt({
          attemptId,
          slotId: slot.slotId,
          variantId: slot.variantId,
          deliveryReference: result.deliveryReference,
          deliveryUrl: result.deliveryUrl,
          resultPayload: { ...result.resultPayload, duplicateRecovered: result.duplicate },
        });
        summary.delivered += 1;
        if (result.duplicate) summary.recoveredDuplicates += 1;
      } catch (error) {
        summary.failed += 1;
        await this.store.failPublishAttempt({
          attemptId,
          slotId: slot.slotId,
          errorMessage: error instanceof Error ? error.message : "Unknown publisher error",
        });
      }
    }
    return summary;
  }
}

export function createConfiguredDueSlotProcessor(
  store: DueSlotStore,
  mockStore: MockDeliveryStore,
  adapterOverrides: Partial<Record<Platform, PublisherKey>> = {}
) {
  return new DueSlotProcessor(store, platform => {
    const key = resolveAdapterKey(platform, adapterOverrides);
    return createPublisher(key, {
      mockStore,
      telegramToken: process.env.TELEGRAM_BOT_TOKEN,
      telegramChatId: process.env.TELEGRAM_CHAT_ID,
    });
  });
}
