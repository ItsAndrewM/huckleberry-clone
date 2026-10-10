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
