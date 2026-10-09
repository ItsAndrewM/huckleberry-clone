import { Schema } from "effect"
import { describe, expect, it } from "vitest"
import { ChangedMessage, queryKeys } from "../src/index.ts"

const messageJson = Schema.fromJsonString(ChangedMessage)

describe("ChangedMessage", () => {
  it("is the JSON an installed app reads after a deploy, so its format can't drift", () => {
    const message = { changed: [queryKeys.today, queryKeys.last24h, queryKeys.day("2026-10-09")] }
    const json = '{"changed":[["today"],["last24h"],["day","2026-10-09"]]}'
    expect(Schema.encodeSync(messageJson)(message)).toBe(json)
    expect(Schema.decodeUnknownSync(messageJson)(json)).toEqual(message)
  })
})
