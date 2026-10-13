import { type Deleted, RECENTLY_DELETED_DAYS } from "@bt/contracts"
import type { Instant } from "@bt/domain"
import { deletedDiapersSince } from "./diapers.ts"
import { deletedFeedsSince } from "./feeds/reads.ts"
import { deletedMeasurementsSince } from "./growth.ts"
import { deletedSleepsSince } from "./sleeps/reads.ts"

const DAY_MS = 24 * 60 * 60 * 1000

export const deletedOf = (sql: SqlStorage, now: Instant): Deleted => {
  const since = now - RECENTLY_DELETED_DAYS * DAY_MS
  return {
    feeds: deletedFeedsSince(sql, since),
    diapers: deletedDiapersSince(sql, since),
    sleeps: deletedSleepsSince(sql, since),
    measurements: deletedMeasurementsSince(sql, since),
  }
}
