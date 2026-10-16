import { describe, expect, it } from "vitest"
import { ShareFailed } from "../src/features/settings/export-file.ts"
import { exportState } from "../src/features/settings/export-state.ts"

const file = new File(["Kind,Start\r\n"], "baby-tracker-2026-10-09.csv", { type: "text/csv" })
const IDLE = { isPending: false, data: undefined, error: null, variables: undefined }
const MADE = { kind: "csv", file, delivery: "needs-a-tap" } as const

describe("exportState", () => {
  it("waits on nothing before a file is asked for", () => {
    expect(exportState(IDLE)).toEqual({ busy: false, preparing: null, waiting: null, sharing: false, failure: null })
  })

  it("is preparing the kind asked for while its file is made", () => {
    expect(exportState({ ...IDLE, isPending: true, variables: { kind: "csv", file: null } })).toEqual({
      busy: true,
      preparing: "csv",
      waiting: null,
      sharing: false,
      failure: null,
    })
  })

  it("keeps a made file waiting when the share sheet asked for a fresh tap", () => {
    expect(exportState({ ...IDLE, data: MADE, variables: { kind: "csv", file: null } }).waiting).toBe(MADE)
  })

  it("keeps the waiting file while it's shared again, without preparing it again", () => {
    expect(exportState({ ...IDLE, isPending: true, variables: { kind: "csv", file } })).toEqual({
      busy: true,
      preparing: null,
      waiting: MADE,
      sharing: true,
      failure: null,
    })
  })

  it("lets the file go once it's shared again", () => {
    const shared = { ...MADE, delivery: "shared" } as const
    expect(exportState({ ...IDLE, data: shared, variables: { kind: "csv", file } }).waiting).toBeNull()
  })

  it("words a failure only once the attempt is over", () => {
    const error = new ShareFailed("refused")
    expect(exportState({ ...IDLE, error }).failure).toBe("The file couldn't be shared. Try again.")
    expect(exportState({ ...IDLE, isPending: true, error, variables: { kind: "csv", file } }).failure).toBeNull()
  })
})
