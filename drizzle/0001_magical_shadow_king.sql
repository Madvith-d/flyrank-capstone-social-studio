CREATE TABLE `campaigns` (
	`id` int AUTO_INCREMENT NOT NULL,
	`ownerId` int NOT NULL,
	`name` varchar(160) NOT NULL,
	`sourceKind` enum('url','markdown') NOT NULL,
	`sourceUrl` varchar(2048),
	`canonicalContent` text NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `campaigns_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `mockDeliveries` (
	`id` int AUTO_INCREMENT NOT NULL,
	`adapter` enum('mock_x','mock_linkedin') NOT NULL,
	`platform` enum('x','linkedin','telegram') NOT NULL,
	`idempotencyKey` varchar(128) NOT NULL,
	`content` text NOT NULL,
	`preview` text NOT NULL,
	`deliveryReference` varchar(512) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `mockDeliveries_id` PRIMARY KEY(`id`),
	CONSTRAINT `mock_deliveries_idempotency_unique` UNIQUE(`idempotencyKey`)
);
--> statement-breakpoint
CREATE TABLE `publishAttempts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`slotId` int NOT NULL,
	`idempotencyKey` varchar(128) NOT NULL,
	`attemptNumber` int NOT NULL,
	`adapter` enum('telegram','mock_x','mock_linkedin') NOT NULL,
	`status` enum('started','succeeded','failed','duplicate') NOT NULL,
	`deliveryReference` varchar(512),
	`deliveryUrl` varchar(2048),
	`resultPayload` text,
	`errorMessage` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`completedAt` timestamp,
	CONSTRAINT `publishAttempts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `scheduleSlots` (
	`id` int AUTO_INCREMENT NOT NULL,
	`variantId` int NOT NULL,
	`scheduledAt` datetime NOT NULL,
	`status` enum('pending','processing','published','failed') NOT NULL DEFAULT 'pending',
	`idempotencyKey` varchar(128) NOT NULL,
	`claimedAt` timestamp,
	`publishedAt` timestamp,
	`attemptCount` int NOT NULL DEFAULT 0,
	`lastError` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `scheduleSlots_id` PRIMARY KEY(`id`),
	CONSTRAINT `schedule_slots_variant_time_unique` UNIQUE(`variantId`,`scheduledAt`),
	CONSTRAINT `schedule_slots_idempotency_unique` UNIQUE(`idempotencyKey`)
);
--> statement-breakpoint
CREATE TABLE `schedulerSettings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`ownerId` int NOT NULL,
	`scheduleCronTaskUid` varchar(65),
	`cronExpression` varchar(64) NOT NULL DEFAULT '0 * * * * *',
	`isEnabled` int NOT NULL DEFAULT 0,
	`lastRunAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `schedulerSettings_id` PRIMARY KEY(`id`),
	CONSTRAINT `scheduler_settings_owner_unique` UNIQUE(`ownerId`)
);
--> statement-breakpoint
CREATE TABLE `variants` (
	`id` int AUTO_INCREMENT NOT NULL,
	`campaignId` int NOT NULL,
	`platform` enum('x','linkedin','telegram') NOT NULL,
	`content` text NOT NULL,
	`status` enum('draft','approved','rejected','published') NOT NULL DEFAULT 'draft',
	`validationSnapshot` text NOT NULL,
	`revision` int NOT NULL DEFAULT 1,
	`reviewedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `variants_id` PRIMARY KEY(`id`),
	CONSTRAINT `variants_campaign_platform_unique` UNIQUE(`campaignId`,`platform`)
);
--> statement-breakpoint
ALTER TABLE `campaigns` ADD CONSTRAINT `campaigns_ownerId_users_id_fk` FOREIGN KEY (`ownerId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `publishAttempts` ADD CONSTRAINT `publishAttempts_slotId_scheduleSlots_id_fk` FOREIGN KEY (`slotId`) REFERENCES `scheduleSlots`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `scheduleSlots` ADD CONSTRAINT `scheduleSlots_variantId_variants_id_fk` FOREIGN KEY (`variantId`) REFERENCES `variants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `schedulerSettings` ADD CONSTRAINT `schedulerSettings_ownerId_users_id_fk` FOREIGN KEY (`ownerId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `variants` ADD CONSTRAINT `variants_campaignId_campaigns_id_fk` FOREIGN KEY (`campaignId`) REFERENCES `campaigns`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `campaigns_owner_idx` ON `campaigns` (`ownerId`);--> statement-breakpoint
CREATE INDEX `publish_attempts_slot_idx` ON `publishAttempts` (`slotId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `publish_attempts_idempotency_idx` ON `publishAttempts` (`idempotencyKey`);--> statement-breakpoint
CREATE INDEX `schedule_slots_due_idx` ON `scheduleSlots` (`status`,`scheduledAt`);--> statement-breakpoint
CREATE INDEX `scheduler_settings_task_uid_idx` ON `schedulerSettings` (`scheduleCronTaskUid`);--> statement-breakpoint
CREATE INDEX `variants_campaign_status_idx` ON `variants` (`campaignId`,`status`);