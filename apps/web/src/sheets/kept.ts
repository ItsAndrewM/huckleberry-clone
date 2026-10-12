import { Data, Option, Schema } from "effect"
import { attempt, type BrowserStorage } from "../storage.ts"
import { actionIdOf, settlesWithoutAsking } from "./held.ts"
import { type Failed, Sending } from "./sending.ts"
import { isEntry } from "./sheets-state.ts"

export const KEPT_KEY = "bt.kept"

export const KeptEntry = Schema.Struct({
  sending: Sending,
  keptAt: Schema.Int,
  idSince: Schema.Int,
  failed: Schema.Boolean,
})
export type KeptEntry = typeof KeptEntry.Type

type Unread = typeof Schema.Json.Type

export interface Stored {
  readonly entries: ReadonlyArray<KeptEntry>
  readonly unreadable: ReadonlyArray<Unread>
}

const isKeptEntry = Schema.is(KeptEntry)

const decodeStored = Schema.decodeUnknownOption(Schema.fromJsonString(Schema.Array(Schema.Json)))

export const keptStorage = () => localStorage

export const readKept = (openStorage: () => BrowserStorage): Stored => {
  const stored = attempt(() => openStorage().getItem(KEPT_KEY), null)
  const records = stored === null ? [] : Option.getOrElse(decodeStored(stored), () => [])
  return {
    entries: records.flatMap((record) => (isKeptEntry(record) && isEntry(record.sending) ? [record] : [])),
    unreadable: records.filter((record) => !isKeptEntry(record)),
  }
}

export const writeKept = (
  openStorage: () => BrowserStorage,
  entries: ReadonlyArray<KeptEntry>,
  unreadable: ReadonlyArray<Unread>,
) =>
  attempt(() => {
    const records = [...entries, ...unreadable]
    if (records.length === 0) openStorage().removeItem(KEPT_KEY)
    else openStorage().setItem(KEPT_KEY, JSON.stringify(records))
    return true
  }, false)

const idOf = ({ sending }: KeptEntry) => actionIdOf(sending)

const upsert = (entries: ReadonlyArray<KeptEntry>, sending: Sending, failed: boolean, now: number) => {
  const actionId = actionIdOf(sending)
  const before = entries.find((entry) => idOf(entry) === actionId)
  const kept = { sending, keptAt: before?.keptAt ?? now, idSince: before?.idSince ?? now, failed }
  return before === undefined ? [...entries, kept] : entries.map((entry) => (entry === before ? kept : entry))
}

export const keptWithout = (entries: ReadonlyArray<KeptEntry>, actionId: string) =>
  entries.some((entry) => idOf(entry) === actionId) ? entries.filter((entry) => idOf(entry) !== actionId) : entries

export const keptAfterSend = (entries: ReadonlyArray<KeptEntry>, sending: Sending, now: number) =>
  isEntry(sending) ? upsert(entries, sending, false, now) : entries

export const keptAfterFailure = (entries: ReadonlyArray<KeptEntry>, { sending, error }: Failed, now: number) => {
  if (!isEntry(sending)) return entries
  return settlesWithoutAsking(error) ? keptWithout(entries, actionIdOf(sending)) : upsert(entries, sending, true, now)
}

export class Unsaved extends Data.TaggedError("Unsaved")<{ readonly keptAt: number; readonly failed: boolean }> {}
