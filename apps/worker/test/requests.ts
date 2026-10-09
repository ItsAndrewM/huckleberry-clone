import { runInDurableObject } from "cloudflare:test"
import type { Schema } from "effect"
import type { HouseholdDO } from "../src/household.ts"
import { ANDREW } from "./fixtures.ts"

export type Household = DurableObjectStub<HouseholdDO>

const ORIGIN = "https://bt.example.test"

export const get = (household: Household, path: string, email?: string) =>
  household.fetch(`${ORIGIN}${path}`, email === undefined ? {} : { headers: { "x-bt-email": email } })

export const send = (household: Household, method: string, path: string, body: string, email = ANDREW.email) =>
  household.fetch(`${ORIGIN}${path}`, {
    method,
    headers: { "content-type": "application/json", "x-bt-email": email },
    body,
  })

export const sendJson = async (
  household: Household,
  method: string,
  path: string,
  body: Schema.Json,
  email = ANDREW.email,
) => {
  const response = await send(household, method, path, JSON.stringify(body), email)
  return { status: response.status, body: await response.json() }
}

export const inStorage = <R>(household: Household, read: (sql: SqlStorage) => R) =>
  runInDurableObject(household, (_instance, state) => read(state.storage.sql))

export const sha256 = async (text: string) => {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text))
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("")
}
