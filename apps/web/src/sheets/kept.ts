import { Data, Option, Schema } from "effect"
import { attempt, type BrowserStorage } from "../storage.ts"
import { actionIdOf } from "./held.ts"
import { Sending } from "./sending.ts"

export const KEPT_KEY = "bt.kept"

export const KeptEntry = Schema.Struct({ sending: Sending, keptAt: Schema.Int, failed: Schema.Boolean })
export type KeptEntry = typeof KeptEntry.Type

const isKeptEntry = Schema.is(KeptEntry)

const decodeStored = Schema.decodeUnknownOption(Schema.fromJsonString(Schema.Array(Schema.Json)))

export const keptStorage = () => localStorage

export const readKept = (openStorage: () => BrowserStorage): ReadonlyArray<KeptEntry> => {
  const stored = attempt(() => openStorage().getItem(KEPT_KEY), null)
  if (stored === null) return []
  return Option.getOrElse(decodeStored(stored), () => []).flatMap((entry) => (isKeptEntry(entry) ? [entry] : []))
}

export const writeKept = (openStorage: () => BrowserStorage, entries: ReadonlyArray<KeptEntry>) =>
  attempt(() => {
    if (entries.length === 0) openStorage().removeItem(KEPT_KEY)
    else openStorage().setItem(KEPT_KEY, JSON.stringify(entries))
    return true
  }, false)

const idOf = ({ sending }: KeptEntry) => actionIdOf(sending)

const upsert = (entries: ReadonlyArray<KeptEntry>, sending: Sending, failed: boolean, now: number) => {
  const actionId = actionIdOf(sending)
  const before = entries.find((entry) => idOf(entry) === actionId)
  const kept = { sending, keptAt: before?.keptAt ?? now, failed }
  return before === undefined ? [...entries, kept] : entries.map((entry) => (entry === before ? kept : entry))
}

export const keptSending = (entries: ReadonlyArray<KeptEntry>, sending: Sending, now: number) =>
  upsert(entries, sending, false, now)

export const keptFailed = (entries: ReadonlyArray<KeptEntry>, sending: Sending, now: number) =>
  upsert(entries, sending, true, now)

export const keptWithout = (entries: ReadonlyArray<KeptEntry>, actionId: string) =>
  entries.some((entry) => idOf(entry) === actionId) ? entries.filter((entry) => idOf(entry) !== actionId) : entries

export class Unsaved extends Data.TaggedError("Unsaved")<{ readonly keptAt: number; readonly failed: boolean }> {}
