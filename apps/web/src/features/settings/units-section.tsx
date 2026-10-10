import type { Household } from "@bt/contracts"
import { SettingsSection } from "./settings-section.tsx"
import { UnitPicker } from "./unit-picker.tsx"
import { UNIT_ROWS } from "./units.ts"

export const UnitsSection = ({ household }: { readonly household: Household }) => (
  <SettingsSection titleId="units-label" title="Units" hint="Both phones show amounts in these units.">
    {UNIT_ROWS.map((row) => (
      <UnitPicker key={row.kind} row={row} household={household} />
    ))}
  </SettingsSection>
)
