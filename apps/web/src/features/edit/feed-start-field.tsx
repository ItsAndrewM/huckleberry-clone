import { DrawerDescription } from "../../components/ui/drawer.tsx"
import { WhenField } from "../../sheets/when-field.tsx"
import { type When, whenAt } from "../../sheets/when.ts"
import { moveText } from "./feed-move.ts"

interface FeedStartFieldProps {
  readonly start: number
  readonly moved: number
  readonly zone: string
  readonly now: number
  readonly onMove: (when: When) => void
}

export const FeedStartField = ({ start, moved, zone, now, onMove }: FeedStartFieldProps) => {
  const preview = moveText(moved)
  return (
    <div className="flex flex-col gap-2">
      <WhenField label="Feed started" when={whenAt(start, zone)} onChange={onMove} zone={zone} now={now} />
      {preview === null ? null : <DrawerDescription>{preview}</DrawerDescription>}
    </div>
  )
}
