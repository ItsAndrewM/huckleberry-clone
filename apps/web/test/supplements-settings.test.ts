import { InvalidInput, SupplementConflict } from "@bt/contracts"
import { describe, expect, it } from "vitest"
import { Offline } from "../src/api/errors.ts"
import { saveFailure } from "../src/features/settings/messages.ts"
import {
  stopQuestion,
  supplementFieldMessage,
  supplementFieldsOf,
  supplementList,
} from "../src/features/settings/supplement-fields.ts"
import { supplementOf } from "./today-fixtures.ts"

const VITAMIN_D = supplementOf()
const IRON = supplementOf({ id: "supplement-iron", name: "Iron", dose: "1 mL" })
const PROBIOTIC = supplementOf({
  id: "supplement-probiotic",
  name: "Probiotic",
  dose: "",
  stoppedAt: Date.UTC(2026, 9, 5),
})

const formWith = (entries: Record<string, string>) => {
  const form = new FormData()
  for (const [name, value] of Object.entries(entries)) form.set(name, value)
  return form
}

describe("supplementList", () => {
  it("lists the supplements in use first, in the household's order, and the stopped ones apart, each with its dose", () => {
    expect(supplementList([VITAMIN_D, PROBIOTIC, IRON])).toEqual({
      inUse: [
        { id: VITAMIN_D.id, label: "Vitamin D · 400 IU", supplement: VITAMIN_D },
        { id: IRON.id, label: "Iron · 1 mL", supplement: IRON },
      ],
      stopped: [{ id: PROBIOTIC.id, label: "Probiotic", supplement: PROBIOTIC }],
    })
  })
})

describe("supplementFieldsOf", () => {
  it("reads the name and dose as typed, trimmed, with whether the supplement is given", () => {
    expect(
      supplementFieldsOf(formWith({ "supplement-name": "  Iron drops ", "supplement-dose": " 0.5 mL " }), false),
    ).toEqual({
      name: "Iron drops",
      dose: "0.5 mL",
      stopped: false,
    })
    expect(supplementFieldsOf(formWith({}), true)).toEqual({ name: "", dose: "", stopped: true })
  })
})

describe("supplementFieldMessage", () => {
  const refused = new InvalidInput({
    fieldErrors: [
      { path: "name", issue: "invalid" },
      { path: "dose", issue: "invalid" },
    ],
  })

  it("says what each refused field needs", () => {
    expect(supplementFieldMessage(refused, "name")).toBe("Enter a name of up to 60 characters.")
    expect(supplementFieldMessage(refused, "dose")).toBe("Keep the dose to 40 characters or fewer.")
  })

  it("says nothing for a field the household accepted, or for another failure", () => {
    const nameOnly = new InvalidInput({ fieldErrors: [{ path: "name", issue: "invalid" }] })
    expect(supplementFieldMessage(nameOnly, "dose")).toBeUndefined()
    expect(supplementFieldMessage(new Offline(), "name")).toBeUndefined()
  })
})

describe("stopQuestion", () => {
  it("asks before a supplement leaves Today, naming it and how it comes back", () => {
    expect(stopQuestion("Vitamin D")).toBe("Stop giving Vitamin D? Today won't list it until you give it again.")
  })
})

describe("a supplement's save failure", () => {
  it("says the other phone changed it when the household still refuses the save after putting it on top", () => {
    expect(saveFailure(new SupplementConflict({ code: "STALE_VERSION", current: VITAMIN_D }))).toBe(
      "This changed on another phone a moment ago. Check it and try again.",
    )
  })
})
