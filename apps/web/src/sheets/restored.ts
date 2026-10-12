import { DRAFT_RETRY_MS, type Draft, isFresh, renewed, StaleDraft } from "./drafts.ts"
import { actionIdOf } from "./held.ts"
import { type KeptEntry, type Stored, Unsaved } from "./kept.ts"
import type { Failed, Sending } from "./sending.ts"
import { isEntry } from "./sheets-state.ts"

export interface Restored {
  readonly held: ReadonlyArray<Failed>
  readonly kept: ReadonlyArray<KeptEntry>
  readonly unreadable: Stored["unreadable"]
  readonly resend: Sending | null
}

interface Back {
  readonly held: Failed
  readonly kept: KeptEntry | null
}

const idIsFresh = ({ idSince }: KeptEntry, now: number) => now - idSince < DRAFT_RETRY_MS

const entryBack = (entry: KeptEntry, now: number, newId: () => string): Back => {
  const error = new Unsaved({ keptAt: entry.keptAt, failed: entry.failed })
  if (idIsFresh(entry, now)) return { held: { sending: entry.sending, error }, kept: entry }
  const sending = renewed(entry.sending, newId())
  return { held: { sending, error }, kept: { ...entry, sending, idSince: now } }
}

const staleDraftBack = (draft: Draft, copy: KeptEntry | undefined, actionId: string, now: number): Back => {
  const sending = renewed(draft.sending, actionId)
  const kept = { sending, keptAt: copy?.keptAt ?? draft.createdAt, idSince: now, failed: true }
  return {
    held: { sending, error: new StaleDraft({ createdAt: draft.createdAt }) },
    kept: isEntry(sending) ? kept : null,
  }
}

const resendOf = (draft: Draft | null, copy: KeptEntry | undefined, now: number) =>
  draft !== null && isFresh(draft, now) && (copy === undefined || idIsFresh(copy, now)) ? draft.sending : null

export const restored = (
  draft: Draft | null,
  { entries, unreadable }: Stored,
  now: number,
  newId: () => string,
): Restored => {
  const draftId = draft === null ? null : actionIdOf(draft.sending)
  const copy = entries.find((entry) => actionIdOf(entry.sending) === draftId)
  const resend = resendOf(draft, copy, now)
  const stale = draft === null || resend !== null ? [] : [staleDraftBack(draft, copy, newId(), now)]
  const back = [...stale, ...entries.filter((entry) => entry !== copy).map((entry) => entryBack(entry, now, newId))]
  const kept = back.flatMap((entry) => (entry.kept === null ? [] : [entry.kept]))
  const resending = resend === null || copy === undefined ? [] : [copy]
  return { held: back.map(({ held }) => held), kept: [...kept, ...resending], unreadable, resend }
}
