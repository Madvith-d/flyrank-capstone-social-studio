import { describe, expect, it } from "vitest";
import { resolveSchedulerState } from "./schedulerState";

describe("scheduler query state", () => {
  it("returns a defined, disabled default when a user has no scheduler record", () => {
    expect(resolveSchedulerState(7, undefined)).toEqual({
      id: null,
      ownerId: 7,
      cronExpression: "0 * * * * *",
      scheduleCronTaskUid: null,
      isEnabled: 0,
      lastRunAt: null,
      createdAt: null,
      updatedAt: null,
    });
  });

  it("preserves a configured scheduler record", () => {
    const record = {
      id: 3,
      ownerId: 7,
      cronExpression: "0 */5 * * * *",
      scheduleCronTaskUid: "heartbeat-3",
      isEnabled: 1,
      lastRunAt: new Date("2026-08-25T00:00:00.000Z"),
      createdAt: new Date("2026-08-24T00:00:00.000Z"),
      updatedAt: new Date("2026-08-25T00:00:00.000Z"),
    };
    expect(resolveSchedulerState(7, record)).toBe(record);
  });
});
