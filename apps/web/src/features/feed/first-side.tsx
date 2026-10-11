import type { Side } from "@bt/contracts"
import { ToggleGroup, ToggleGroupItem } from "../../components/ui/toggle-group.tsx"
import { SIDE_NAMES, SIDES } from "../../sides.ts"

interface FirstSideProps {
  readonly side: Side
  readonly onChange: (side: Side) => void
}

export const FirstSide = ({ side, onChange }: FirstSideProps) => (
  <div className="flex items-center justify-between gap-3">
    <span id="first-side-label" className="text-base font-medium">
      First side
    </span>
    <ToggleGroup
      aria-labelledby="first-side-label"
      value={[side]}
      onValueChange={([next]) => {
        const picked = SIDES.find((candidate) => candidate === next)
        if (picked !== undefined) onChange(picked)
      }}
      variant="outline"
      size="lg"
    >
      {SIDES.map((candidate) => (
        <ToggleGroupItem key={candidate} value={candidate}>
          {SIDE_NAMES[candidate]}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  </div>
)
