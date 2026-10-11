import { expect, type Page, test, type WebSocketRoute } from "@playwright/test"

interface Units {
  readonly volume: string
  readonly weight: string
  readonly length: string
}

interface Household {
  readonly name: string
  readonly timeZone: string
  readonly units: Units
  readonly version: number
  readonly updatedBy: string | null
  readonly updatedAt: number
}

interface Child {
  readonly name: string
  readonly birthDate: string
  readonly sex: string
  readonly gestationalAgeDays: number
  readonly version: number
  readonly updatedBy: string | null
  readonly updatedAt: number
}

interface HouseholdEdit {
  readonly version: number
  readonly timeZone: string
  readonly units: Units
}

interface ChildEdit {
  readonly version: number
  readonly name: string
  readonly birthDate: string
  readonly sex: string
  readonly gestationalAgeDays: number
}

interface Played {
  household: Household
  child: Child
  readonly sent: string[]
}

const CHANGED = [["me"], ["today"], ["last24h"]]

const householdOf = ({ name, timeZone, units, version, updatedBy, updatedAt }: Household): Household => ({
  name,
  timeZone,
  units,
  version,
  updatedBy,
  updatedAt,
})

const playHousehold = async (page: Page): Promise<Played> => {
  const me = await (await page.request.get("/api/me")).json()
  const played: Played = { household: householdOf(me.household), child: me.child, sent: [] }
  await page.route("**/api/me", (route) =>
    route.fulfill({
      json: { ...me, household: { ...played.household, caregivers: me.household.caregivers }, child: played.child },
    }),
  )
  await page.route("**/api/household", (route) => {
    const body = route.request().postData() ?? ""
    played.sent.push(body)
    const edit: HouseholdEdit = JSON.parse(body)
    played.household = { ...played.household, timeZone: edit.timeZone, units: edit.units, version: edit.version + 1 }
    return route.fulfill({ json: { household: played.household, changed: CHANGED } })
  })
  await page.route("**/api/child", (route) => {
    const body = route.request().postData() ?? ""
    played.sent.push(body)
    const { version, name, birthDate, sex, gestationalAgeDays }: ChildEdit = JSON.parse(body)
    played.child = { ...played.child, name, birthDate, sex, gestationalAgeDays, version: version + 1 }
    return route.fulfill({ json: { child: played.child, changed: CHANGED } })
  })
  return played
}

const sentBodies = (played: Played) => played.sent.map((body) => JSON.parse(body))

const playSocket = async (page: Page) => {
  const sockets: WebSocketRoute[] = []
  await page.routeWebSocket(/\/api\/ws$/, (socket) => {
    sockets.push(socket)
  })
  return async (change: Partial<Child>, played: Played) => {
    await expect.poll(() => sockets.length).toBeGreaterThan(0)
    played.child = { ...played.child, ...change, version: played.child.version + 1 }
    sockets.at(-1)?.send(JSON.stringify({ changed: [["me"]] }))
  }
}

