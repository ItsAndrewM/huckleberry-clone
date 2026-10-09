import { env } from "cloudflare:test"
import type { HouseholdSeed } from "../src/seed.ts"

export const ANDREW = { email: "andrew@example.test", displayName: "Andrew" }
export const EMILY = { email: "emily@example.test", displayName: "Emily" }

export const SEED: HouseholdSeed = {
  name: "Test household",
  timeZone: "America/Vancouver",
  caregivers: [ANDREW, EMILY],
  child: { name: "Robin", birthDate: "2026-09-01", sex: "female", gestationalAgeDays: 281 },
}

export const newHousehold = () => env.HOUSEHOLD.getByName(crypto.randomUUID())

export const seededHousehold = async (seed: HouseholdSeed = SEED) => {
  const household = newHousehold()
  await household.seedHousehold(seed)
  return household
}
