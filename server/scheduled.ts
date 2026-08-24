import type { Request, Response } from "express";
import * as db from "./db";
import { runConfiguredDueSlotProcessor } from "./campaigns/runtime";
import { sdk } from "./_core/sdk";

export async function processDueSlotsFromSchedule(req: Request, res: Response) {
  try {
    const user = await sdk.authenticateRequest(req);
    if (!user.isCron || !user.taskUid) {
      return res.status(403).json({ error: "cron-only" });
    }
    const settings = await db.getSchedulerSettingByTaskUid(user.taskUid);
    if (!settings || !settings.isEnabled) {
      return res.json({ ok: true, skipped: "orphan-or-disabled" });
    }
    const summary = await runConfiguredDueSlotProcessor();
    await db.markSchedulerRun(user.taskUid, new Date());
    return res.json({ ok: true, summary });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown schedule processing error";
    return res.status(500).json({
      error: message,
      context: { route: "/api/scheduled/due-slots" },
      timestamp: new Date().toISOString(),
    });
  }
}
