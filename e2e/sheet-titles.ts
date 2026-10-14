import type { Page } from "@playwright/test"

const SEEN = "data-sheet-titles-seen"

export const watchSheetTitles = (page: Page) =>
  page.locator("body").evaluate((body, attribute) => {
    const root = body.ownerDocument.documentElement
    const seen: string[] = []
    const note = () => {
      for (const title of body.querySelectorAll('[data-slot="drawer-title"]')) {
        const text = title.textContent ?? ""
        if (seen.at(-1) !== text) seen.push(text)
      }
      root.setAttribute(attribute, seen.join("\n"))
    }
    note()
    const view = body.ownerDocument.defaultView
    if (view === null) throw new Error("The page has no window to watch its sheets from")
    new view.MutationObserver(note).observe(body, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
    })
  }, SEEN)

export const sheetTitlesSeen = async (page: Page) => ((await page.locator("html").getAttribute(SEEN)) ?? "").split("\n")
