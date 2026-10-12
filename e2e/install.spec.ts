import { expect, type Page, test } from "@playwright/test"

interface ManifestIcon {
  readonly src: string
  readonly purpose: string
}

const manifestHref = async (page: Page) => (await page.locator("link[rel=manifest]").getAttribute("href")) ?? ""

test("links a manifest that opens the app full screen at Today", async ({ page, request }) => {
  await page.goto("/")
  const manifest = await request.get(await manifestHref(page))
  expect(manifest.headers()["content-type"]).toContain("manifest+json")
  expect(await manifest.json()).toMatchObject({
    name: "Baby tracker",
    start_url: "/",
    scope: "/",
    display: "standalone",
  })
})

test("asks for the manifest with the parent's cookie, since Access guards it like every other path", async ({
  page,
}) => {
  await page.goto("/")
  await expect(page.locator("link[rel=manifest]")).toHaveAttribute("crossorigin", "use-credentials")
})

test("serves every icon the phone asks for as an image, not the app's fallback page", async ({ page, request }) => {
  await page.goto("/")
  const manifest = await request.get(await manifestHref(page))
  const icons: ReadonlyArray<ManifestIcon> = (await manifest.json()).icons
  expect(icons.map(({ purpose }) => purpose)).toEqual(expect.arrayContaining(["any", "maskable"]))
  const touchIcon = (await page.locator("link[rel=apple-touch-icon]").getAttribute("href")) ?? ""
  for (const src of [touchIcon, ...icons.map((icon) => icon.src)]) {
    expect((await request.get(src)).headers()["content-type"], src).toBe("image/png")
  }
})

test.describe("install guidance on an iPhone", () => {
  test.use({ storageState: { cookies: [], origins: [] } })

  const standalone = (page: Page, value: boolean | undefined) =>
    page.addInitScript((flag) => {
      Object.defineProperty(Navigator.prototype, "standalone", { configurable: true, get: () => flag })
    }, value)

  const installCard = (page: Page) => page.getByRole("region", { name: "Install Baby tracker" })

  test("in a browser tab, a card says how to install, and Not now hides it on this phone for good", async ({
    page,
  }) => {
    await standalone(page, false)
    await page.goto("/")
    await expect(installCard(page)).toContainText("then Add to Home Screen. No Share button? Tap More first.")
    const notNow = installCard(page).getByRole("button", { name: "Not now" })
    expect((await notNow.boundingBox())?.height).toBeGreaterThanOrEqual(44)
    await notNow.click()
    await expect(installCard(page)).toHaveCount(0)
    await page.reload()
    await expect(page.getByRole("heading", { name: "Today", level: 1 })).toBeVisible()
    await expect(installCard(page)).toHaveCount(0)
  })

  test("shows the card above every tab until Not now, wherever that's tapped", async ({ page }) => {
    await standalone(page, false)
    await page.goto("/settings")
    await installCard(page).getByRole("button", { name: "Not now" }).click()
    await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Today" }).click()
    await expect(page.getByRole("heading", { name: "Today", level: 1 })).toBeVisible()
    await expect(installCard(page)).toHaveCount(0)
  })

  test("the installed app never shows the card", async ({ page }) => {
    await standalone(page, true)
    await page.goto("/")
    await expect(page.getByRole("heading", { name: "Today", level: 1 })).toBeVisible()
    await expect(installCard(page)).toHaveCount(0)
  })

  test("a browser without the iPhone's standalone flag shows no card, as on desktop or Android", async ({ page }) => {
    await standalone(page, undefined)
    await page.goto("/")
    await expect(page.getByRole("heading", { name: "Today", level: 1 })).toBeVisible()
    await expect(installCard(page)).toHaveCount(0)
  })

  test("Not now still hides the card for this visit when the browser blocks storage", async ({ page }) => {
    const errors: string[] = []
    page.on("pageerror", (error) => errors.push(error.message))
    await standalone(page, false)
    await page.addInitScript(
      'Object.defineProperty(window, "localStorage", { get: () => { throw new DOMException("The operation is insecure.", "SecurityError") } })',
    )
    await page.goto("/")
    await installCard(page).getByRole("button", { name: "Not now" }).click()
    await expect(installCard(page)).toHaveCount(0)
    expect(errors).toEqual([])
  })
})
