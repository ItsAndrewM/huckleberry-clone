import type { VolumeUnit } from "@bt/contracts"
import { flOzFromMl, roundTo } from "@bt/domain"

const MINUTE_S = 60
const HOUR_MIN = 60

export const formatMinutes = (seconds: number) => {
  if (seconds > 0 && seconds < MINUTE_S) return "<1 min"
  const minutes = Math.floor(seconds / MINUTE_S)
  const hours = Math.floor(minutes / HOUR_MIN)
  const rest = minutes % HOUR_MIN
  if (hours === 0) return `${minutes} min`
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`
}

export const formatSince = (seconds: number) => (seconds < MINUTE_S ? "Just now" : formatMinutes(seconds))

export const formatVolume = (ml: number, unit: VolumeUnit) =>
  unit === "ml" ? `${Math.round(ml)} mL` : `${roundTo(flOzFromMl(ml), 1).toFixed(1)} fl oz`

export const presentParts = (parts: ReadonlyArray<readonly [number, string]>) =>
  parts.filter(([amount]) => amount > 0).map(([, text]) => text)
