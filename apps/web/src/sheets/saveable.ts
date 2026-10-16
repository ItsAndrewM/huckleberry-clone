import { DiaperConflict, DoseConflict, FeedConflict, SleepConflict } from "@bt/contracts"
import { savesAsItIs } from "./held.ts"
import { redoOf } from "./recovery.ts"
import { editsARecord, type Failed } from "./sending.ts"

const staleButStillThere = (error: Error) =>
  (error instanceof DiaperConflict ||
    error instanceof FeedConflict ||
    error instanceof SleepConflict ||
    error instanceof DoseConflict) &&
  error.code === "STALE_VERSION" &&
  error.current.deletedAt === null

const offersAnyway = (failed: Failed) =>
  editsARecord(failed.sending.sheet) ? staleButStillThere(failed.error) : redoOf(failed) !== null

export const stillSaveable = (failed: Failed) => savesAsItIs(failed.error) || offersAnyway(failed)
