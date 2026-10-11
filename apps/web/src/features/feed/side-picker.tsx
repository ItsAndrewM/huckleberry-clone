import type { Side } from "@bt/contracts"
import { Button } from "../../components/ui/button.tsx"
import { SIDE_NAMES } from "./nursing-state.ts"

interface SidePickerProps {
  readonly label: string
  readonly lastSide: Side | null
  readonly disabled: boolean
  readonly onPick: (side: Side) => void
}

const SIDES = ["left", "right"] as const satisfies ReadonlyArray<Side>

export const SidePicker = ({ label, lastSide, disabled, onPick }: SidePickerProps) => (
  <fieldset className="flex flex-col gap-2">
    <legend className="mb-2 text-sm font-medium">{label}</legend>
    <div className="grid grid-cols-2 gap-2">
      {SIDES.map((side) => (
        <Button
          key={side}
          variant="secondary"
          size="lg"
          className="h-16 flex-col gap-0.5 text-lg"
          disabled={disabled}
          onClick={() => onPick(side)}
        >
          {SIDE_NAMES[side]}
          {side === lastSide ? <span className="text-xs font-normal text-muted-foreground"> Last</span> : null}
        </Button>
      ))}
    </div>
  </fieldset>
)
