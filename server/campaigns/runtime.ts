import * as db from "../db";
import { createConfiguredDueSlotProcessor } from "./processor";
import type { MockDeliveryStore } from "./types";

const dueSlotStore = {
  claimDueSlots: db.claimDueSlots,
  createPublishAttempt: db.createPublishAttempt,
  completePublishAttempt: db.completePublishAttempt,
  failPublishAttempt: db.failPublishAttempt,
};

const mockDeliveryStore: MockDeliveryStore = {
  recordMockDelivery: input => db.recordMockDelivery(input),
};

export async function runConfiguredDueSlotProcessor(now = new Date()) {
  const processor = createConfiguredDueSlotProcessor(dueSlotStore, mockDeliveryStore);
  return processor.run(now);
}
