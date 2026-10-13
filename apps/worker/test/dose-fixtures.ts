import { supplementsOf } from "../src/core/supplements/definitions.ts"
import { logDose } from "../src/core/supplements/dose-writes.ts"
import { ANDREW, NOW, saved, stampOf } from "./fixtures.ts"

export const vitaminDOf = (sql: SqlStorage) => {
  const [vitaminD] = supplementsOf(sql)
  if (vitaminD === undefined) throw new Error("expected the seeded Vitamin D")
  return vitaminD
}

export const dosedAt = (sql: SqlStorage, occurredAt: number, now = NOW) =>
  saved(
    logDose(stampOf(sql, ANDREW.email, now), {
      actionId: crypto.randomUUID(),
      supplementId: vitaminDOf(sql).id,
      occurredAt,
      confirmedDuplicate: true,
    })(sql),
  )
