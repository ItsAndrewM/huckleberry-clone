import { Exit, Schema } from "effect"
import { describe, expect, it } from "vitest"
import { ActionId } from "../src/index.ts"

const decode = Schema.decodeUnknownExit(Schema.toCodecJson(ActionId))

describe("ActionId", () => {
  it.each(["8b2f9c3e-1d4a-4f6b-9e7c-5a3b2c1d0e9f", "8B2F9C3E-1D4A-4F6B-9E7C-5A3B2C1D0E9F"])(
    "keeps %s exactly as sent, so a retry's request hash matches the receipt's",
    (id) => {
      const exit = decode(id)
      expect(Exit.isSuccess(exit) && exit.value).toBe(id)
    },
  )

  it.each(["", "not-a-uuid", "8b2f9c3e1d4a4f6b9e7c5a3b2c1d0e9f", " 8b2f9c3e-1d4a-4f6b-9e7c-5a3b2c1d0e9f", 42, null])(
    "refuses %j",
    (input) => {
      expect(Exit.isFailure(decode(input))).toBe(true)
    },
  )
})
