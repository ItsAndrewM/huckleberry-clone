import { ServiceUnavailable, Unauthorized } from "@bt/contracts"
import { describe, expect, it } from "vitest"
import { AuthRequired, Offline, Unexpected } from "../src/api/errors.ts"
import {
  afterRefusal,
  exportFailure,
  exportFileName,
  exportFileOf,
  ShareFailed,
  waitReason,
} from "../src/features/settings/export-file.ts"

const CSV = "Kind,Start\r\nDiaper,2026-10-12 03:42\r\n"

describe("exportFileOf", () => {
  it("names the file for the household's date and its kind", () => {
    expect(exportFileName("csv", "2026-10-12")).toBe("baby-tracker-2026-10-12.csv")
    expect(exportFileName("json", "2026-10-12")).toBe("baby-tracker-2026-10-12.json")
  })

  it("puts a byte-order mark before the CSV, so Excel reads its names as UTF-8", async () => {
    const file = exportFileOf("csv", CSV, "2026-10-12")
    expect(file.name).toBe("baby-tracker-2026-10-12.csv")
    expect(file.type).toBe("text/csv")
    expect([...new Uint8Array(await file.arrayBuffer()).slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf])
    expect(new TextDecoder().decode(await file.arrayBuffer())).toBe(CSV)
  })

  it("keeps the JSON exactly as it came", async () => {
    const json = JSON.stringify({ format: "baby-tracker-export" })
    const file = exportFileOf("json", json, "2026-10-12")
    expect(file.type).toBe("application/json")
    expect(await file.text()).toBe(json)
    expect(new Uint8Array(await file.arrayBuffer())[0]).toBe(0x7b)
  })
})

describe("afterRefusal", () => {
  it("lets a closed share sheet go quietly", () => {
    expect(afterRefusal("AbortError", "first")).toBe("cancelled")
    expect(afterRefusal("AbortError", "again")).toBe("cancelled")
  })

  it("asks for a fresh tap when the first share came too long after the tap that asked for it", () => {
    expect(afterRefusal("NotAllowedError", "first")).toBe("needs-a-tap")
  })

  it("downloads the file when sharing is refused even straight after a tap", () => {
    expect(afterRefusal("NotAllowedError", "again")).toBe("download")
  })

  it("leaves any other refusal to be reported", () => {
    expect(afterRefusal("DataError", "first")).toBeNull()
  })
})

describe("waitReason", () => {
  it("says why exports wait while there's no connection, or no sign-in", () => {
    expect(waitReason("offline")).toBe("Exports need a connection.")
    expect(waitReason("auth-required")).toBe("Sign in to export.")
    expect(waitReason("online")).toBeNull()
  })
})

describe("exportFailure", () => {
  it.each([
    ["no error", null, null],
    ["a lost connection", new Offline(), "No connection. Try again once you're back online."],
    ["an expired sign-in", new AuthRequired(), "You're signed out. Sign in, then try again."],
    ["a refused caregiver", new Unauthorized(), "You're signed out. Sign in, then try again."],
    ["a refusing share sheet", new ShareFailed("refused"), "The file couldn't be shared. Try again."],
    ["a household that's away", new ServiceUnavailable(), "The export couldn't be made. Try again."],
    ["anything else", new Unexpected({ status: 500 }), "The export couldn't be made. Try again."],
  ])("words %s", (_label, error, message) => {
    expect(exportFailure(error)).toBe(message)
  })
})
