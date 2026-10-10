import { parseArgs } from "node:util"
import type { HouseholdSeed } from "../apps/worker/src/seed.ts"
import type { CaregiverJson, EmailChangeJson } from "./admin-caregiver.ts"

type SeedJson = (typeof HouseholdSeed)["Encoded"]

export interface AdminEnv {
  readonly BT_URL?: string | undefined
  readonly CF_ACCESS_CLIENT_ID?: string | undefined
  readonly CF_ACCESS_CLIENT_SECRET?: string | undefined
}

const SEXES = ["female", "male"] as const

const sexOf = (value: string): SeedJson["child"]["sex"] => {
  const sex = SEXES.find((known) => known === value)
  if (sex === undefined) throw new Error(`--sex must be female or male, not "${value}"`)
  return sex
}

const caregiverOf = (value: string) => {
  const separator = value.indexOf("=")
  if (separator < 1) throw new Error(`--caregiver takes email=Display Name, not "${value}"`)
  return { email: value.slice(0, separator).trim().toLowerCase(), displayName: value.slice(separator + 1).trim() }
}

const required = (name: string, value: string | undefined) => {
  if (value === undefined || value === "") throw new Error(`Missing --${name}`)
  return value
}

export const seedFromArgs = (args: ReadonlyArray<string>): SeedJson => {
  const { values } = parseArgs({
    args: [...args],
    options: {
      name: { type: "string" },
      "time-zone": { type: "string" },
      caregiver: { type: "string", multiple: true },
      "child-name": { type: "string" },
      "birth-date": { type: "string" },
      sex: { type: "string" },
      "gestational-age-days": { type: "string" },
    },
    strict: true,
  })
  return {
    name: required("name", values.name),
    timeZone: required("time-zone", values["time-zone"]),
    caregivers: (values.caregiver ?? []).map(caregiverOf),
    child: {
      name: required("child-name", values["child-name"]),
      birthDate: required("birth-date", values["birth-date"]),
      sex: sexOf(required("sex", values.sex)),
      gestationalAgeDays: Number(required("gestational-age-days", values["gestational-age-days"])),
    },
  }
}

const fromEnv = (env: AdminEnv, name: keyof AdminEnv) => {
  const value = env[name]
  if (value === undefined || value === "") throw new Error(`Set ${name} in .admin-token.env`)
  return value
}

const adminUrl = (env: AdminEnv, path: string) => {
  const url = new URL(path, fromEnv(env, "BT_URL"))
  if (url.protocol !== "https:")
    throw new Error("BT_URL must start with https://, so the service token is never sent in the clear")
  return url
}

export type AdminBody = SeedJson | CaregiverJson | EmailChangeJson

export const adminRequest = (env: AdminEnv, path: `/api/admin/${string}`, body: AdminBody): Request =>
  new Request(adminUrl(env, path), {
    method: "POST",
    redirect: "manual",
    headers: {
      "cf-access-client-id": fromEnv(env, "CF_ACCESS_CLIENT_ID"),
      "cf-access-client-secret": fromEnv(env, "CF_ACCESS_CLIENT_SECRET"),
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  })
