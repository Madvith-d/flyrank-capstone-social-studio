export const PLATFORM_ORDER = ["x", "linkedin", "telegram"] as const;

export type Platform = (typeof PLATFORM_ORDER)[number];
export type VariantStatus = "draft" | "approved" | "rejected" | "published";
export type PublisherKey = "telegram" | "mock_x" | "mock_linkedin";

export type ConstraintProfile = {
  platform: Platform;
  label: string;
  maxCharacters: number;
  minCharacters: number;
  maxHashtags: number;
  requiredPhrases: string[];
  forbiddenPhrases: string[];
  tone: string;
};

export type PublishInput = {
  slotId: number;
  idempotencyKey: string;
  platform: Platform;
  content: string;
};

export type PublishResult = {
  adapter: PublisherKey;
  deliveryReference: string;
  deliveryUrl?: string;
  resultPayload: Record<string, unknown>;
  duplicate: boolean;
};

export interface SocialPublisher {
  readonly key: PublisherKey;
  publish(input: PublishInput): Promise<PublishResult>;
}

export type MockDeliveryRecord = {
  deliveryReference: string;
  preview: string;
  createdAt: Date;
};

export interface MockDeliveryStore {
  recordMockDelivery(input: PublishInput & { adapter: "mock_x" | "mock_linkedin" }): Promise<MockDeliveryRecord & { duplicate: boolean }>;
}
