import { useNavigate } from "@tanstack/react-router"
import { ToggleGroup, ToggleGroupItem } from "../../components/ui/toggle-group.tsx"
import type { HistorySearch } from "./history-date.ts"
import { hiddenExcept, hiddenIn, hideOf, SHOWN_KINDS, type ShownKind } from "./history-kinds.ts"

const CHIPS = [
  { kind: "feeds", label: "Feeds" },
  { kind: "diapers", label: "Diapers" },
  { kind: "growth", label: "Growth" },
] as const satisfies ReadonlyArray<{ kind: ShownKind; label: string }>

export const KindChips = ({ search }: { readonly search: HistorySearch }) => {
  const navigate = useNavigate()
  const hidden = hiddenIn(search.hide)
  return (
    <ToggleGroup
      multiple
      aria-label="Show"
      value={SHOWN_KINDS.filter((kind) => !hidden.has(kind))}
      onValueChange={(shown) => {
        void navigate({ to: "/history", search: { ...search, hide: hideOf(hiddenExcept(shown)) }, replace: true })
      }}
      variant="outline"
      size="lg"
    >
      {CHIPS.map(({ kind, label }) => (
        <ToggleGroupItem key={kind} value={kind}>
          {label}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  )
}
