import type { Locator } from "@playwright/test"
import { expect } from "./test.ts"

export const beforeAnyMessage = async (scope: Locator, fields: ReadonlyArray<Locator>) => {
  for (const field of fields) {
    await expect(field).toBeVisible()
    await expect(field).not.toHaveAttribute("aria-invalid", "true")
  }
  await scope.locator('[aria-live="polite"], output, [role="status"]').evaluateAll((regions) => {
    for (const region of regions) region.setAttribute("data-polite-before", "")
  })
}

interface Told {
  readonly about: ReadonlyArray<Locator>
  readonly notAbout?: ReadonlyArray<Locator>
  readonly invalid: boolean
}

export const expectToldPolitely = async (scope: Locator, said: RegExp, { about, notAbout = [], invalid }: Told) => {
  for (const field of about) {
    await expect(field).toHaveAccessibleDescription(said)
    if (invalid) await expect(field).toHaveAttribute("aria-invalid", "true")
    else await expect(field).not.toHaveAttribute("aria-invalid", "true")
  }
  for (const field of notAbout) {
    await expect(field).not.toHaveAccessibleDescription(said)
    await expect(field).not.toHaveAttribute("aria-invalid", "true")
  }
  await expect(scope.locator("[data-polite-before]").filter({ hasText: said })).toHaveCount(1)
}
