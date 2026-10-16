import { Data, Option, Schema } from "effect"
import { attempt, type BrowserStorage } from "../storage.ts"
import { actionIdOf, settlesWithoutAsking } from "./held.ts"
import { stillSaveable } from "./saveable.ts"
import { type Failed, isEntry, Sending, type SheetKind } from "./sending.ts"

export const KEPT_KEY = "bt.kept"

const CONTROL_SHEETS = new Set<SheetKind>(["nursing", "sleep"])

const isKeptControl = (sending: Sending) => !isEntry(sending) && CONTROL_SHEETS.has(sending.sheet)

export const isKept = (sending: Sending) => isEntry(sending) || isKeptControl(sending)

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
    entries: records.flatMap((record) => (isKeptEntry(record) && isKept(record.sending) ? [record] : [])),
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

interface KeptControl {
  readonly sending: Sending
  readonly failed: boolean
}

const controlsToKeep = (
  entries: ReadonlyArray<KeptEntry>,
  held: ReadonlyArray<Failed>,
  busy: Sending | null,
): ReadonlyArray<KeptControl> => {
  const asking = held.flatMap((failed) =>
    isKeptControl(failed.sending) && stillSaveable(failed) ? [{ sending: failed.sending, failed: true }] : [],
  )
  const resent = busy !== null && isKeptControl(busy) && entries.some((entry) => idOf(entry) === actionIdOf(busy))
  return resent ? [...asking, { sending: busy, failed: false }] : asking
}

const withControl = (entries: ReadonlyArray<KeptEntry>, { sending, failed }: KeptControl, now: number) =>
  entries.some((entry) => entry.sending === sending && entry.failed === failed)
    ? entries
    : upsert(entries, sending, failed, now)

const sameRecords = (next: ReadonlyArray<KeptEntry>, entries: ReadonlyArray<KeptEntry>) =>
  next.length === entries.length && next.every((entry, index) => entry === entries[index])

export const keptWithHeld = (
  entries: ReadonlyArray<KeptEntry>,
  held: ReadonlyArray<Failed>,
  busy: Sending | null,
  now: number,
) => {
  const controls = controlsToKeep(entries, held, busy)
  const ids = new Set(controls.map(({ sending }) => actionIdOf(sending)))
  const still = entries.filter((entry) => isEntry(entry.sending) || ids.has(idOf(entry)))
  const next = controls.reduce<ReadonlyArray<KeptEntry>>((list, control) => withControl(list, control, now), still)
  return sameRecords(next, entries) ? entries : next
}

export class Unsaved extends Data.TaggedError("Unsaved")<{ readonly keptAt: number; readonly failed: boolean }> {}
