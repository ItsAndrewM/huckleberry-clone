import { expect, type Page, test } from "@playwright/test"

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

interface HouseholdEdit {
  readonly version: number
  readonly timeZone: string
  readonly units: Units
}

interface Played {
  household: Household
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
  const played: Played = { household: householdOf(me.household), sent: [] }
  await page.route("**/api/me", (route) =>
    route.fulfill({ json: { ...me, household: { ...played.household, caregivers: me.household.caregivers } } }),
  )
  await page.route("**/api/household", (route) => {
    const body = route.request().postData() ?? ""
    played.sent.push(body)
    const edit: HouseholdEdit = JSON.parse(body)
    played.household = { ...played.household, timeZone: edit.timeZone, units: edit.units, version: edit.version + 1 }
    return route.fulfill({ json: { household: played.household, changed: CHANGED } })
  })
  return played
}

const sentBodies = (played: Played) => played.sent.map((body) => JSON.parse(body))

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
})
