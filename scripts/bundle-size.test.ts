import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { builtWorkerConfig, entryAsset, exceedsBudget, gzipKB, parseUploadSize } from "./bundle-size.ts"

const SAMPLE = "Total Upload: 1127.45 KiB / gzip: 228.12 KiB\nNo bindings found.\n--dry-run: exiting now.\n"

describe("parseUploadSize", () => {
  it("reads raw and gzip KiB from wrangler's dry-run output", () => {
    expect(parseUploadSize(SAMPLE)).toEqual({ rawKiB: 1127.45, gzipKiB: 228.12 })
  })

  it("throws on output it cannot read, so a wrangler format change fails the gate", () => {
    expect(() => parseUploadSize("Total Upload: 1.10 MiB / gzip: 300.00 KiB")).toThrow(/Total Upload/)
    expect(() => parseUploadSize("")).toThrow(/Total Upload/)
  })

  it.each(["Total Upload: . KiB / gzip: . KiB", "Total Upload: 1.2.3 KiB / gzip: 1.2.3 KiB"])(
    "throws instead of returning NaN for %s",
    (output) => {
      expect(() => parseUploadSize(output)).toThrow(/Total Upload/)
    },
  )

  it("reads sizes that wrangler printed in colour (FORCE_COLOR)", () => {
    expect(parseUploadSize("Total Upload: \u001b[32m0.47 KiB / gzip: 0.31 KiB\u001b[39m\n")).toEqual({
      rawKiB: 0.47,
      gzipKiB: 0.31,
    })
  })

  it("puts the unreadable output in the error, so a failing gate shows what wrangler printed", () => {
    expect(() => parseUploadSize("✘ [ERROR] something unexpected")).toThrow(/something unexpected/)
  })
})

describe("exceedsBudget", () => {
  it("allows exactly the budget and fails above it", () => {
    expect(exceedsBudget({ rawKiB: 0, gzipKiB: 400 }, 400)).toBe(false)
    expect(exceedsBudget({ rawKiB: 0, gzipKiB: 400.01 }, 400)).toBe(true)
  })
})

describe("builtWorkerConfig", () => {
  it("resolves the Worker config that vite build wrote", () => {
    const web = mkdtempSync(join(tmpdir(), "bt-web-"))
    mkdirSync(join(web, ".wrangler", "deploy"), { recursive: true })
    writeFileSync(
      join(web, ".wrangler", "deploy", "config.json"),
      JSON.stringify({ configPath: "../../dist/baby_tracker/wrangler.json" }),
    )
    expect(builtWorkerConfig(web)).toBe(join(web, "dist", "baby_tracker", "wrangler.json"))
  })

  it("refuses to run before a build, so wrangler never auto-configures the Vite app and rewrites vite.config.ts", () => {
    const web = mkdtempSync(join(tmpdir(), "bt-web-"))
    expect(() => builtWorkerConfig(web)).toThrow(/pnpm build/)
  })
})

const assetsHolding = (...names: string[]) => {
  const dir = mkdtempSync(join(tmpdir(), "bt-assets-"))
  for (const name of names) writeFileSync(join(dir, name), "x")
  return dir
}

describe("entryAsset", () => {
  it("finds the one entry script and stylesheet among the build's assets", () => {
    const dir = assetsHolding("index-CS8sVgvj.js", "index-D355Hg89.css", "chunk-1a2b.js", "moon-3c4d.png")
    expect(entryAsset(dir, "js")).toBe(join(dir, "index-CS8sVgvj.js"))
    expect(entryAsset(dir, "css")).toBe(join(dir, "index-D355Hg89.css"))
  })

  it("refuses a build that isn't there, so the limit never passes on nothing", () => {
    expect(() => entryAsset(join(tmpdir(), "bt-no-such-build"), "js")).toThrow(/pnpm build/)
    expect(() => entryAsset(assetsHolding("index-D355Hg89.css"), "js")).toThrow(/pnpm build/)
  })

  it("refuses two entry scripts rather than measuring one of them", () => {
    expect(() => entryAsset(assetsHolding("index-b.js", "index-a.js"), "js")).toThrow(/index-a\.js, index-b\.js/)
  })
})

describe("gzipKB", () => {
  it("measures the file gzipped, in kB of 1,000 bytes", () => {
    const file = join(assetsHolding(), "index-a.js")
    writeFileSync(file, "a".repeat(100_000))
    expect(gzipKB(file)).toBeGreaterThan(0.05)
    expect(gzipKB(file)).toBeLessThan(1)
  })
})
