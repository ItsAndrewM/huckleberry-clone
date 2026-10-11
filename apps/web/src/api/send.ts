import type { SavedDiaper, SavedFeed } from "@bt/contracts"
import { type Action, type DiaperAction, type FeedAction, isDiaperAction } from "./actions.ts"
import type { HouseholdApi } from "./client.ts"

export type Saved = SavedDiaper | SavedFeed

type OnFeed = Extract<FeedAction, { readonly id: string }>
type NewFeed = Exclude<FeedAction, OnFeed>

const sendDiaper = (api: HouseholdApi, action: DiaperAction): Promise<SavedDiaper> => {
  switch (action.kind) {
    case "logDiaper":
      return api.request((client) => client.diapers.logDiaper({ payload: action.payload }))
    case "editDiaper":
      return api.request((client) => client.diapers.editDiaper({ params: { id: action.id }, payload: action.payload }))
    case "deleteDiaper":
      return api.request((client) =>
        client.diapers.deleteDiaper({ params: { id: action.id }, payload: action.payload }),
      )
  }
}

const sendNewFeed = (api: HouseholdApi, action: NewFeed): Promise<SavedFeed> =>
  action.kind === "logFeed"
    ? api.request((client) => client.feeds.logFeed({ payload: action.payload }))
    : api.request((client) => client.feeds.startFeed({ payload: action.payload }))

const sendOnFeed = (api: HouseholdApi, action: OnFeed): Promise<SavedFeed> => {
  const params = { id: action.id }
  switch (action.kind) {
    case "switchSide":
      return api.request((client) => client.feeds.switchSide({ params, payload: action.payload }))
    case "pauseFeed":
      return api.request((client) => client.feeds.pauseFeed({ params, payload: action.payload }))
    case "resumeFeed":
      return api.request((client) => client.feeds.resumeFeed({ params, payload: action.payload }))
    case "addBottle":
      return api.request((client) => client.feeds.addBottle({ params, payload: action.payload }))
    case "finishFeed":
      return api.request((client) => client.feeds.finishFeed({ params, payload: action.payload }))
    case "deleteFeed":
      return api.request((client) => client.feeds.deleteFeed({ params, payload: action.payload }))
    case "deletePortion":
      return api.request((client) => client.portions.deletePortion({ params, payload: action.payload }))
    case "editPortion":
      return api.request((client) => client.portions.editPortion({ params, payload: action.payload }))
  }
}

export const send = (api: HouseholdApi, action: Action): Promise<Saved> => {
  if (isDiaperAction(action)) return sendDiaper(api, action)
  return "id" in action ? sendOnFeed(api, action) : sendNewFeed(api, action)
}
