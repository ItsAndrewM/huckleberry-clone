import { useGrowth, useMe } from "../../api/hooks.ts"
import { retryOf } from "../../api/retry.ts"
import { NotLoaded } from "../../shell/not-loaded.tsx"
import { Page } from "../../shell/page.tsx"
import { AddMeasurement } from "./add-measurement.tsx"
import { GrowthView } from "./growth-view.tsx"

export const GrowthPage = () => {
  const meQuery = useMe()
  const growthQuery = useGrowth()
  const { data: me } = meQuery
  const { data: growth } = growthQuery
  const loaded = me !== undefined && growth !== undefined
  return (
    <Page title="Growth" subtitle={me?.child.name} action={<AddMeasurement ready={loaded} />}>
      {me === undefined || growth === undefined ? (
        <NotLoaded
          failed={meQuery.isError || growthQuery.isError}
          message="Growth couldn't be loaded."
          retry={retryOf(meQuery, growthQuery)}
        />
      ) : (
        <GrowthView me={me} measurements={growth.measurements} />
      )}
    </Page>
  )
}
