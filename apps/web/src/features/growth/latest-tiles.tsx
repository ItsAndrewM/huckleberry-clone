import { ToggleGroup, ToggleGroupItem } from "../../components/ui/toggle-group.tsx"
import type { LatestTile } from "./cards.ts"
import { GROWTH_METRICS, type GrowthMetricInfo } from "./metrics.ts"

interface LatestTilesProps {
  readonly tiles: ReadonlyArray<LatestTile>
  readonly info: GrowthMetricInfo
  readonly onChange: (info: GrowthMetricInfo) => void
}

const TileText = ({ tile: { info, latest } }: { readonly tile: LatestTile }) => (
  <>
    <span className="text-sm font-medium">{info.label}</span>
    {latest === null ? (
      <span className="text-sm text-muted-foreground">None yet</span>
    ) : (
      <>
        <span className="text-base font-semibold tabular-nums">{latest.value}</span>
        <span className="text-xs tabular-nums">{latest.percentile}</span>
        <span className="text-xs text-muted-foreground">{latest.measuredOn}</span>
      </>
    )}
  </>
)

export const LatestTiles = ({ tiles, info, onChange }: LatestTilesProps) => {
  const choose = ([next]: ReadonlyArray<string>) => {
    const picked = GROWTH_METRICS.find(({ metric }) => metric === next)
    if (picked !== undefined) onChange(picked)
  }
  return (
    <ToggleGroup
      aria-label="Measurement"
      value={[info.metric]}
      onValueChange={choose}
      variant="outline"
      className="grid w-full grid-cols-3 items-stretch gap-2"
    >
      {tiles.map((tile) => (
        <ToggleGroupItem
          key={tile.info.metric}
          value={tile.info.metric}
          aria-label={tile.name}
          className="h-auto min-h-24 min-w-0 flex-col items-start justify-start gap-0.5 rounded-xl p-3 text-left whitespace-normal"
        >
          <TileText tile={tile} />
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  )
}
