export type SchedulingControlState = {
  canActivate: boolean;
  label: string;
  helper: string;
};

export function getSchedulingControlState(
  isProduction: boolean,
  isEnabled: boolean
): SchedulingControlState {
  if (!isProduction) {
    return {
      canActivate: false,
      label: "Publish to activate",
      helper: "Automatic callbacks are enabled from the published site. Local review can use Run due now.",
    };
  }
  return {
    canActivate: true,
    label: isEnabled ? "Refresh auto-run" : "Activate auto-run",
    helper: "The recurring callback checks approved delivery slots every minute.",
  };
}
