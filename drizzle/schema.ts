import {
  datetime,
  index,
  int,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/mysql-core";

export const platforms = ["x", "linkedin", "telegram"] as const;
export const sourceKinds = ["url", "markdown"] as const;
export const variantStatuses = ["draft", "approved", "rejected", "published"] as const;
export const slotStatuses = ["pending", "processing", "published", "failed"] as const;
export const attemptStatuses = ["started", "succeeded", "failed", "duplicate"] as const;
export const publisherKinds = ["telegram", "mock_x", "mock_linkedin"] as const;

/** Identity table provided by the full-stack template. */
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

/** A stored source is the only input permitted for campaign variant generation. */
export const campaigns = mysqlTable(
  "campaigns",
  {
    id: int("id").autoincrement().primaryKey(),
    ownerId: int("ownerId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 160 }).notNull(),
    sourceKind: mysqlEnum("sourceKind", sourceKinds).notNull(),
    sourceUrl: varchar("sourceUrl", { length: 2048 }),
    canonicalContent: text("canonicalContent").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [index("campaigns_owner_idx").on(table.ownerId)]
);

/** A reviewable, platform-specific social post derived from one canonical campaign source. */
export const variants = mysqlTable(
  "variants",
  {
    id: int("id").autoincrement().primaryKey(),
    campaignId: int("campaignId")
      .notNull()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    platform: mysqlEnum("platform", platforms).notNull(),
    content: text("content").notNull(),
    status: mysqlEnum("status", variantStatuses).default("draft").notNull(),
    validationSnapshot: text("validationSnapshot").notNull(),
    revision: int("revision").default(1).notNull(),
    reviewedAt: timestamp("reviewedAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [
    uniqueIndex("variants_campaign_platform_unique").on(table.campaignId, table.platform),
    index("variants_campaign_status_idx").on(table.campaignId, table.status),
  ]
);

/** A durable calendar slot. The unique slot and key enforce one intended delivery per variant/time pair. */
export const scheduleSlots = mysqlTable(
  "scheduleSlots",
  {
    id: int("id").autoincrement().primaryKey(),
    variantId: int("variantId")
      .notNull()
      .references(() => variants.id, { onDelete: "cascade" }),
    scheduledAt: datetime("scheduledAt").notNull(),
    status: mysqlEnum("status", slotStatuses).default("pending").notNull(),
    idempotencyKey: varchar("idempotencyKey", { length: 128 }).notNull(),
    claimedAt: timestamp("claimedAt"),
    publishedAt: timestamp("publishedAt"),
    attemptCount: int("attemptCount").default(0).notNull(),
    lastError: text("lastError"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [
    uniqueIndex("schedule_slots_variant_time_unique").on(table.variantId, table.scheduledAt),
    uniqueIndex("schedule_slots_idempotency_unique").on(table.idempotencyKey),
    index("schedule_slots_due_idx").on(table.status, table.scheduledAt),
  ]
);

/** An immutable record of every execution attempt and its delivery outcome. */
export const publishAttempts = mysqlTable(
  "publishAttempts",
  {
    id: int("id").autoincrement().primaryKey(),
    slotId: int("slotId")
      .notNull()
      .references(() => scheduleSlots.id, { onDelete: "cascade" }),
    idempotencyKey: varchar("idempotencyKey", { length: 128 }).notNull(),
    attemptNumber: int("attemptNumber").notNull(),
    adapter: mysqlEnum("adapter", publisherKinds).notNull(),
    status: mysqlEnum("status", attemptStatuses).notNull(),
    deliveryReference: varchar("deliveryReference", { length: 512 }),
    deliveryUrl: varchar("deliveryUrl", { length: 2048 }),
    resultPayload: text("resultPayload"),
    errorMessage: text("errorMessage"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    completedAt: timestamp("completedAt"),
  },
  table => [
    index("publish_attempts_slot_idx").on(table.slotId, table.createdAt),
    index("publish_attempts_idempotency_idx").on(table.idempotencyKey),
  ]
);

/** A local delivery outbox used by mock adapters as both preview storage and a unique idempotency ledger. */
export const mockDeliveries = mysqlTable(
  "mockDeliveries",
  {
    id: int("id").autoincrement().primaryKey(),
    adapter: mysqlEnum("adapter", ["mock_x", "mock_linkedin"]).notNull(),
    platform: mysqlEnum("platform", platforms).notNull(),
    idempotencyKey: varchar("idempotencyKey", { length: 128 }).notNull(),
    content: text("content").notNull(),
    preview: text("preview").notNull(),
    deliveryReference: varchar("deliveryReference", { length: 512 }).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [uniqueIndex("mock_deliveries_idempotency_unique").on(table.idempotencyKey)]
);

/** Per-owner recurring scheduler configuration. The persisted task UID is the only scheduler callback lookup key. */
export const schedulerSettings = mysqlTable(
  "schedulerSettings",
  {
    id: int("id").autoincrement().primaryKey(),
    ownerId: int("ownerId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    scheduleCronTaskUid: varchar("scheduleCronTaskUid", { length: 65 }),
    cronExpression: varchar("cronExpression", { length: 64 }).default("0 * * * * *").notNull(),
    isEnabled: int("isEnabled").default(0).notNull(),
    lastRunAt: timestamp("lastRunAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [
    uniqueIndex("scheduler_settings_owner_unique").on(table.ownerId),
    index("scheduler_settings_task_uid_idx").on(table.scheduleCronTaskUid),
  ]
);

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type Campaign = typeof campaigns.$inferSelect;
export type Variant = typeof variants.$inferSelect;
export type ScheduleSlot = typeof scheduleSlots.$inferSelect;
export type PublishAttempt = typeof publishAttempts.$inferSelect;
