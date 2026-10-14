import { useNavigate } from "@tanstack/react-router"
import { ToggleGroup, ToggleGroupItem } from "../../components/ui/toggle-group.tsx"
import type { HistorySearch } from "./history-date.ts"
import { hiddenExcept, hiddenIn, hideOf, KIND_LABELS, SHOWN_KINDS } from "./history-kinds.ts"

export const KindChips = ({ search }: { readonly search: HistorySearch }) => {
  const navigate = useNavigate()
  const hidden = hiddenIn(search.hide)
  return (
    <ToggleGroup
      multiple
      aria-label="Show"
      value={SHOWN_KINDS.filter((kind) => !hidden.has(kind))}
      onValueChange={(shown) => {
        void navigate({
          to: "/history",
          search: { ...search, hide: hideOf(hiddenExcept(shown)) },
          replace: true,
          resetScroll: false,
        })
      }}
      variant="outline"
      size="lg"
    >
      {SHOWN_KINDS.map((kind) => (
        <ToggleGroupItem key={kind} value={kind}>
          {KIND_LABELS[kind]}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  )
}
