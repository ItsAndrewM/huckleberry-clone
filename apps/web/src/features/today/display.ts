import type { CaregiverName, Me, VolumeUnit } from "@bt/contracts"

export interface Display {
  readonly timeZone: string
  readonly volume: VolumeUnit
  readonly caregivers: ReadonlyArray<CaregiverName>
  readonly locale?: string
}

export const displayOf = ({ timeZone, units, caregivers }: Me["household"]): Display => ({
  timeZone,
  volume: units.volume,
  caregivers,
})
