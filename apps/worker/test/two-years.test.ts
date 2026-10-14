import { localDateOf } from "@bt/domain"
import { runInDurableObject } from "cloudflare:test"
import { expect, it } from "vitest"
import { calendarOf } from "../src/core/calendar.ts"
import { seededHousehold } from "./fixtures.ts"
import { seedTwoYears } from "./two-years.ts"

it("files each dose the bench seeds under the household's date, though the bench runs at 10 AM in Vancouver and each dose falls on the next UTC date", async () => {
  const household = await seededHousehold()
  const tenInTheMorning = Date.UTC(2026, 9, 8, 17, 0)
  const misfiled = await runInDurableObject(household, (_instance, state) => {
    const { sql } = state.storage
    state.storage.transactionSync(() => seedTwoYears(sql, tenInTheMorning))
    const { zone } = calendarOf(sql)
    const doses = sql.exec<{ occurred_at: number; local_date: string }>(
      "SELECT occurred_at, local_date FROM supplement_logs",
    )
    return doses.toArray().filter(({ occurred_at, local_date }) => local_date !== localDateOf(occurred_at, zone))
  })
  expect(misfiled).toEqual([])
})
