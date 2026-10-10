import { expect, test } from "@playwright/test"

const TABS = ["History", "Trends", "Growth", "Settings", "Today"]

test("opens on Today with the child's name, read from /api/me", async ({ page }) => {
  await page.goto("/")
  await expect(page.getByRole("heading", { name: "Today", level: 1 })).toBeVisible()
  await expect(page.getByText("Robin")).toBeVisible()
})

test("serves the shell for a deep client route (SPA fallback, D1)", async ({ page }) => {
  await page.goto("/history")
  await expect(page.getByRole("heading", { name: "History", level: 1 })).toBeVisible()
})

test("moves between the tabs, marking the one that's open", async ({ page }) => {
  await page.goto("/")
  const tabs = page.getByRole("navigation", { name: "Main" })
  for (const tab of TABS) {
    await tabs.getByRole("link", { name: tab }).click()
    await expect(page.getByRole("heading", { name: tab, level: 1 })).toBeVisible()
    await expect(tabs.getByRole("link", { name: tab })).toHaveAttribute("aria-current", "page")
    await expect(tabs.locator("[aria-current=page]")).toHaveCount(1)
  }
})

test("marks the open tab even when the address carries a query", async ({ page }) => {
  await page.goto("/history?week=2026-W41")
  await expect(page.getByRole("heading", { name: "History", level: 1 })).toBeVisible()
  await expect(page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "History" })).toHaveAttribute(
    "aria-current",
    "page",
  )
})

test("answers a path no tab has with Page not found, and a way back to Today", async ({ page }) => {
  await page.goto("/no-such-page")
  await expect(page.getByRole("heading", { name: "Page not found", level: 1 })).toBeVisible()
  await page.getByRole("link", { name: "Go to Today" }).click()
  await expect(page.getByRole("heading", { name: "Today", level: 1 })).toBeVisible()
})

test("sends signed-in /api/* fetches through to the household, which knows the access.dev caregiver", async ({
  request,
}) => {
  const res = await request.get("/api/me")
  expect(res.status()).toBe(200)
  expect(await res.json()).toEqual({
    caregiver: { id: expect.any(String), email: "andrew@example.test", displayName: "Andrew (local)" },
    household: {
      name: "Local household",
      timeZone: "America/Vancouver",
      units: { volume: "ml", weight: "kg", length: "cm" },
      version: expect.any(Number),
      updatedBy: null,
      updatedAt: expect.any(Number),
      caregivers: [
        { id: expect.any(String), displayName: "Andrew (local)" },
        { id: expect.any(String), displayName: "Emily (local)" },
      ],
    },
    child: {
      name: "Robin",
      birthDate: "2026-09-01",
      sex: "female",
      gestationalAgeDays: 281,
      version: expect.any(Number),
      updatedBy: null,
      updatedAt: expect.any(Number),
    },
  })
})

test("routes /api/* navigations to the Worker, not the SPA shell (run_worker_first, D1)", async ({ page }) => {
  const res = await page.goto("/api/me")
  expect(res?.status()).toBe(200)
  expect(await res?.json()).toMatchObject({ caregiver: { email: "andrew@example.test" } })
})

test("refuses the access.dev caregiver on admin routes", async ({ request }) => {
  const res = await request.post("/api/admin/household", { data: {} })
  expect(res.status()).toBe(401)
  expect(await res.json()).toEqual({ _tag: "Unauthorized" })
})

test("signs in back to the page the parent was on", async ({ page }) => {
  await page.goto("/api/login?return=/history")
  await expect(page).toHaveURL("/history")
  await expect(page.getByRole("heading", { name: "History", level: 1 })).toBeVisible()
})

test("signs in to this site only, even with a tab hidden in the return path", async ({ page }) => {
  await page.goto(`/api/login?${new URLSearchParams({ return: "/\t/evil.test" })}`)
  await expect(page).toHaveURL("/")
})
