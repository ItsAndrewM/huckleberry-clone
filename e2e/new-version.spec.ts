import { type BrowserContext, expect, type Page, test, type WebSocketRoute } from "@playwright/test"
import { quickAction } from "./played-household.ts"

test.use({ serviceWorkers: "allow" })

const NEXT_BUILD_COOKIE = "bt-preview-next-build"
const NEWER = "A newer version is saved. It opens when you next come back to the app."
const SAVED = "Saved for this version."
const SAVING_TAKES_MS = 15_000

const openWithSavedCopy = async (page: Page) => {
  await page.goto("/")
  await expect(page.getByText("Robin")).toBeVisible()
  await expect.poll(() => page.evaluate<boolean>("navigator.serviceWorker.controller !== null")).toBe(true)
}

const buildOf = (page: Page) =>
  page.evaluate<string | null>(`document.querySelector('meta[name="bt-build"]')?.getAttribute("content") ?? null`)

const deploy = (context: BrowserContext, baseURL: string | undefined) =>
  context.addCookies([{ name: NEXT_BUILD_COOKIE, value: "1", url: baseURL ?? "" }])

const leaveAndComeBack = (page: Page) =>
  page.evaluate(`(() => {
    const show = (state) => {
      Object.defineProperty(document, "visibilityState", { value: state, configurable: true })
      document.dispatchEvent(new Event("visibilitychange", { bubbles: true }))
    }
    show("hidden")
    show("visible")
  })()`)

const afterItLooksAtItsCopy = (page: Page) => page.evaluate("caches.keys().then(() => undefined)")

const markThisPage = (page: Page) => page.evaluate("window.btSamePage = true")
const isSamePage = (page: Page) => page.evaluate<boolean>("window.btSamePage === true")

const tab = (page: Page, name: string) =>
  page.getByRole("navigation", { name: "Main" }).getByRole("link", { name }).click()

test("saves a new version when a deploy drops the household's connection, and opens it when the app comes back", async ({
  page,
  context,
  baseURL,
}) => {
  const sockets: Array<WebSocketRoute> = []
  await page.routeWebSocket(/\/api\/ws$/u, (socket) => {
    socket.connectToServer()
    sockets.push(socket)
  })
  await openWithSavedCopy(page)
  const build = await buildOf(page)
  await deploy(context, baseURL)
  await Promise.all(sockets.map((socket) => socket.close({ code: 1012, reason: "Deployed" })))
  await tab(page, "Settings")
  await expect(page.getByText(NEWER)).toBeVisible({ timeout: SAVING_TAKES_MS })
  await markThisPage(page)
  const reloaded = page.waitForEvent("load")
  await leaveAndComeBack(page)
  await reloaded
  await expect(page.getByText(SAVED)).toBeVisible()
  expect(await isSamePage(page)).toBe(false)
  expect(await buildOf(page)).toBe(`${build}-next`)
})

test("checks for a new version when the app comes back, and Open it now opens it at once", async ({
  page,
  context,
  baseURL,
}) => {
  await openWithSavedCopy(page)
  const build = await buildOf(page)
  await tab(page, "Settings")
  await expect(page.getByText(SAVED)).toBeVisible()
  await deploy(context, baseURL)
  await leaveAndComeBack(page)
  await expect(page.getByText(NEWER)).toBeVisible({ timeout: SAVING_TAKES_MS })
  const reloaded = page.waitForEvent("load")
  await page.getByRole("button", { name: "Open it now" }).click()
  await reloaded
  await expect(page.getByText(SAVED)).toBeVisible()
  expect(await buildOf(page)).toBe(`${build}-next`)
})

test("keeps Today and logging when the app comes back offline, and opens the new version on the next return online", async ({
  page,
  context,
  baseURL,
}) => {
  let offline = false
  await page.routeWebSocket(/\/api\/ws$/u, (socket) => {
    if (offline) socket.close({ code: 1011, reason: "offline" })
    else socket.connectToServer()
  })
  await openWithSavedCopy(page)
  const build = await buildOf(page)
  await deploy(context, baseURL)
  await tab(page, "Settings")
  await leaveAndComeBack(page)
  await expect(page.getByText(NEWER)).toBeVisible({ timeout: SAVING_TAKES_MS })
  await tab(page, "Today")
  await expect(page.getByText("Totals")).toBeVisible()
  offline = true
  await context.setOffline(true)
  await markThisPage(page)
  await leaveAndComeBack(page)
  await afterItLooksAtItsCopy(page)
  await expect(page.getByText("Totals")).toBeVisible()
  await expect(quickAction(page, "Diaper")).toBeEnabled()
  expect(await isSamePage(page)).toBe(true)
  offline = false
  await context.setOffline(false)
  const reloaded = page.waitForEvent("load")
  await leaveAndComeBack(page)
  await reloaded
  expect(await isSamePage(page)).toBe(false)
  expect(await buildOf(page)).toBe(`${build}-next`)
})

test("keeps an open sheet when the app comes back, and opens the new version on the next return once it's closed", async ({
  page,
  context,
  baseURL,
}) => {
  await openWithSavedCopy(page)
  const build = await buildOf(page)
  await deploy(context, baseURL)
  await tab(page, "Settings")
  await leaveAndComeBack(page)
  await expect(page.getByText(NEWER)).toBeVisible({ timeout: SAVING_TAKES_MS })
  await tab(page, "Today")
  const sheet = page.getByRole("dialog", { name: "Diaper" })
  await quickAction(page, "Diaper").click()
  await expect(sheet).toBeVisible()
  await markThisPage(page)
  await leaveAndComeBack(page)
  await afterItLooksAtItsCopy(page)
  await expect(sheet).toBeVisible()
  await page.keyboard.press("Escape")
  await expect(sheet).toBeHidden()
  expect(await isSamePage(page)).toBe(true)
  const reloaded = page.waitForEvent("load")
  await leaveAndComeBack(page)
  await reloaded
  expect(await isSamePage(page)).toBe(false)
  expect(await buildOf(page)).toBe(`${build}-next`)
})

test("keeps a Settings change that isn't saved when the app comes back, even once its field has lost focus", async ({
  page,
  context,
  baseURL,
}) => {
  await openWithSavedCopy(page)
  await deploy(context, baseURL)
  await tab(page, "Settings")
  await leaveAndComeBack(page)
  await expect(page.getByText(NEWER)).toBeVisible({ timeout: SAVING_TAKES_MS })
  const name = page.getByRole("textbox", { name: "Name" })
  await name.fill("Robin Jay")
  await name.blur()
  await markThisPage(page)
  await leaveAndComeBack(page)
  await afterItLooksAtItsCopy(page)
  await expect(name).toHaveValue("Robin Jay")
  expect(await isSamePage(page)).toBe(true)
})

test("waits to offer Open it now until the phone is back online", async ({ page, context, baseURL }) => {
  let offline = false
  await page.routeWebSocket(/\/api\/ws$/u, (socket) => {
    if (offline) socket.close({ code: 1011, reason: "offline" })
    else socket.connectToServer()
  })
  await openWithSavedCopy(page)
  await deploy(context, baseURL)
  await tab(page, "Settings")
  await leaveAndComeBack(page)
  await expect(page.getByText(NEWER)).toBeVisible({ timeout: SAVING_TAKES_MS })
  const openNow = page.getByRole("button", { name: "Open it now" })
  offline = true
  await context.setOffline(true)
  await expect(page.getByText("Opening it now needs a connection.")).toBeVisible()
  await expect(openNow).toBeDisabled()
  offline = false
  await context.setOffline(false)
  await expect(openNow).toBeEnabled()
})
