import { and, desc, eq, inArray, isNull, lt, lte, or, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  campaigns,
  InsertUser,
  mockDeliveries,
  publishAttempts,
  schedulerSettings,
  scheduleSlots,
  users,
  variants,
} from "../drizzle/schema";
import type { ConstraintValidation } from "./campaigns/constraints";
import type { Platform, PublisherKey } from "./campaigns/types";
import { ENV } from './_core/env';

let _db: ReturnType<typeof drizzle> | null = null;

// Lazily create the drizzle instance so local tooling can run without a DB.
export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = 'admin';
      updateSet.role = 'admin';
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet,
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);

  return result.length > 0 ? result[0] : undefined;
}

function requireDatabase(db: Awaited<ReturnType<typeof getDb>>) {
  if (!db) throw new Error("Database connection is unavailable.");
  return db;
}

export async function createCampaign(input: {
  ownerId: number;
  name: string;
  sourceKind: "url" | "markdown";
  sourceUrl?: string;
  canonicalContent: string;
}) {
  const db = requireDatabase(await getDb());
  const result = await db.insert(campaigns).values({
    ...input,
    sourceUrl: input.sourceUrl ?? null,
  });
  return getCampaignById(input.ownerId, Number((result[0] as { insertId: number }).insertId));
}

export async function listCampaigns(ownerId: number) {
  const db = requireDatabase(await getDb());
  return db.select().from(campaigns).where(eq(campaigns.ownerId, ownerId)).orderBy(desc(campaigns.updatedAt));
}

export async function getCampaignById(ownerId: number, campaignId: number) {
  const db = requireDatabase(await getDb());
  const campaign = (
    await db
      .select()
      .from(campaigns)
      .where(and(eq(campaigns.id, campaignId), eq(campaigns.ownerId, ownerId)))
      .limit(1)
  )[0];
  if (!campaign) return undefined;

  const campaignVariants = await db
    .select()
    .from(variants)
    .where(eq(variants.campaignId, campaign.id));
  const variantIds = campaignVariants.map(variant => variant.id);
  const slots = variantIds.length
    ? await db
        .select()
        .from(scheduleSlots)
        .where(inArray(scheduleSlots.variantId, variantIds))
        .orderBy(desc(scheduleSlots.scheduledAt))
    : [];
  const slotIds = slots.map(slot => slot.id);
  const attempts = slotIds.length
    ? await db
        .select()
        .from(publishAttempts)
        .where(inArray(publishAttempts.slotId, slotIds))
        .orderBy(desc(publishAttempts.createdAt))
    : [];

  return { campaign, variants: campaignVariants, slots, attempts };
}

export async function getVariantForOwner(ownerId: number, variantId: number) {
  const db = requireDatabase(await getDb());
  const row = await db
    .select({ variant: variants, campaign: campaigns })
    .from(variants)
    .innerJoin(campaigns, eq(variants.campaignId, campaigns.id))
    .where(and(eq(variants.id, variantId), eq(campaigns.ownerId, ownerId)))
    .limit(1);
  return row[0];
}

export async function replaceGeneratedVariants(
  ownerId: number,
  campaignId: number,
  generated: Array<{ platform: Platform; content: string; validation: ConstraintValidation }>
) {
  const db = requireDatabase(await getDb());
  const existing = await getCampaignById(ownerId, campaignId);
  if (!existing) throw new Error("Campaign not found.");

  for (const item of generated) {
    await db
      .insert(variants)
      .values({
        campaignId,
        platform: item.platform,
        content: item.content,
        status: "draft",
        validationSnapshot: JSON.stringify(item.validation),
      })
      .onDuplicateKeyUpdate({
        set: {
          content: item.content,
          status: "draft",
          validationSnapshot: JSON.stringify(item.validation),
          revision: sql`${variants.revision} + 1`,
          reviewedAt: null,
        },
      });
  }
  return getCampaignById(ownerId, campaignId);
}

