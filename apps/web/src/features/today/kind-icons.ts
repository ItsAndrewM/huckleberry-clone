import { BabyIcon, DropletsIcon, MilkIcon } from "lucide-react"
import type { RowKind } from "./recent-rows.ts"

export const KIND_ICONS = { nursing: BabyIcon, bottle: MilkIcon, diaper: DropletsIcon } as const satisfies Record<
  RowKind,
  typeof BabyIcon
>
