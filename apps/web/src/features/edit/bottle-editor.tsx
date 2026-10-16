import type { VolumeUnit } from "@bt/contracts"
import { WhenField } from "../../sheets/when-field.tsx"
import { AmountField } from "../feed/amount-field.tsx"
import type { BottleFields } from "./feed-draft.ts"
import type { FaultLinks } from "./feed-faults.ts"
import { PartGroup } from "./part-group.tsx"

interface BottleEditorProps {
  readonly name: string
  readonly fields: BottleFields
  readonly links: FaultLinks
  readonly unit: VolumeUnit
  readonly zone: string
  readonly now: number
  readonly onChange: (fields: BottleFields) => void
  readonly onRemove: () => void
}

export const BottleEditor = ({ name, fields, links, unit, zone, now, onChange, onRemove }: BottleEditorProps) => (
  <PartGroup name={name} onRemove={onRemove}>
    <WhenField
      label="Given"
      when={fields.at}
      onChange={(at) => onChange({ ...fields, at })}
      zone={zone}
      now={now}
      describedBy={links.time}
    />
    <AmountField
      label="Breast milk"
      ml={fields.breastMilkMl}
      unit={unit}
      onChange={(breastMilkMl) => onChange({ ...fields, breastMilkMl })}
      describedBy={links.amounts}
    />
    <AmountField
      label="Formula"
      ml={fields.formulaMl}
      unit={unit}
      onChange={(formulaMl) => onChange({ ...fields, formulaMl })}
      describedBy={links.amounts}
    />
  </PartGroup>
)
