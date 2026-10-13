import {
  invalidInputFrom,
  type Me,
  NewSupplement,
  type SavedSupplement,
  type Supplement,
  SupplementConflict,
  SupplementEdit,
} from "@bt/contracts"
import { Result, Schema } from "effect"
import type { HouseholdApi } from "./client.ts"

export interface SupplementFields {
  readonly name: string
  readonly dose: string
  readonly stopped: boolean
}

const checkNew = Schema.decodeUnknownResult(NewSupplement, { errors: "all" })
const checkEdit = Schema.decodeUnknownResult(SupplementEdit, { errors: "all" })

const isStopped = (supplement: Supplement) => supplement.stoppedAt !== null

const supplementEdit = (latest: Supplement, shown: Supplement, fields: SupplementFields) => {
  const edit = checkEdit({
    actionId: crypto.randomUUID(),
    version: latest.version,
    name: fields.name === shown.name ? latest.name : fields.name,
    dose: fields.dose === shown.dose ? latest.dose : fields.dose,
    stopped: fields.stopped === isStopped(shown) ? isStopped(latest) : fields.stopped,
  })
  if (Result.isFailure(edit)) throw invalidInputFrom(edit.failure.issue)
  return edit.success
}

const addSupplement = (api: HouseholdApi, { name, dose }: SupplementFields) => {
  const entry = checkNew({ actionId: crypto.randomUUID(), name, dose })
  if (Result.isFailure(entry)) throw invalidInputFrom(entry.failure.issue)
  return api.request((client) => client.supplements.addSupplement({ payload: entry.success }))
}

export const saveSupplement = async (
  api: HouseholdApi,
  shown: Supplement | null,
  fields: SupplementFields,
): Promise<SavedSupplement> => {
  if (shown === null) return addSupplement(api, fields)
  const send = (latest: Supplement) => {
    const payload = supplementEdit(latest, shown, fields)
    return api.request((client) => client.supplements.editSupplement({ params: { id: shown.id }, payload }))
  }
  try {
    return await send(shown)
  } catch (error) {
    if (error instanceof SupplementConflict && error.code === "STALE_VERSION") return send(error.current)
    throw error
  }
}

export const withSavedSupplement = (me: Me, supplement: Supplement): Me => {
  const listed = me.household.supplements
  const supplements = listed.some(({ id }) => id === supplement.id)
    ? listed.map((one) => (one.id === supplement.id ? supplement : one))
    : [...listed, supplement]
  return { ...me, household: { ...me.household, supplements } }
}
