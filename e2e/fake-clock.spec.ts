import { expect, test } from "./test.ts"

const NOW_INSIDE_A_FRACTIONAL_TIMER = "new Promise((resolve) => setTimeout(() => resolve(Date.now()), 736.8))"

test("keeps Date.now() a whole millisecond under the fake clock, as a phone's always is, inside a timer set with a fractional delay", async ({
  page,
}) => {
  await page.clock.install()
  await page.goto("/")
  const seen = page.evaluate<number>(NOW_INSIDE_A_FRACTIONAL_TIMER)
  await page.clock.runFor(1000)
  expect(Number.isInteger(await seen)).toBe(true)
})

test("keeps Date.now() a whole millisecond when the fake clock is installed after the page has loaded", async ({
  page,
}) => {
  await page.goto("/")
  await page.clock.install()
  const seen = page.evaluate<number>(NOW_INSIDE_A_FRACTIONAL_TIMER)
  await page.clock.runFor(1000)
  expect(Number.isInteger(await seen)).toBe(true)
})
