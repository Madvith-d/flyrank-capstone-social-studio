export const CAMPAIGN_NAME_MIN_LENGTH = 2;

export function getCampaignNameError(value: string): string | null {
  const length = value.trim().length;
  if (length === 0) return "Campaign name is required.";
  if (length < CAMPAIGN_NAME_MIN_LENGTH) {
    return `Campaign name must contain at least ${CAMPAIGN_NAME_MIN_LENGTH} characters.`;
  }
  return null;
}
