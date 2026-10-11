import type { Child, Measurement, Me, Units } from "@bt/contracts"

export const ZONE = "America/Vancouver"
export const BIRTH_DATE = "2026-09-01"
export const LOCALE = "en-US"
export const UNITS: Units = { volume: "ml", weight: "kg", length: "cm" }

export const at = (localDate: string, hour: number) =>
  Date.parse(`${localDate}T${String(hour).padStart(2, "0")}:00:00-07:00`)

interface Metrics {
  readonly weightG?: number
  readonly lengthCm?: number
  readonly headCm?: number
}

export const measurement = (id: string, measuredAt: number, metrics: Metrics): Measurement => ({
  id,
  measuredAt,
  weightG: metrics.weightG ?? null,
  lengthCm: metrics.lengthCm ?? null,
  headCm: metrics.headCm ?? null,
  version: 1,
  createdBy: "caregiver-andrew",
  createdAt: measuredAt,
  updatedBy: "caregiver-andrew",
  updatedAt: measuredAt,
  deletedAt: null,
})

export const MEASUREMENTS = [
  measurement("m3", at("2026-10-06", 10), { weightG: 4300, lengthCm: 54.5, headCm: 36.8 }),
  measurement("m2", at("2026-09-15", 10), { weightG: 3600, headCm: 35.1 }),
  measurement("m1", at("2026-09-01", 10), { weightG: 3200, lengthCm: 49.5, headCm: 34 }),
]

const CHILD: Child = {
  name: "Robin",
  birthDate: BIRTH_DATE,
  sex: "female",
  gestationalAgeDays: 281,
  version: 1,
  updatedBy: null,
  updatedAt: at("2026-09-01", 9),
}

interface MeChange {
  readonly units?: Units
  readonly child?: Partial<Child>
}

export const meWith = ({ units = UNITS, child = {} }: MeChange = {}): Me => ({
  caregiver: { id: "caregiver-andrew", email: "andrew@example.test", displayName: "Andrew" },
  household: {
    name: "Test household",
    timeZone: ZONE,
    units,
    version: 1,
    updatedBy: null,
    updatedAt: at("2026-09-01", 9),
    caregivers: [{ id: "caregiver-andrew", displayName: "Andrew" }],
  },
  child: { ...CHILD, ...child },
})
