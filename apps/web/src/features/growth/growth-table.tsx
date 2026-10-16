import { ShowAsTable } from "../../components/show-as-table.tsx"
import type { GrowthRow } from "./chart-model.ts"
import type { GrowthMetricInfo } from "./metrics.ts"
import { SpokenAs } from "./spoken-text.tsx"

interface GrowthTableProps {
  readonly info: GrowthMetricInfo
  readonly rows: ReadonlyArray<GrowthRow>
}

export const GrowthTable = ({ info, rows }: GrowthTableProps) => (
  <ShowAsTable>
    <table className="w-full text-left text-sm tabular-nums">
      <caption className="sr-only">{`${info.name}, newest first`}</caption>
      <thead className="text-muted-foreground">
        <tr>
          <th scope="col" className="py-2 pr-3 font-medium">
            Date
          </th>
          <th scope="col" className="py-2 pr-3 font-medium">
            Age
          </th>
          <th scope="col" className="py-2 pr-3 font-medium">
            {info.name}
          </th>
          <th scope="col" className="py-2 font-medium">
            Percentile
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.id} className="border-t">
            <th scope="row" className="py-2 pr-3 font-normal">
              {row.measuredOn}
            </th>
            <td className="py-2 pr-3">
              <SpokenAs shown={row.age} said={row.ageWords} />
            </td>
            <td className="py-2 pr-3">{row.value}</td>
            <td className="py-2">{row.percentile}</td>
          </tr>
        ))}
      </tbody>
    </table>
  </ShowAsTable>
)
