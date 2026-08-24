import { TRPCError } from "@trpc/server";
import type { VariantStatus } from "./types";

export function assertVariantCanBeScheduled(status: VariantStatus) {
  if (status !== "approved") {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Only an approved variant can be scheduled. Review and approve this variant first.",
    });
  }
}
