import type { Page } from "@playwright/test"
import { NOW } from "./played-household.ts"
import { expect, test } from "./test.ts"

declare global {
  var sharedFiles: File[] | undefined
  var shareAttempts: number | undefined
}

interface Shared {
  readonly files?: ReadonlyArray<File>
}

const sharesFiles = (page: Page, refusals: ReadonlyArray<string> = []) =>
  page.addInitScript((names) => {
    const shared: File[] = []
    const pending = [...names]
    globalThis.sharedFiles = shared
    globalThis.shareAttempts = 0
    Object.defineProperty(Navigator.prototype, "canShare", { configurable: true, value: () => true })
    Object.defineProperty(Navigator.prototype, "share", {
      configurable: true,
      value: async ({ files = [] }: Shared) => {
        globalThis.shareAttempts = (globalThis.shareAttempts ?? 0) + 1
        const refusal = pending.shift()
        if (refusal !== undefined) throw new DOMException("The share sheet refused", refusal)
        shared.push(...files)
      },
    })
  }, refusals)

const sharesNothing = (page: Page) =>
  page.addInitScript(() => {
    Reflect.deleteProperty(Navigator.prototype, "canShare")
    Reflect.deleteProperty(Navigator.prototype, "share")
  })

const shared = (page: Page) =>
  page.evaluate(async () =>
    Promise.all(
      (globalThis.sharedFiles ?? []).map(async (file) => ({
        name: file.name,
        type: file.type,
        start: [...new Uint8Array(await file.arrayBuffer()).slice(0, 3)],
        text: await file.text(),
      })),
    ),
  )

const openSettings = async (page: Page) => {
  await page.clock.setFixedTime(NOW)
  await page.goto("/settings")
  await page.getByRole("heading", { name: "Export" }).waitFor()
}

const exportSection = (page: Page) => page.locator("section", { has: page.getByRole("heading", { name: "Export" }) })

test("shares the CSV through the share sheet, named for the household's date, with a byte-order mark", async ({
  page,
}) => {
  await sharesFiles(page)
  await openSettings(page)
  await exportSection(page).getByRole("button", { name: "Share CSV" }).click()
  await expect.poll(async () => (await shared(page)).length).toBe(1)
  const [file] = await shared(page)
  expect(file?.name).toBe("baby-tracker-2026-10-09.csv")
  expect(file?.type).toBe("text/csv")
  expect(file?.start).toEqual([0xef, 0xbb, 0xbf])
  expect(file?.text.startsWith("Kind,Start,End,Left (min),Right (min),")).toBe(true)
  await expect(exportSection(page).getByRole("alert")).toHaveCount(0)
})

test("shares the JSON backup, with every table the household keeps", async ({ page }) => {
  await sharesFiles(page)
  await openSettings(page)
  await exportSection(page).getByRole("button", { name: "Share JSON" }).click()
  await expect.poll(async () => (await shared(page)).length).toBe(1)
  const [file] = await shared(page)
  expect(file?.name).toBe("baby-tracker-2026-10-09.json")
  expect(file?.type).toBe("application/json")
  const backup = JSON.parse(file?.text ?? "{}")
  expect(backup.format).toBe("baby-tracker-export")
  expect(Object.keys(backup.tables)).toEqual(expect.arrayContaining(["household", "caregivers", "feeds", "diapers"]))
})

test("asks for a second tap when the phone says the share came too long after the first", async ({ page }) => {
  await sharesFiles(page, ["NotAllowedError"])
  await openSettings(page)
  await exportSection(page).getByRole("button", { name: "Share CSV" }).click()
  await expect(exportSection(page).getByText("The CSV is ready.")).toBeVisible()
  await exportSection(page).getByRole("button", { name: "Share it" }).click()
  await expect.poll(async () => (await shared(page)).map(({ name }) => name)).toEqual(["baby-tracker-2026-10-09.csv"])
  await expect(exportSection(page).getByText("is ready.")).toBeHidden()
})

test("says nothing when the parent closes the share sheet", async ({ page }) => {
  await sharesFiles(page, ["AbortError"])
  await openSettings(page)
  const shareCsv = exportSection(page).getByRole("button", { name: "Share CSV" })
  await shareCsv.click()
  await expect.poll(() => page.evaluate(() => globalThis.shareAttempts)).toBe(1)
  await expect(shareCsv).toBeEnabled()
  await expect(exportSection(page).getByRole("alert")).toHaveCount(0)
  await expect(exportSection(page).getByText("is ready.")).toHaveCount(0)
})

test("downloads the file where the browser can't share files", async ({ page }) => {
  await sharesNothing(page)
  await openSettings(page)
  const downloaded = page.waitForEvent("download")
  await exportSection(page).getByRole("button", { name: "Download CSV" }).click()
  expect((await downloaded).suggestedFilename()).toBe("baby-tracker-2026-10-09.csv")
})

test("waits for a connection, and says why", async ({ page, context }) => {
  await sharesFiles(page)
  await openSettings(page)
  await context.setOffline(true)
  const shareCsv = exportSection(page).getByRole("button", { name: "Share CSV" })
  await expect(shareCsv).toBeDisabled()
  await expect(shareCsv).toHaveAccessibleDescription("Exports need a connection.")
  await context.setOffline(false)
  await expect(shareCsv).toBeEnabled()
})

test("says why an export couldn't be made, and lets the parent try again", async ({ page }) => {
  await sharesFiles(page)
  await page.route("**/api/export.csv", (route) => route.fulfill({ status: 503, json: { _tag: "ServiceUnavailable" } }))
  await openSettings(page)
  await exportSection(page).getByRole("button", { name: "Share CSV" }).click()
  await expect(exportSection(page).getByRole("alert")).toHaveText("The export couldn't be made. Try again.")
  await page.unroute("**/api/export.csv")
  await exportSection(page).getByRole("button", { name: "Share CSV" }).click()
  await expect.poll(async () => (await shared(page)).length).toBe(1)
  await expect(exportSection(page).getByRole("alert")).toHaveCount(0)
})
