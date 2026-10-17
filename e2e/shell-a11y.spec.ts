import type { BrowserContext, Locator, Page } from "@playwright/test"
import { emptyDay, openHistory, playHistory } from "./played-day.ts"
import {
  caregiversOf,
  MINUTE,
  NOW,
  openToday,
  playHousehold,
  quickAction,
  savedBy,
  todayWith,
} from "./played-household.ts"
import { expect, test } from "./test.ts"

test.use({ timezoneId: "America/Vancouver" })

const TWO_FRAMES = "new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)))"

const WATCH_CLOSING = `(() => {
  const popup = document.querySelector('[data-slot="drawer-popup"]')
  const ended = []
  const tops = []
  let closing = 0
  popup.addEventListener("transitionend", (event) => {
    if (event.target === popup) ended.push(event.propertyName)
  })
  window.sheetClosing = new Promise((done) => {
    const sample = () => {
      if (!popup.isConnected) return done({ ended, tops, closing })
      tops.push(popup.getBoundingClientRect().top)
      if (popup.hasAttribute("data-ending-style")) closing += 1
      requestAnimationFrame(sample)
    }
    sample()
  })
})()`

interface Closing {
  readonly ended: ReadonlyArray<string>
  readonly tops: ReadonlyArray<number>
  readonly closing: number
}

const rectOf = (target: Locator) =>
  target.evaluate((element) => {
    const { top, bottom } = element.getBoundingClientRect()
    return { top, bottom }
  })

const computedOf = (target: Locator, property: string) =>
  target.evaluate(
    (element, name) => element.ownerDocument.defaultView?.getComputedStyle(element).getPropertyValue(name).trim() ?? "",
    property,
  )

const firstReaching = async (rows: Locator, coverTop: number) => {
  for (const row of await rows.all()) {
    if ((await rectOf(row)).bottom > coverTop) return row
  }
  throw new Error("No row reaches the bar")
}

const focusUnder = async (page: Page, rows: Locator, bar: Locator) => {
  await expect(rows.first()).toBeVisible()
  await page.evaluate("window.scrollTo(0, 0)")
  const coverTop = (await rectOf(bar)).top
  const row = await firstReaching(rows, coverTop)
  const { top } = await rectOf(row)
  await page.evaluate(`window.scrollBy(0, ${top - (coverTop - 10)})`)
  await page.evaluate(TWO_FRAMES)
  await row.focus()
  return { row, barTop: (await rectOf(bar)).top }
}

const dayGrid = async (page: Page, search = "?date=2026-10-08") => {
  await playHistory(page, [emptyDay("2026-10-09"), emptyDay("2026-10-08")])
  await openHistory(page, search)
  return page.getByRole("region", { name: "The day by hour" }).getByRole("button", { name: /^Log at / })
}

const focusUnderSwitcher = async (page: Page, rows: Locator) => {
  const switcher = page.locator("[data-sticky-switcher]")
  await expect(rows.first()).toBeVisible()
  await page.evaluate("window.scrollTo(0, 0)")
  const row = rows.nth(8)
  const { top } = await rectOf(row)
  const resting = await rectOf(switcher)
  await page.evaluate(`window.scrollBy(0, ${top - (resting.bottom - resting.top - 10)})`)
  await page.evaluate(TWO_FRAMES)
  const { bottom } = await rectOf(switcher)
  expect((await rectOf(row)).top).toBeLessThan(bottom)
  await row.focus()
  await expect.poll(async () => (await rectOf(row)).top).toBeGreaterThanOrEqual(bottom)
}

const noConnection = (page: Page) => page.getByRole("alert").filter({ hasText: "No connection" })

const dayGridWithoutConnection = async (page: Page, context: BrowserContext) => {
  const rows = await dayGrid(page)
  await expect(rows.first()).toBeEnabled()
  await context.setOffline(true)
  await expect(noConnection(page)).toBeVisible()
  return rows
}

