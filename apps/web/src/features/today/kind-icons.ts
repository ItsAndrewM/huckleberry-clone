import { BabyIcon, DropletsIcon, MilkIcon, MoonStarIcon, PillIcon } from "lucide-react"
import type { RowKind } from "./recent-rows.ts"

export const KIND_ICONS = {
  nursing: BabyIcon,
  bottle: MilkIcon,
  diaper: DropletsIcon,
  sleep: MoonStarIcon,
  dose: PillIcon,
} as const satisfies Record<RowKind, typeof BabyIcon>
