export interface ZoneOption {
  readonly value: string
  readonly label: string
}

export interface ZoneGroup {
  readonly region: string
  readonly zones: ReadonlyArray<ZoneOption>
}

const OTHER_REGION = "Other"

const placeOf = (zone: string) => {
  const [region = OTHER_REGION, ...place] = zone.split("/")
  if (place.length === 0) return { region: OTHER_REGION, value: zone, label: zone.replaceAll("_", " ") }
  return { region, value: zone, label: place.join(" / ").replaceAll("_", " ") }
}

export const timeZoneGroups = (zones: ReadonlyArray<string>, current: string): ZoneGroup[] => {
  const places = [...new Set([...zones, current])].map(placeOf)
  const regions = [...new Set(places.map(({ region }) => region))].toSorted()
  return regions.map((region) => ({
    region,
    zones: places
      .filter((place) => place.region === region)
      .map(({ value, label }) => ({ value, label }))
      .toSorted((a, b) => a.label.localeCompare(b.label)),
  }))
}