export async function updateVariant(
  ownerId: number,
  variantId: number,
  input: { content: string; validation: ConstraintValidation }
) {
  const db = requireDatabase(await getDb());
  const row = await getVariantForOwner(ownerId, variantId);
  if (!row) return undefined;
  await db
    .update(variants)
    .set({
      content: input.content,
      validationSnapshot: JSON.stringify(input.validation),
      status: "draft",
      reviewedAt: null,
      revision: sql`${variants.revision} + 1`,
    })
    .where(eq(variants.id, variantId));
  return getVariantForOwner(ownerId, variantId);
}

export async function reviewVariant(
  ownerId: number,
  variantId: number,
  status: "approved" | "rejected"
) {
  const db = requireDatabase(await getDb());
  const row = await getVariantForOwner(ownerId, variantId);
  if (!row) return undefined;
  await db.update(variants).set({ status, reviewedAt: new Date() }).where(eq(variants.id, variantId));
  return getVariantForOwner(ownerId, variantId);
}

export async function createScheduleSlot(input: {
  variantId: number;
  scheduledAt: Date;
  idempotencyKey: string;
}) {
  const db = requireDatabase(await getDb());
  const result = await db.insert(scheduleSlots).values(input);
  const id = Number((result[0] as { insertId: number }).insertId);
  return (await db.select().from(scheduleSlots).where(eq(scheduleSlots.id, id)).limit(1))[0];
}

export async function recordMockDelivery(input: {
  adapter: "mock_x" | "mock_linkedin";
  slotId: number;
  idempotencyKey: string;
  platform: Platform;
  content: string;
}) {
  const db = requireDatabase(await getDb());
  const existing = (
    await db
      .select()
      .from(mockDeliveries)
      .where(eq(mockDeliveries.idempotencyKey, input.idempotencyKey))
      .limit(1)
  )[0];
  if (existing) {
    return { deliveryReference: existing.deliveryReference, preview: existing.preview, createdAt: existing.createdAt, duplicate: true };
  }

  const deliveryReference = `${input.adapter}:${input.slotId}:${input.idempotencyKey.slice(0, 12)}`;
  const preview = `[${input.adapter === "mock_x" ? "X" : "LinkedIn"} preview]\n\n${input.content}`;
  try {
    await db.insert(mockDeliveries).values({
      adapter: input.adapter,
      platform: input.platform,
      idempotencyKey: input.idempotencyKey,
      content: input.content,
      preview,
      deliveryReference,
    });
    return { deliveryReference, preview, createdAt: new Date(), duplicate: false };
  } catch (error) {
    const recovered = (
      await db
        .select()
        .from(mockDeliveries)
        .where(eq(mockDeliveries.idempotencyKey, input.idempotencyKey))
        .limit(1)
    )[0];
    if (recovered) {
      return { deliveryReference: recovered.deliveryReference, preview: recovered.preview, createdAt: recovered.createdAt, duplicate: true };
    }
    throw error;
  }
}

export type ClaimedDueSlot = {
  slotId: number;
  variantId: number;
  campaignId: number;
  platform: Platform;
  content: string;
  idempotencyKey: string;
  attemptNumber: number;
};

export async function claimDueSlots(now: Date, limit = 25, staleAfterMs = 5 * 60_000): Promise<ClaimedDueSlot[]> {
  const db = requireDatabase(await getDb());
  const staleBefore = new Date(now.getTime() - staleAfterMs);
  const claimable = or(
    eq(scheduleSlots.status, "pending"),
    and(
      eq(scheduleSlots.status, "processing"),
      or(isNull(scheduleSlots.claimedAt), lt(scheduleSlots.claimedAt, staleBefore))
    )
  );
  const candidates = await db
    .select()
    .from(scheduleSlots)
    .where(and(lte(scheduleSlots.scheduledAt, now), claimable))
    .orderBy(scheduleSlots.scheduledAt)
    .limit(limit);
  const claimed: ClaimedDueSlot[] = [];

  for (const candidate of candidates) {
    const update = await db
      .update(scheduleSlots)
      .set({
        status: "processing",
        claimedAt: now,
        attemptCount: sql`${scheduleSlots.attemptCount} + 1`,
        lastError: null,
      })
      .where(and(eq(scheduleSlots.id, candidate.id), claimable));
    const affectedRows = Number((update[0] as { affectedRows?: number }).affectedRows ?? 0);
    if (affectedRows !== 1) continue;

    const slot = (await db.select().from(scheduleSlots).where(eq(scheduleSlots.id, candidate.id)).limit(1))[0];
    const variant = (await db.select().from(variants).where(eq(variants.id, candidate.variantId)).limit(1))[0];
    if (!slot || !variant) continue;
    claimed.push({
      slotId: slot.id,
      variantId: variant.id,
      campaignId: variant.campaignId,
      platform: variant.platform,
      content: variant.content,
      idempotencyKey: slot.idempotencyKey,
      attemptNumber: slot.attemptCount,
    });
  }
  return claimed;
}

