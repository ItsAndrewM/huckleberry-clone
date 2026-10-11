import { describe, expect, it } from "vitest"
import { amountText, parsedAmount, stepped } from "../src/features/feed/amounts.ts"

describe("bottle amounts", () => {
  it("shows mL as stored, and fl oz to one decimal", () => {
    expect(amountText(60, "ml")).toBe("60")
    expect(amountText(59.1, "ml")).toBe("59.1")
    expect(amountText(59.1, "fl_oz")).toBe("2.0")
  })

  it("steps by 10 mL, or by half an ounce from what's shown, never below nothing or past 500 mL", () => {
    expect(stepped(55, "ml", 1)).toBe(65)
    expect(stepped(5, "ml", -1)).toBe(0)
    expect(stepped(495, "ml", 1)).toBe(500)
    expect(stepped(59.1, "fl_oz", 1)).toBe(73.9)
    expect(stepped(59.1, "fl_oz", -1)).toBe(44.4)
    expect(stepped(0, "fl_oz", -1)).toBe(0)
  })

  it("reads what's typed in the household's unit, an empty field as nothing, and refuses the rest", () => {
    expect(parsedAmount("75", "ml")).toBe(75)
    expect(parsedAmount("2.5", "fl_oz")).toBe(73.9)
    expect(parsedAmount(" ", "ml")).toBe(0)
    expect(parsedAmount("abc", "ml")).toBeNull()
    expect(parsedAmount("-5", "ml")).toBeNull()
    expect(parsedAmount("501", "ml")).toBeNull()
  })
})
