import { InvalidInput, type Supplement } from "@bt/contracts"
import type { SupplementFields } from "../../api/supplements.ts"

export interface SupplementItem {
  readonly id: string
  readonly label: string
  readonly supplement: Supplement
}

const itemOf = (supplement: Supplement): SupplementItem => ({
  id: supplement.id,
  label: supplement.dose === "" ? supplement.name : `${supplement.name} · ${supplement.dose}`,
  supplement,
})

export const supplementList = (supplements: ReadonlyArray<Supplement>) => ({
  inUse: supplements.filter(({ stoppedAt }) => stoppedAt === null).map(itemOf),
  stopped: supplements.filter(({ stoppedAt }) => stoppedAt !== null).map(itemOf),
})

const text = (form: FormData, name: string) => String(form.get(name) ?? "").trim()

export const supplementFieldsOf = (form: FormData, stopped: boolean): SupplementFields => ({
  name: text(form, "supplement-name"),
  dose: text(form, "supplement-dose"),
  stopped,
})

export const stopQuestion = (name: string) => `Stop giving ${name}? Today won't list it until you give it again.`

const FIELD_MESSAGES = {
  name: "Enter a name of up to 60 characters.",
  dose: "Keep the dose to 40 characters or fewer.",
} as const

export const supplementFieldMessage = (error: Error | null, path: "name" | "dose"): string | undefined => {
  if (!(error instanceof InvalidInput)) return undefined
  return error.fieldErrors.some((fieldError) => fieldError.path === path) ? FIELD_MESSAGES[path] : undefined
}
