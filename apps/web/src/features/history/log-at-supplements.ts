import type { Supplement } from "@bt/contracts"

export interface SupplementChoice {
  readonly id: string
  readonly label: string
}

const wasInUseAt =
  (at: number | null) =>
  ({ stoppedAt }: Supplement) =>
    stoppedAt === null || (at !== null && stoppedAt > at)

export const supplementChoices = (
  supplements: ReadonlyArray<Supplement>,
  at: number | null,
): ReadonlyArray<SupplementChoice> => supplements.filter(wasInUseAt(at)).map(({ id, name }) => ({ id, label: name }))
