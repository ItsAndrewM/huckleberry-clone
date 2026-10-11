import { useGrowth, useMe } from "../../api/hooks.ts"
import { Page } from "../../shell/page.tsx"
import { AddMeasurement } from "./add-measurement.tsx"
import { GrowthView } from "./growth-view.tsx"

export const GrowthPage = () => {
  const { data: me, isError: meFailed } = useMe()
  const { data: growth, isError } = useGrowth()
  const loaded = me !== undefined && growth !== undefined
  return (
    <Page title="Growth" subtitle={me?.child.name} action={<AddMeasurement ready={loaded} />}>
      {me === undefined || growth === undefined ? (
        <output className="text-muted-foreground">
          {isError || meFailed ? "Growth couldn't be loaded." : "Loading…"}
        </output>
      ) : (
        <GrowthView me={me} measurements={growth.measurements} />
      )}
    </Page>
  )
}
