import type { Household } from "@bt/contracts"
import { useSaveHousehold } from "../../api/hooks.ts"
import { NativeSelect, NativeSelectOptGroup, NativeSelectOption } from "../../components/ui/native-select.tsx"
import { SaveFailure } from "./save-failure.tsx"
import { SettingsSection } from "./settings-section.tsx"
import { timeZoneGroups } from "./time-zones.ts"

export const TimeZoneSection = ({ household }: { readonly household: Household }) => {
  const save = useSaveHousehold()
  const zone = save.isPending ? (save.variables.change.timeZone ?? household.timeZone) : household.timeZone
  const groups = timeZoneGroups(Intl.supportedValuesOf("timeZone"), household.timeZone)
  return (
    <SettingsSection
      titleId="time-zone-label"
      title="Time zone"
      hint="Each day runs from midnight to midnight here, on both phones."
    >
      <NativeSelect
        aria-labelledby="time-zone-label"
        value={zone}
        onChange={(event) => save.mutate({ household, change: { timeZone: event.target.value } })}
        className="w-full"
      >
        {groups.map(({ region, zones }) => (
          <NativeSelectOptGroup key={region} label={region}>
            {zones.map(({ value, label }) => (
              <NativeSelectOption key={value} value={value}>
                {label}
              </NativeSelectOption>
            ))}
          </NativeSelectOptGroup>
        ))}
      </NativeSelect>
      <SaveFailure error={save.error} />
    </SettingsSection>
  )
}
