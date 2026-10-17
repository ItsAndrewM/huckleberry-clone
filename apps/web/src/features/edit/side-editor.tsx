import { ToggleGroup, ToggleGroupItem } from "../../components/ui/toggle-group.tsx"
import { WhenField } from "../../sheets/when-field.tsx"
import { SIDE_NAMES, SIDES } from "../../sides.ts"
import { MinutesField } from "../feed/minutes-field.tsx"
import type { SideFields } from "./feed-draft.ts"
import type { FaultLinks } from "./feed-faults.ts"
import { PartGroup } from "./part-group.tsx"

interface SideEditorProps {
  readonly name: string
  readonly fields: SideFields
  readonly links: FaultLinks
  readonly zone: string
  readonly now: number
  readonly onChange: (fields: SideFields) => void
  readonly onRemove: () => void
}

export const SideEditor = ({ name, fields, links, zone, now, onChange, onRemove }: SideEditorProps) => (
  <PartGroup name={name} onRemove={onRemove}>
    <ToggleGroup
      aria-label="Which side"
      value={[fields.side]}
      onValueChange={([next]) => {
        const side = SIDES.find((candidate) => candidate === next)
        if (side !== undefined) onChange({ ...fields, side })
      }}
      variant="outline"
      size="lg"
    >
      {SIDES.map((side) => (
        <ToggleGroupItem key={side} value={side}>
          {SIDE_NAMES[side]}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
    <WhenField
      label="Started"
      when={fields.start}
      onChange={(start) => onChange({ ...fields, start })}
      zone={zone}
      now={now}
      describedBy={links.time}
    />
    <MinutesField
      label="Minutes"
      minutes={fields.minutes}
      onChange={(minutes) => onChange({ ...fields, minutes })}
      describedBy={links.minutes}
    />
  </PartGroup>
)