test.describe("Settings, with the household's answers played by the test", () => {
  test("saves bottles in fl oz for both phones, keeping the zone and the other units", async ({ page }) => {
    const played = await playHousehold(page)
    const { timeZone, version } = played.household
    await page.goto("/settings")
    const bottles = page.getByRole("group", { name: "Bottles" })
    await bottles.getByRole("button", { name: "fl oz" }).click()
    await expect(bottles.getByRole("button", { name: "fl oz" })).toHaveAttribute("aria-pressed", "true")
    expect(sentBodies(played)).toEqual([
      { actionId: expect.any(String), version, timeZone, units: { ...played.household.units, volume: "fl_oz" } },
    ])
  })

  test("moves the household to another time zone", async ({ page }) => {
    const played = await playHousehold(page)
    await page.goto("/settings")
    await page.getByLabel("Time zone").selectOption("Europe/London")
    await expect(page.getByLabel("Time zone")).toHaveValue("Europe/London")
    expect(sentBodies(played)).toEqual([expect.objectContaining({ timeZone: "Europe/London" })])
  })

  test("puts a unit change on top of the other phone's newer settings instead of undoing them", async ({ page }) => {
    const played = await playHousehold(page)
    const theirs = { ...played.household, timeZone: "Europe/London", version: played.household.version + 1 }
    await page.route(
      "**/api/household",
      (route) => {
        played.sent.push(route.request().postData() ?? "")
        return route.fulfill({ status: 409, json: { _tag: "Conflict", code: "STALE_VERSION", current: theirs } })
      },
      { times: 1 },
    )
    await page.goto("/settings")
    await page.getByRole("group", { name: "Weight" }).getByRole("button", { name: "lb & oz" }).click()
    await expect(page.getByLabel("Time zone")).toHaveValue("Europe/London")
    expect(sentBodies(played)[1]).toEqual({
      actionId: expect.any(String),
      version: theirs.version,
      timeZone: "Europe/London",
      units: { ...theirs.units, weight: "lb_oz" },
    })
  })

  test("saves the child's name, says so, and waits for the next change", async ({ page }) => {
    const played = await playHousehold(page)
    const { birthDate, sex, gestationalAgeDays, version } = played.child
    await page.goto("/settings")
    await page.getByLabel("Name").fill("Robin Rae")
    await page.getByRole("button", { name: "Save" }).click()
    await expect(page.getByText("Saved")).toBeVisible()
    await expect(page.getByRole("button", { name: "Save" })).toBeDisabled()
    expect(sentBodies(played)).toEqual([
      { actionId: expect.any(String), version, name: "Robin Rae", birthDate, sex, gestationalAgeDays },
    ])
  })

  test("explains a birth date the household refused, keeping what the parent typed", async ({ page }) => {
    await playHousehold(page)
    await page.route("**/api/child", (route) =>
      route.fulfill({
        status: 400,
        json: { _tag: "InvalidInput", fieldErrors: [{ path: "birthDate", issue: "before_birth" }] },
      }),
    )
    await page.goto("/settings")
    await page.getByLabel("Birth date").fill("2026-09-04")
    await page.getByRole("button", { name: "Save" }).click()
    await expect(page.getByText("Some entries are from before this date. Move or delete them first.")).toBeVisible()
    await expect(page.getByLabel("Birth date")).toHaveValue("2026-09-04")
  })

  test("doesn't say Saved for an edit the other phone's save replaced", async ({ page }) => {
    const played = await playHousehold(page)
    const otherPhoneSaves = await playSocket(page)
    await page.goto("/settings")
    await page.getByLabel("Name").fill("Robin Rae")
    await page.getByRole("button", { name: "Save" }).click()
    await expect(page.getByText("Saved")).toBeVisible()
    await page.getByLabel("Name").fill("Robin Ray")
    await otherPhoneSaves({ name: "Robbie" }, played)
    await expect(page.getByLabel("Name")).toHaveValue("Robbie")
    await expect(page.getByText("Saved")).toBeHidden()
  })

  test("drops a refusal once the other phone's save has replaced what it was about", async ({ page }) => {
    const played = await playHousehold(page)
    const otherPhoneSaves = await playSocket(page)
    await page.route("**/api/child", (route) =>
      route.fulfill({
        status: 400,
        json: { _tag: "InvalidInput", fieldErrors: [{ path: "birthDate", issue: "before_birth" }] },
      }),
    )
    await page.goto("/settings")
    await page.getByLabel("Birth date").fill("2026-09-04")
    await page.getByRole("button", { name: "Save" }).click()
    const refusal = page.getByText("Some entries are from before this date. Move or delete them first.")
    await expect(refusal).toBeVisible()
    await otherPhoneSaves({ birthDate: "2026-08-30" }, played)
    await expect(page.getByLabel("Birth date")).toHaveValue("2026-08-30")
    await expect(refusal).toBeHidden()
  })
})

test("loads the household's settings on Try again after they couldn't be loaded", async ({ page }) => {
  let refusing = true
  await page.route("**/api/me", (route) => (refusing ? route.fulfill({ status: 404 }) : route.continue()))
  await page.goto("/settings")
  await expect(page.getByText("The household's settings couldn't be loaded.")).toBeVisible()
  await expect(page.getByRole("heading", { name: "Theme" })).toBeVisible()
  refusing = false
  await page.getByRole("button", { name: "Try again" }).click()
  await expect(page.getByText("Andrew (local)")).toBeVisible()
})

test("shows who is signed in", async ({ page }) => {
  await page.goto("/settings")
  await expect(page.getByText("Andrew (local)")).toBeVisible()
  await expect(page.getByText("andrew@example.test")).toBeVisible()
})
