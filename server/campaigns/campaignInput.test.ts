import { describe, expect, it } from "vitest";
import { getCampaignNameError } from "../../shared/campaignInput";

describe("campaign name input guard", () => {
  it("blocks missing or too-short names before a create mutation is sent", () => {
    expect(getCampaignNameError("")).toBe("Campaign name is required.");
    expect(getCampaignNameError(" ")).toBe("Campaign name is required.");
    expect(getCampaignNameError("A")).toBe("Campaign name must contain at least 2 characters.");
  });

  it("accepts a trimmed name with at least two characters", () => {
    expect(getCampaignNameError("  Launch  ")).toBeNull();
  });
});
