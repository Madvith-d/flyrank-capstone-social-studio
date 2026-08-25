import { describe, expect, it } from "vitest";
import { getSchedulingControlState } from "../../shared/schedulingControl";

describe("recurring scheduler control state", () => {
  it("prevents a preview from sending the production-only activation mutation", () => {
    expect(getSchedulingControlState(false, false)).toEqual({
      canActivate: false,
      label: "Publish to activate",
      helper: "Automatic callbacks are enabled from the published site. Local review can use Run due now.",
    });
  });

  it("keeps production activation available and reflects current status", () => {
    expect(getSchedulingControlState(true, false).label).toBe("Activate auto-run");
    expect(getSchedulingControlState(true, true).label).toBe("Refresh auto-run");
    expect(getSchedulingControlState(true, true).canActivate).toBe(true);
  });
});
