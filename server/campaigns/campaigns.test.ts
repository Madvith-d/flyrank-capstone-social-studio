import { TRPCError } from "@trpc/server";
import { describe, expect, it } from "vitest";
import { ConstraintViolation, validateVariant } from "./constraints";
import { generateAllDeterministicVariants } from "./generation";
import { DueSlotProcessor, type DueSlotStore } from "./processor";
import { createPublisher } from "./publishers";
import type { ClaimedDueSlot } from "../db";
import type { MockDeliveryStore, Platform, PublisherKey } from "./types";
import { assertVariantCanBeScheduled } from "./workflow";

const source = {
  content:
    "A durable social campaign begins with one clear canonical source. Reliable review gates, explicit publishing adapters, and stable idempotency keys make scheduled communication safer and easier to explain.",
  sourceUrl: "https://example.com/canonical-source",
};

class InMemoryMockStore implements MockDeliveryStore {
  private readonly rows = new Map<string, { deliveryReference: string; preview: string; createdAt: Date }>();

  async recordMockDelivery(input: {
    adapter: "mock_x" | "mock_linkedin";
    slotId: number;
    idempotencyKey: string;
    platform: Platform;
    content: string;
  }) {
    const existing = this.rows.get(input.idempotencyKey);
    if (existing) return { ...existing, duplicate: true };
    const row = {
      deliveryReference: `${input.adapter}:${input.slotId}`,
      preview: `${input.adapter}: ${input.content}`,
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
    };
    this.rows.set(input.idempotencyKey, row);
    return { ...row, duplicate: false };
  }

  get count() {
    return this.rows.size;
  }
}

class MemoryDueStore implements DueSlotStore {
  constructor(private pending: ClaimedDueSlot[]) {}
  readonly attempts: Array<{ id: number; status: "started" | "succeeded" | "failed"; slotId: number }> = [];
  readonly completedSlots = new Set<number>();
  private nextAttemptId = 1;

  async claimDueSlots() {
    const next = this.pending.filter(slot => !this.completedSlots.has(slot.slotId));
    this.pending = [];
    return next;
  }

  async createPublishAttempt(input: { slotId: number }) {
    const id = this.nextAttemptId++;
    this.attempts.push({ id, status: "started", slotId: input.slotId });
    return id;
  }

  async completePublishAttempt(input: { attemptId: number; slotId: number }) {
    this.attempts.find(attempt => attempt.id === input.attemptId)!.status = "succeeded";
    this.completedSlots.add(input.slotId);
  }

  async failPublishAttempt(input: { attemptId: number; slotId: number }) {
    this.attempts.find(attempt => attempt.id === input.attemptId)!.status = "failed";
    this.pending.push({
      slotId: input.slotId,
      variantId: 4,
      campaignId: 2,
      platform: "x",
      content: "Key idea: Retry-safe delivery preserves a single outcome. #ContentStrategy",
      idempotencyKey: "resume-key",
      attemptNumber: 2,
    });
  }
}

describe("deterministic campaign core", () => {
  it("generates all configured variants from only the stored canonical source", () => {
    const generated = generateAllDeterministicVariants(source);
    expect(generated.map(item => item.platform)).toEqual(["x", "linkedin", "telegram"]);
    expect(generated.every(item => item.validation.valid)).toBe(true);
    expect(generated[0].content).toContain("Key idea:");
    expect(generated[1].content).toContain("Why it matters:");
    expect(generated[2].content).toContain("Read more:");
  });

  it("blocks a rule-breaking variant before review", () => {
    const result = validateVariant("x", "Buy now! #one #two #three");
    expect(result.valid).toBe(false);
    expect(result.issues.map(issue => issue.code)).toEqual(expect.arrayContaining(["min_length", "hashtags", "tone"]));
    expect(() => {
      if (!result.valid) throw new ConstraintViolation(result);
    }).toThrow("X-style update");
  });

  it("refuses scheduling a variant that is not approved with a client-visible 4xx tRPC error", () => {
    expect(() => assertVariantCanBeScheduled("draft")).toThrow(TRPCError);
    try {
      assertVariantCanBeScheduled("rejected");
    } catch (error) {
      expect(error).toBeInstanceOf(TRPCError);
      expect((error as TRPCError).code).toBe("BAD_REQUEST");
      expect((error as TRPCError).message).toContain("approved variant");
    }
    expect(() => assertVariantCanBeScheduled("approved")).not.toThrow();
  });

  it("uses the stable idempotency key to make a repeated mock publish produce one preview", async () => {
    const store = new InMemoryMockStore();
    const publisher = createPublisher("mock_x", { mockStore: store });
    const input = {
      slotId: 11,
      idempotencyKey: "variant-4:slot-11",
      platform: "x" as const,
      content: "Key idea: stable keys make a repeat safe. #ContentStrategy",
    };
    const first = await publisher.publish(input);
    const second = await publisher.publish(input);
    expect(first.duplicate).toBe(false);
    expect(second.duplicate).toBe(true);
    expect(second.deliveryReference).toBe(first.deliveryReference);
    expect(store.count).toBe(1);
  });

  it("resumes an interrupted due slot without recording a second successful delivery", async () => {
    const slot: ClaimedDueSlot = {
      slotId: 8,
      variantId: 4,
      campaignId: 2,
      platform: "x",
      content: "Key idea: Retry-safe delivery preserves a single outcome. #ContentStrategy",
      idempotencyKey: "resume-key",
      attemptNumber: 1,
    };
    const store = new MemoryDueStore([slot]);
    let shouldFail = true;
    const processor = new DueSlotProcessor(store, () => ({
      key: "mock_x" as const,
      async publish() {
        if (shouldFail) {
          shouldFail = false;
          throw new Error("simulated worker interruption");
        }
        return {
          adapter: "mock_x" as const,
          deliveryReference: "mock_x:8",
          resultPayload: { resumed: true },
          duplicate: false,
        };
      },
    }));
    const firstRun = await processor.run(new Date("2026-01-01T00:00:00.000Z"));
    const secondRun = await processor.run(new Date("2026-01-01T00:01:00.000Z"));
    expect(firstRun.failed).toBe(1);
    expect(secondRun.delivered).toBe(1);
    expect(store.attempts.filter(attempt => attempt.status === "succeeded")).toHaveLength(1);
    expect(store.completedSlots.has(8)).toBe(true);
  });

  it("swaps mock adapters by configuration without changing the publish processor", async () => {
    const store = new InMemoryMockStore();
    const payload = {
      slotId: 21,
      idempotencyKey: "swap-key",
      platform: "x" as const,
      content: "Key idea: adapters isolate platform behavior. #ContentStrategy",
    };
    const adapterKeys: PublisherKey[] = ["mock_x", "mock_linkedin"];
    const results = await Promise.all(adapterKeys.map(key => createPublisher(key, { mockStore: store }).publish({ ...payload, idempotencyKey: `${payload.idempotencyKey}:${key}` })));
    expect(results.map(result => result.adapter)).toEqual(adapterKeys);
    expect(store.count).toBe(2);
  });
});
