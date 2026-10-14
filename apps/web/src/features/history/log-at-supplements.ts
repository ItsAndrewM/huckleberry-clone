import type { Supplement } from "@bt/contracts"

export interface SupplementChoice {
  readonly id: string
  readonly label: string
}

export const supplementChoices = (supplements: ReadonlyArray<Supplement>): ReadonlyArray<SupplementChoice> =>
  supplements.filter(({ stoppedAt }) => stoppedAt === null).map(({ id, name }) => ({ id, label: name }))
