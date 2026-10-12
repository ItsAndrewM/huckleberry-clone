import { DRAFT_RETRY_MS, type Draft, isFresh, renewed, StaleDraft } from "./drafts.ts"
import { actionIdOf } from "./held.ts"
import { type KeptEntry, Unsaved } from "./kept.ts"
import type { Failed } from "./sending.ts"

export interface Restored {
  readonly held: ReadonlyArray<Failed>
  readonly kept: ReadonlyArray<KeptEntry>
}

interface Back {
  readonly held: Failed
  readonly kept: KeptEntry
}

const staleDraftBack = (draft: Draft, actionId: string): Back => {
  const sending = renewed(draft.sending, actionId)
  return {
    held: { sending, error: new StaleDraft({ createdAt: draft.createdAt }) },
    kept: { sending, keptAt: draft.createdAt, failed: true },
  }
}

const entryBack = (entry: KeptEntry, now: number, newId: () => string): Back => {
  const sending = now - entry.keptAt < DRAFT_RETRY_MS ? entry.sending : renewed(entry.sending, newId())
  return {
    held: { sending, error: new Unsaved({ keptAt: entry.keptAt, failed: entry.failed }) },
    kept: { ...entry, sending },
  }
}

export const restored = (
  draft: Draft | null,
  stored: ReadonlyArray<KeptEntry>,
  now: number,
  newId: () => string,
): Restored => {
  const draftId = draft === null ? null : actionIdOf(draft.sending)
  const resent = draft !== null && isFresh(draft, now)
  const stale = draft === null || resent ? [] : [staleDraftBack(draft, newId())]
  const back = [
    ...stale,
    ...stored.filter((entry) => actionIdOf(entry.sending) !== draftId).map((entry) => entryBack(entry, now, newId)),
  ]
  const resending = resent ? stored.filter((entry) => actionIdOf(entry.sending) === draftId) : []
  return { held: back.map(({ held }) => held), kept: [...back.map(({ kept }) => kept), ...resending] }
}
