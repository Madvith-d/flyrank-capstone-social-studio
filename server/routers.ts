import { COOKIE_NAME } from "@shared/const";
import { TRPCError } from "@trpc/server";
import { createHash } from "node:crypto";
import { parse as parseCookie } from "cookie";
import { z } from "zod";
import * as db from "./db";
import { getSessionCookieOptions } from "./_core/cookies";
import { createHeartbeatJob, updateHeartbeatJob } from "./_core/heartbeat";
import { systemRouter } from "./_core/systemRouter";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";
import { ConstraintViolation, assertVariantIsValid } from "./campaigns/constraints";
import { generateAllDeterministicVariants } from "./campaigns/generation";
import { resolveCanonicalSource } from "./campaigns/ingest";
import { runConfiguredDueSlotProcessor } from "./campaigns/runtime";
import { resolveSchedulerState } from "./campaigns/schedulerState";
import { assertVariantCanBeScheduled } from "./campaigns/workflow";

const campaignInput = z.object({
  name: z.string().trim().min(2).max(160),
  sourceKind: z.enum(["url", "markdown"]),
  sourceUrl: z.string().trim().url().optional(),
  canonicalContent: z.string().max(200_000).optional(),
});

function asClientError(error: unknown): never {
  if (error instanceof ConstraintViolation) {
    throw new TRPCError({ code: "BAD_REQUEST", message: error.message, cause: error.result });
  }
  throw error;
}

function stableIdempotencyKey(variantId: number, scheduledAt: Date) {
  return createHash("sha256")
    .update(`social-studio:${variantId}:${scheduledAt.toISOString()}`)
    .digest("hex");
}

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return {
        success: true,
      } as const;
    }),
  }),
  campaign: router({
    list: protectedProcedure.query(({ ctx }) => db.listCampaigns(ctx.user.id)),
    get: protectedProcedure.input(z.object({ campaignId: z.number().int().positive() })).query(async ({ ctx, input }) => {
      const campaign = await db.getCampaignById(ctx.user.id, input.campaignId);
      if (!campaign) throw new TRPCError({ code: "NOT_FOUND", message: "Campaign not found." });
      return campaign;
    }),
    create: protectedProcedure.input(campaignInput).mutation(async ({ ctx, input }) => {
      try {
        const source = await resolveCanonicalSource(input);
        return await db.createCampaign({ ownerId: ctx.user.id, name: input.name, ...source });
      } catch (error) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: error instanceof Error ? error.message : "Campaign source could not be ingested.",
        });
      }
    }),
    generateVariants: protectedProcedure
      .input(z.object({ campaignId: z.number().int().positive() }))
      .mutation(async ({ ctx, input }) => {
        const current = await db.getCampaignById(ctx.user.id, input.campaignId);
        if (!current) throw new TRPCError({ code: "NOT_FOUND", message: "Campaign not found." });
        try {
          const generated = generateAllDeterministicVariants({
            content: current.campaign.canonicalContent,
            sourceUrl: current.campaign.sourceUrl,
          });
          return await db.replaceGeneratedVariants(ctx.user.id, input.campaignId, generated);
        } catch (error) {
          asClientError(error);
        }
      }),
    editVariant: protectedProcedure
      .input(z.object({ variantId: z.number().int().positive(), content: z.string().trim().min(1).max(4096) }))
      .mutation(async ({ ctx, input }) => {
        const owned = await db.getVariantForOwner(ctx.user.id, input.variantId);
        if (!owned) throw new TRPCError({ code: "NOT_FOUND", message: "Variant not found." });
        if (owned.variant.status === "published") {
          throw new TRPCError({ code: "BAD_REQUEST", message: "A published variant cannot be edited." });
        }
        try {
          const validation = assertVariantIsValid(owned.variant.platform, input.content);
          return await db.updateVariant(ctx.user.id, input.variantId, { content: input.content, validation });
        } catch (error) {
          asClientError(error);
        }
      }),
    reviewVariant: protectedProcedure
      .input(z.object({ variantId: z.number().int().positive(), status: z.enum(["approved", "rejected"]) }))
      .mutation(async ({ ctx, input }) => {
        const owned = await db.getVariantForOwner(ctx.user.id, input.variantId);
        if (!owned) throw new TRPCError({ code: "NOT_FOUND", message: "Variant not found." });
        if (owned.variant.status === "published") {
          throw new TRPCError({ code: "BAD_REQUEST", message: "A published variant cannot be reviewed again." });
        }
        const updated = await db.reviewVariant(ctx.user.id, input.variantId, input.status);
        return updated?.variant;
      }),
    scheduleVariant: protectedProcedure
      .input(z.object({ variantId: z.number().int().positive(), scheduledAt: z.coerce.date() }))
      .mutation(async ({ ctx, input }) => {
        const owned = await db.getVariantForOwner(ctx.user.id, input.variantId);
        if (!owned) throw new TRPCError({ code: "NOT_FOUND", message: "Variant not found." });
        assertVariantCanBeScheduled(owned.variant.status);
        if (input.scheduledAt.getTime() <= Date.now()) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Scheduled time must be in the future." });
        }
        try {
          return await db.createScheduleSlot({
            variantId: input.variantId,
            scheduledAt: input.scheduledAt,
            idempotencyKey: stableIdempotencyKey(input.variantId, input.scheduledAt),
          });
        } catch {
          throw new TRPCError({ code: "CONFLICT", message: "This variant already has a slot at the requested time." });
        }
      }),
    runDueProcessor: protectedProcedure.mutation(async () => runConfiguredDueSlotProcessor()),
  }),
  scheduler: router({
    get: protectedProcedure.query(async ({ ctx }) =>
      resolveSchedulerState(ctx.user.id, await db.getSchedulerSetting(ctx.user.id))
    ),
    activate: protectedProcedure
      .input(z.object({ cronExpression: z.string().regex(/^\S+(\s+\S+){5}$/, "Use a six-field UTC cron expression.") }))
      .mutation(async ({ ctx, input }) => {
        if (process.env.NODE_ENV !== "production") {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: "Publish the site before activating automatic scheduling; recurring callbacks target the production URL.",
          });
        }
        const authorization = ctx.req.headers.authorization;
        const sessionToken =
          parseCookie(ctx.req.headers.cookie ?? "")[COOKIE_NAME] ??
          (typeof authorization === "string" && authorization.startsWith("Bearer ")
            ? authorization.slice(7)
            : "");
        const existing = await db.getSchedulerSetting(ctx.user.id);
        if (existing?.scheduleCronTaskUid) {
          await updateHeartbeatJob(existing.scheduleCronTaskUid, {
            cron: input.cronExpression,
            path: "/api/scheduled/due-slots",
            description: "Processes due Social Media Studio delivery slots.",
            enable: true,
          }, sessionToken);
          return db.saveSchedulerSetting({
            ownerId: ctx.user.id,
            cronExpression: input.cronExpression,
            scheduleCronTaskUid: existing.scheduleCronTaskUid,
            isEnabled: 1,
          });
        }
        const job = await createHeartbeatJob({
          name: `social-media-studio-due-slots-${ctx.user.id}`,
          cron: input.cronExpression,
          path: "/api/scheduled/due-slots",
          payload: {},
          description: "Processes due Social Media Studio delivery slots.",
        }, sessionToken);
        return db.saveSchedulerSetting({
          ownerId: ctx.user.id,
          cronExpression: input.cronExpression,
          scheduleCronTaskUid: job.taskUid,
          isEnabled: 1,
        });
      }),
  }),
});

export type AppRouter = typeof appRouter;
