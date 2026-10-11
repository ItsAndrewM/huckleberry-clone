import type { Totals, VolumeUnit } from "@bt/contracts"
import { useState } from "react"
import type { Retry } from "../../api/retry.ts"
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "../../components/ui/card.tsx"
import { NotLoaded } from "../../shell/not-loaded.tsx"
import { Parts } from "./parts.tsx"
import { type Period, PeriodSwitch } from "./period-switch.tsx"
import { totalsRows } from "./totals-rows.ts"

export interface Last24h {
  readonly totals: Totals | undefined
  readonly failed: boolean
  readonly retry: Retry
}

interface TotalsCardProps {
  readonly today: Totals
  readonly last24h: Last24h
  readonly volume: VolumeUnit
}

export const TotalsCard = ({ today, last24h, volume }: TotalsCardProps) => {
  const [period, setPeriod] = useState<Period>("today")
  const totals = period === "today" ? today : last24h.totals
  return (
    <Card>
      <CardHeader className="items-center">
        <CardTitle className="row-span-2 text-sm text-muted-foreground">Totals</CardTitle>
        <CardAction>
          <PeriodSwitch period={period} onChange={setPeriod} />
        </CardAction>
      </CardHeader>
      <CardContent>
        {totals === undefined ? (
          <NotLoaded failed={last24h.failed} message="The last 24 hours couldn't be loaded." retry={last24h.retry} />
        ) : (
          <dl className="flex flex-col divide-y">
            {totalsRows(totals, volume).map(({ label, value, detail }) => (
              <div
                key={label}
                className="flex flex-wrap items-baseline justify-between gap-x-4 py-2.5 first:pt-0 last:pb-0"
              >
                <dt className="text-muted-foreground">{label}</dt>
                <dd className="text-base font-medium tabular-nums">{value}</dd>
                {detail.length === 0 ? null : (
                  <dd className="w-full text-right text-xs tabular-nums text-muted-foreground">
                    <Parts parts={detail} />
                  </dd>
                )}
              </div>
            ))}
          </dl>
        )}
      </CardContent>
    </Card>
  )
}
