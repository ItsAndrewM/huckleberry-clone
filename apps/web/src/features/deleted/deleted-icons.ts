import { RulerIcon } from "lucide-react"
import { KIND_ICONS } from "../today/kind-icons.ts"
import type { DeletedIcon } from "./deleted-rows.ts"

export const DELETED_ICONS = { ...KIND_ICONS, measurement: RulerIcon } as const satisfies Record<
  DeletedIcon,
  typeof RulerIcon
>
