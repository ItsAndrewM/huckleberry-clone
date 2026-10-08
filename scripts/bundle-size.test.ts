import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { builtWorkerConfig, exceedsBudget, parseUploadSize } from "./bundle-size.ts"

const SAMPLE = "Total Upload: 1127.45 KiB / gzip: 228.12 KiB\nNo bindings found.\n--dry-run: exiting now.\n"

describe("parseUploadSize", () => {
  it("reads raw and gzip KiB from wrangler's dry-run output", () => {
    expect(parseUploadSize(SAMPLE)).toEqual({ rawKiB: 1127.45, gzipKiB: 228.12 })
  })

  it("throws on output it cannot read, so a wrangler format change fails the gate", () => {
    expect(() => parseUploadSize("Total Upload: 1.10 MiB / gzip: 300.00 KiB")).toThrow(/Total Upload/)
    expect(() => parseUploadSize("")).toThrow(/Total Upload/)
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

  it("refuses to run before a build, so wrangler never auto-configures the Vite app", () => {
    const web = mkdtempSync(join(tmpdir(), "bt-web-"))
    expect(() => builtWorkerConfig(web)).toThrow(/pnpm build/)
  })
})