export async function createPublishAttempt(input: {
  slotId: number;
  idempotencyKey: string;
  attemptNumber: number;
  adapter: PublisherKey;
}) {
  const db = requireDatabase(await getDb());
  const result = await db.insert(publishAttempts).values({ ...input, status: "started" });
  return Number((result[0] as { insertId: number }).insertId);
}

export async function completePublishAttempt(input: {
  attemptId: number;
  slotId: number;
  variantId: number;
  deliveryReference: string;
  deliveryUrl?: string;
  resultPayload: Record<string, unknown>;
}) {
  const db = requireDatabase(await getDb());
  await db.transaction(async tx => {
    await tx
      .update(publishAttempts)
      .set({
        status: "succeeded",
        deliveryReference: input.deliveryReference,
        deliveryUrl: input.deliveryUrl ?? null,
        resultPayload: JSON.stringify(input.resultPayload),
        completedAt: new Date(),
      })
      .where(eq(publishAttempts.id, input.attemptId));
    await tx
      .update(scheduleSlots)
      .set({ status: "published", publishedAt: new Date(), lastError: null })
      .where(eq(scheduleSlots.id, input.slotId));
    await tx.update(variants).set({ status: "published" }).where(eq(variants.id, input.variantId));
  });
}

export async function failPublishAttempt(input: { attemptId: number; slotId: number; errorMessage: string }) {
  const db = requireDatabase(await getDb());
  await db.transaction(async tx => {
    await tx
      .update(publishAttempts)
      .set({ status: "failed", errorMessage: input.errorMessage, completedAt: new Date() })
      .where(eq(publishAttempts.id, input.attemptId));
    await tx
      .update(scheduleSlots)
      .set({ status: "pending", lastError: input.errorMessage })
      .where(eq(scheduleSlots.id, input.slotId));
  });
}

export async function getSchedulerSetting(ownerId: number) {
  const db = requireDatabase(await getDb());
  return (
    await db.select().from(schedulerSettings).where(eq(schedulerSettings.ownerId, ownerId)).limit(1)
  )[0];
}

export async function saveSchedulerSetting(input: {
  ownerId: number;
  cronExpression: string;
  scheduleCronTaskUid?: string | null;
  isEnabled: number;
  lastRunAt?: Date;
}) {
  const db = requireDatabase(await getDb());
  await db
    .insert(schedulerSettings)
    .values(input)
    .onDuplicateKeyUpdate({
      set: {
        cronExpression: input.cronExpression,
        scheduleCronTaskUid: input.scheduleCronTaskUid ?? null,
        isEnabled: input.isEnabled,
        lastRunAt: input.lastRunAt,
      },
    });
  return getSchedulerSetting(input.ownerId);
}

export async function getSchedulerSettingByTaskUid(taskUid: string) {
  const db = requireDatabase(await getDb());
  return (
    await db
      .select()
      .from(schedulerSettings)
      .where(eq(schedulerSettings.scheduleCronTaskUid, taskUid))
      .limit(1)
  )[0];
}

export async function markSchedulerRun(taskUid: string, lastRunAt: Date) {
  const db = requireDatabase(await getDb());
  await db
    .update(schedulerSettings)
    .set({ lastRunAt })
    .where(eq(schedulerSettings.scheduleCronTaskUid, taskUid));
}