const changeDayButton = (page: Page) =>
  page.getByRole("navigation", { name: "Days" }).getByRole("button", { name: "Change day", exact: true })

const reachedByATapAtItsCentre = (target: Locator) =>
  target.evaluate((element) => {
    const { left, top, width, height } = element.getBoundingClientRect()
    const hit = element.ownerDocument.elementFromPoint(left + width / 2, top + height / 2)
    return hit !== null && element.contains(hit)
  })

const focusUnderBanner = async (page: Page, rows: Locator) => {
  const banner = noConnection(page)
  await expect(rows.first()).toBeVisible()
  await page.evaluate("window.scrollTo(0, 0)")
  const { bottom } = await rectOf(banner)
  const row = rows.nth(6)
  const { top } = await rectOf(row)
  await page.evaluate(`window.scrollBy(0, ${top - (bottom - 10)})`)
  await page.evaluate(TWO_FRAMES)
  expect((await rectOf(row)).top).toBeLessThan(bottom)
  await row.focus()
  await expect.poll(async () => (await rectOf(row)).top).toBeGreaterThanOrEqual(bottom)
}

const openDiaperSheet = async (page: Page) => {
  await playHousehold(page, todayWith())
  await openToday(page)
  await quickAction(page, "Diaper").click()
  const popup = page.locator('[data-slot="drawer-popup"]')
  await expect(popup).toBeVisible()
  return popup
}

const closeWatching = async (page: Page) => {
  await expect.poll(() => page.evaluate("document.getAnimations().length")).toBe(0)
  await page.evaluate(WATCH_CLOSING)
  await page.keyboard.press("Escape")
  return page.evaluate<Closing>("window.sheetClosing")
}

test("names each screen in its page title", async ({ page }) => {
  await playHousehold(page, todayWith())
  await openToday(page)
  await expect(page).toHaveTitle("Today · Baby tracker")
  for (const [tab, title] of [
    ["History", "History"],
    ["Trends", "Trends"],
    ["Growth", "Growth"],
    ["Settings", "Settings"],
  ] as const) {
    await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: tab }).click()
    await expect(page).toHaveTitle(`${title} · Baby tracker`)
  }
  await page.goto("/settings/deleted")
  await expect(page).toHaveTitle("Recently deleted · Baby tracker")
})

test("a focused hour row never sits under the tab bar", async ({ page }) => {
  const rows = await dayGrid(page)
  const { row, barTop } = await focusUnder(page, rows, page.getByRole("navigation", { name: "Main" }))
  await expect.poll(async () => (await rectOf(row)).bottom).toBeLessThanOrEqual(barTop)
})

test.describe("a focused hour row never sits under History's switcher", () => {
  test("at its usual height", async ({ page }) => {
    await focusUnderSwitcher(page, await dayGrid(page))
  })

  test("with a hidden kind's notice under it", async ({ page }) => {
    const rows = await dayGrid(page, "?date=2026-10-08&hide=diapers")
    await expect(page.getByText("Diapers hidden")).toBeVisible()
    await focusUnderSwitcher(page, rows)
  })

  test("with Go to open under it", async ({ page }) => {
    const rows = await dayGrid(page)
    await page
      .getByRole("navigation", { name: "Days" })
      .getByRole("button", { name: "Change day", exact: true })
      .click()
    await expect(page.getByLabel("Go to")).toBeVisible()
    await focusUnderSwitcher(page, rows)
  })
})

const openTodayWithManyDiapers = async (page: Page) => {
  const { andrew } = await caregiversOf(page)
  const diapers = Array.from({ length: 14 }, (_, index) => ({
    kind: "diaper" as const,
    diaper: {
      id: `diaper-${index}`,
      occurredAt: NOW - (index + 1) * 20 * MINUTE,
      wet: true,
      dirty: false,
      ...savedBy(andrew.id),
    },
  }))
  await playHousehold(page, { ...todayWith(), recent: diapers })
  await openToday(page)
  return page.getByRole("list", { name: "Last 24 hours" }).getByRole("button")
}

