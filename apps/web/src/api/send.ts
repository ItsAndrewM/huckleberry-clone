import type { SavedDiaper, SavedDose, SavedFeed, SavedMeasurement } from "@bt/contracts"
import {
  type Action,
  type DiaperAction,
  type DoseAction,
  type FeedAction,
  isDiaperAction,
  isDoseAction,
  isMeasurementAction,
  type MeasurementAction,
} from "./actions.ts"
import type { HouseholdApi } from "./client.ts"

export type Saved = SavedDiaper | SavedFeed | SavedMeasurement | SavedDose

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
    case "restoreDiaper":
      return api.request((client) =>
        client.diapers.restoreDiaper({ params: { id: action.id }, payload: action.payload }),
      )
  }
}

const sendNewFeed = (api: HouseholdApi, action: NewFeed): Promise<SavedFeed> =>
  action.kind === "logFeed"
    ? api.request((client) => client.feeds.logFeed({ payload: action.payload }))
    : api.request((client) => client.feeds.startFeed({ payload: action.payload }))

type OnPart = Extract<OnFeed, { readonly kind: "editSegment" | "deletePortion" | "editPortion" }>

const PART_KINDS = new Set<Action["kind"]>(["editSegment", "deletePortion", "editPortion"])

const isOnPart = (action: OnFeed): action is OnPart => PART_KINDS.has(action.kind)

const sendOnPart = (api: HouseholdApi, action: OnPart): Promise<SavedFeed> => {
  const params = { id: action.id }
  switch (action.kind) {
    case "editSegment":
      return api.request((client) => client.segments.editSegment({ params, payload: action.payload }))
    case "deletePortion":
      return api.request((client) => client.portions.deletePortion({ params, payload: action.payload }))
    case "editPortion":
      return api.request((client) => client.portions.editPortion({ params, payload: action.payload }))
  }
}

const sendOnFeed = (api: HouseholdApi, action: OnFeed): Promise<SavedFeed> => {
  if (isOnPart(action)) return sendOnPart(api, action)
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
    case "editFeed":
      return api.request((client) => client.feeds.editFeed({ params, payload: action.payload }))
    case "deleteFeed":
      return api.request((client) => client.feeds.deleteFeed({ params, payload: action.payload }))
    case "restoreFeed":
      return api.request((client) => client.feeds.restoreFeed({ params, payload: action.payload }))
  }
}

const sendMeasurement = (api: HouseholdApi, action: MeasurementAction): Promise<SavedMeasurement> => {
  switch (action.kind) {
    case "logMeasurement":
      return api.request((client) => client.growth.logMeasurement({ payload: action.payload }))
    case "editMeasurement":
      return api.request((client) =>
        client.growth.editMeasurement({ params: { id: action.id }, payload: action.payload }),
      )
    case "deleteMeasurement":
      return api.request((client) =>
        client.growth.deleteMeasurement({ params: { id: action.id }, payload: action.payload }),
      )
    case "restoreMeasurement":
      return api.request((client) =>
        client.growth.restoreMeasurement({ params: { id: action.id }, payload: action.payload }),
      )
  }
}

const sendDose = (api: HouseholdApi, action: DoseAction): Promise<SavedDose> => {
  switch (action.kind) {
    case "logDose":
      return api.request((client) => client.doses.logDose({ payload: action.payload }))
    case "editDose":
      return api.request((client) => client.doses.editDose({ params: { id: action.id }, payload: action.payload }))
    case "deleteDose":
      return api.request((client) => client.doses.deleteDose({ params: { id: action.id }, payload: action.payload }))
    case "restoreDose":
      return api.request((client) => client.doses.restoreDose({ params: { id: action.id }, payload: action.payload }))
  }
}

export const send = (api: HouseholdApi, action: Action): Promise<Saved> => {
  if (isDoseAction(action)) return sendDose(api, action)
  if (isMeasurementAction(action)) return sendMeasurement(api, action)
  if (isDiaperAction(action)) return sendDiaper(api, action)
  return "id" in action ? sendOnFeed(api, action) : sendNewFeed(api, action)
}
