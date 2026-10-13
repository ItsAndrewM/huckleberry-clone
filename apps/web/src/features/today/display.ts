import type { CaregiverName, Me, Supplement, VolumeUnit } from "@bt/contracts"

export interface Display {
  readonly timeZone: string
  readonly volume: VolumeUnit
  readonly caregivers: ReadonlyArray<CaregiverName>
  readonly supplements: ReadonlyArray<Supplement>
  readonly locale?: string
}

export const displayOf = ({ timeZone, units, caregivers, supplements }: Me["household"]): Display => ({
  timeZone,
  volume: units.volume,
  caregivers,
  supplements,
})

export const supplementName = ({ supplements }: Display, id: string) =>
  supplements.find((supplement) => supplement.id === id)?.name ?? "Supplement"
