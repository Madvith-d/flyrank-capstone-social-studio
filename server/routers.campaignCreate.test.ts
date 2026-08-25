import { describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "./_core/context";

const mocks = vi.hoisted(() => ({
  createCampaign: vi.fn(),
  resolveCanonicalSource: vi.fn(),
}));

vi.mock("./db", async importOriginal => {
  const actual = await importOriginal<typeof import("./db")>();
  return {
    ...actual,
    createCampaign: mocks.createCampaign,
  };
});

vi.mock("./campaigns/ingest", () => ({
  resolveCanonicalSource: mocks.resolveCanonicalSource,
}));

import { appRouter } from "./routers";

const ctx = {
  user: { id: 1, openId: "reviewer", role: "admin" },
} as TrpcContext;

describe("campaign.create", () => {
  it("accepts a valid trimmed name and persists the resolved canonical source", async () => {
    mocks.resolveCanonicalSource.mockResolvedValue({
      sourceKind: "markdown",
      canonicalContent: "A stored canonical source for a valid campaign.",
    });
    mocks.createCampaign.mockResolvedValue({ campaign: { id: 44, name: "Launch" } });

    const result = await appRouter.createCaller(ctx).campaign.create({
      name: "  Launch  ",
      sourceKind: "markdown",
      canonicalContent: "A stored canonical source for a valid campaign.",
    });

    expect(result).toEqual({ campaign: { id: 44, name: "Launch" } });
    expect(mocks.createCampaign).toHaveBeenCalledWith({
      ownerId: 1,
      name: "Launch",
      sourceKind: "markdown",
      canonicalContent: "A stored canonical source for a valid campaign.",
    });
  });

  it("rejects a too-short name before source ingestion or persistence", async () => {
    mocks.resolveCanonicalSource.mockClear();
    mocks.createCampaign.mockClear();

    await expect(
      appRouter.createCaller(ctx).campaign.create({
        name: "A",
        sourceKind: "markdown",
        canonicalContent: "A stored canonical source for a valid campaign.",
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });

    expect(mocks.resolveCanonicalSource).not.toHaveBeenCalled();
    expect(mocks.createCampaign).not.toHaveBeenCalled();
  });
});