test("a focused row on Today never sits under the quick actions", async ({ page }) => {
  const rows = await openTodayWithManyDiapers(page)
  const bar = page.getByRole("region", { name: "Log", exact: true })
  const { row, barTop } = await focusUnder(page, rows, bar)
  await expect.poll(async () => (await rectOf(row)).bottom).toBeLessThanOrEqual(barTop)
})

test.describe("with no connection, the banner stays above History's switcher and the rows under it", () => {
  const scrolled = async (page: Page, context: BrowserContext) => {
    await dayGridWithoutConnection(page, context)
    await page.evaluate("window.scrollTo(0, 600)")
    await page.evaluate(TWO_FRAMES)
  }

  test("the switcher sits flush under the banner's bottom once the page is scrolled", async ({ page, context }) => {
    await scrolled(page, context)
    const { bottom } = await rectOf(noConnection(page))
    const { top } = await rectOf(page.locator("[data-sticky-switcher]"))
    expect(top).toBeGreaterThanOrEqual(bottom)
    expect(top).toBeLessThanOrEqual(bottom + 1)
  })

  test("the switcher goes back to the top of the page once the connection is back", async ({ page, context }) => {
    await scrolled(page, context)
    await context.setOffline(false)
    await expect(noConnection(page)).toBeHidden()
    await expect.poll(async () => (await rectOf(page.locator("[data-sticky-switcher]"))).top).toBe(0)
  })

  test("a tap at the centre of Change day reaches it", async ({ page, context }) => {
    await scrolled(page, context)
    expect(await reachedByATapAtItsCentre(changeDayButton(page))).toBe(true)
  })

  test("a focused hour row clears both", async ({ page, context }) => {
    const rows = await dayGridWithoutConnection(page, context)
    await focusUnderSwitcher(page, rows)
    const { top } = await rectOf(rows.nth(8))
    expect(top).toBeGreaterThanOrEqual((await rectOf(noConnection(page))).bottom)
    expect(top).toBeGreaterThanOrEqual((await rectOf(page.locator("[data-sticky-switcher]"))).bottom)
  })
})

test("with no connection, a focused row on Today never sits under the banner", async ({ page, context }) => {
  const rows = await openTodayWithManyDiapers(page)
  await expect(rows.first()).toBeEnabled()
  await context.setOffline(true)
  await expect(noConnection(page)).toBeVisible()
  await focusUnderBanner(page, rows)
})

test.describe("with Reduce Motion on", () => {
  test.use({ reducedMotion: "reduce" })

  test("buttons don't animate", async ({ page }) => {
    await playHousehold(page, todayWith())
    await openToday(page)
    expect(await computedOf(quickAction(page, "Bottle"), "transition-duration")).toBe("0s")
  })

  test("a sheet's closed transform is none, and it still closes", async ({ page }) => {
    const popup = await openDiaperSheet(page)
    expect(await computedOf(popup, "--closed-transform")).toBe("none")
    await page.keyboard.press("Escape")
    await expect(page.getByRole("dialog")).toHaveCount(0)
  })

  test("a sheet transitions only its opacity", async ({ page }) => {
    const popup = await openDiaperSheet(page)
    expect(await computedOf(popup, "transition-property")).toBe("opacity")
  })

  test("an opacity transition ends as a sheet closes", async ({ page }) => {
    await openDiaperSheet(page)
    const { ended } = await closeWatching(page)
    expect(ended).toContain("opacity")
  })

  test("a sheet stays where it is while it closes", async ({ page }) => {
    await openDiaperSheet(page)
    const { tops, closing } = await closeWatching(page)
    expect(closing).toBeGreaterThan(0)
    expect([...new Set(tops)]).toHaveLength(1)
  })
})
