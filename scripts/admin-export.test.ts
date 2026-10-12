import { mkdtempSync, readFileSync, statSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it, vi } from "vitest"
import { exportFileFromArgs, exportFrom, exportSummary, releaseExportPath, saveExport } from "./admin-export.ts"
import { adminRequest } from "./admin-seed.ts"

const ENV = {
  BT_URL: "https://bt.example.test",
  CF_ACCESS_CLIENT_ID: "bt-admin.access",
  CF_ACCESS_CLIENT_SECRET: "not-a-real-secret",
}

const EXPORTED = {
  format: "baby-tracker-export",
  version: 1,
  exportedAt: Date.UTC(2026, 9, 12, 3, 14, 50),
  migrations: ["0001-household", "0003-diapers"],
  tables: {
    household: [{ id: 1, name: "Test household" }],
    diapers: [
      { id: "d1", wet: 1 },
      { id: "d2", wet: 0 },
    ],
  },
}

const BODY = JSON.stringify(EXPORTED)

const answering = (status: number, body: string) =>
  vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(body, { status }))

const scratchFile = (name: string) => join(mkdtempSync(join(tmpdir(), "bt-export-")), name)

afterEach(() => {
  vi.restoreAllMocks()
})

describe("pnpm admin export", () => {
  it("posts an empty body to the admin route with the service token", async () => {
    const request = adminRequest(ENV, "/api/admin/export")
    expect(request.method).toBe("POST")
    expect(request.url).toBe("https://bt.example.test/api/admin/export")
    expect(request.headers.get("cf-access-client-id")).toBe("bt-admin.access")
    expect(await request.json()).toEqual({})
  })

  it("takes the one file to save to", () => {
    expect(exportFileFromArgs(["~/baby-tracker.json"])).toBe("~/baby-tracker.json")
  })

  it.each([
    ["no file", []],
    ["two files", ["a.json", "b.json"]],
    ["a blank name", ["  "]],
  ])("refuses %s", (_label, args) => {
    expect(() => exportFileFromArgs(args)).toThrow("Give one file to save the export to")
  })

  it("refuses an option it doesn't know", () => {
    expect(() => exportFileFromArgs(["--force", "a.json"])).toThrow("Unknown option '--force'")
  })
})

describe("exportFrom", () => {
  it("reads a 200's body as the export", () => {
    expect(exportFrom(200, BODY)).toEqual(EXPORTED)
  })

  it("says what a refusal answered, which holds no household data", () => {
    expect(() => exportFrom(401, '{"_tag":"Unauthorized"}')).toThrow(
      'Couldn\'t export the household: 401 {"_tag":"Unauthorized"}',
    )
  })

  it("refuses a 200 that isn't an export, without repeating the body", () => {
    const body = JSON.stringify({ ...EXPORTED, format: "something else", secret: "Robin" })
    expect(() => exportFrom(200, body)).toThrow("Couldn't export the household: its answer wasn't an export")
    expect(() => exportFrom(200, body)).not.toThrow("Robin")
  })
})

describe("exportSummary", () => {
  it("counts the tables and rows, and says when the export was taken", () => {
    expect(exportSummary(exportFrom(200, BODY))).toBe("2 tables and 3 rows, as of 2026-10-12T03:14:50.000Z")
  })
})

describe("releaseExportPath", () => {
  it("names the file by the minute in UTC and the commit, under exports/", () => {
    expect(releaseExportPath(new Date(Date.UTC(2026, 9, 12, 3, 14, 50)), "20390a32dd62e7c7")).toBe(
      "exports/2026-10-12T0314Z-20390a3.json",
    )
  })
})

describe("saveExport", () => {
  it("writes the body exactly as it came, readable only by this Mac's user, and says only how much it holds", async () => {
    answering(200, BODY)
    const file = scratchFile("exports/today.json")
    const said = await saveExport(ENV, file)
    expect(readFileSync(file, "utf8")).toBe(BODY)
    expect(statSync(file).mode & 0o777).toBe(0o600)
    expect(said).toBe(`Saved the household's export to ${file}: 2 tables and 3 rows, as of 2026-10-12T03:14:50.000Z.`)
    expect(said).not.toContain("Test household")
  })

  it("never writes over a file that's already there", async () => {
    answering(200, BODY)
    const file = scratchFile("kept.json")
    writeFileSync(file, "an earlier export")
    await expect(saveExport(ENV, file)).rejects.toThrow("EEXIST")
    expect(readFileSync(file, "utf8")).toBe("an earlier export")
  })

  it("writes nothing when the household refuses", async () => {
    answering(503, '{"_tag":"ServiceUnavailable"}')
    const file = scratchFile("refused.json")
    await expect(saveExport(ENV, file)).rejects.toThrow("Couldn't export the household: 503")
    expect(() => statSync(file)).toThrow("ENOENT")
  })
})
