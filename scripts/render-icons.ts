import { readFile } from "node:fs/promises"
import { fileURLToPath } from "node:url"
import { chromium } from "@playwright/test"
import { ICON_FILES } from "./icons.ts"

const iconsDir = new URL("../apps/web/public/icons/", import.meta.url)
const svg = await readFile(new URL("icon.svg", iconsDir), "utf8")

const browser = await chromium.launch()
try {
  for (const { file, size } of ICON_FILES) {
    const page = await browser.newPage({ viewport: { width: size, height: size } })
    await page.setContent(`<style>body{margin:0}svg{display:block;width:100vw;height:100vh}</style>${svg}`)
    await page.screenshot({ path: fileURLToPath(new URL(file, iconsDir)) })
    await page.close()
  }
} finally {
  await browser.close()
}
