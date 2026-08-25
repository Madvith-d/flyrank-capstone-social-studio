export type SchedulerState = {
  id: number | null;
  ownerId: number;
  cronExpression: string;
  scheduleCronTaskUid: string | null;
  isEnabled: number;
  lastRunAt: Date | null;
  createdAt: Date | null;
  updatedAt: Date | null;
};

type SchedulerRecord = Omit<SchedulerState, "id"> & { id: number };

export function resolveSchedulerState(
  ownerId: number,
  record: SchedulerRecord | undefined
): SchedulerState {
  if (record) return record;
  return {
    id: null,
    ownerId,
    cronExpression: "0 * * * * *",
    scheduleCronTaskUid: null,
    isEnabled: 0,
    lastRunAt: null,
    createdAt: null,
    updatedAt: null,
  };
}
