import { Data, Option, Schema } from "effect"
import { attempt, type BrowserStorage } from "../storage.ts"
import { Sending } from "./sending.ts"

export const DRAFT_KEY = "bt.draft"
export const DRAFT_RETRY_MS = 12 * 60 * 60 * 1000

export const Draft = Schema.Struct({ route: Schema.String, sending: Sending, createdAt: Schema.Int })
export type Draft = typeof Draft.Type

const decodeDraft = Schema.decodeUnknownOption(Schema.fromJsonString(Draft))

export const stashDraft = (openStorage: () => BrowserStorage, draft: Draft) =>
  attempt(() => {
    openStorage().setItem(DRAFT_KEY, JSON.stringify(draft))
    return true
  }, false)

const storedDraft = (openStorage: () => BrowserStorage) => {
  const stored = attempt(() => openStorage().getItem(DRAFT_KEY), null)
  return stored === null ? Option.none() : decodeDraft(stored)
}

const removeDraft = (openStorage: () => BrowserStorage) => attempt(() => openStorage().removeItem(DRAFT_KEY), undefined)

export const takeDraft = (openStorage: () => BrowserStorage, route: string): Draft | null => {
  const stored = storedDraft(openStorage)
  removeDraft(openStorage)
  return Option.getOrNull(Option.filter(stored, (draft) => draft.route === route))
}

export const dropDraft = (openStorage: () => BrowserStorage, actionId: string) => {
  const ofEntry = Option.exists(storedDraft(openStorage), ({ sending }) => sending.action.payload.actionId === actionId)
  if (ofEntry) removeDraft(openStorage)
}

export const draftStorage = () => sessionStorage

export const isFresh = (draft: Draft, now: number) => now - draft.createdAt < DRAFT_RETRY_MS

export class StaleDraft extends Data.TaggedError("StaleDraft")<{ readonly createdAt: number }> {}
