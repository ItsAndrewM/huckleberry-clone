export interface Extent {
  readonly top: number
  readonly height: number
}

export interface Laned {
  readonly lane: number
  readonly lanes: number
}

const freeLane = (ends: ReadonlyArray<number>, top: number) => {
  const free = ends.findIndex((end) => end <= top)
  return free === -1 ? ends.length : free
}

const overlapGroups = <T extends Extent>(items: ReadonlyArray<T>): ReadonlyArray<ReadonlyArray<T>> => {
  const groups: T[][] = []
  let group: T[] = []
  let reach = Number.NEGATIVE_INFINITY
  for (const item of items) {
    if (item.top >= reach) {
      group = []
      groups.push(group)
    }
    group.push(item)
    reach = Math.max(reach, item.top + item.height)
  }
  return groups
}

export const placeInLanes = <T extends Extent>(items: ReadonlyArray<T>): ReadonlyArray<T & Laned> => {
  const ends: number[] = []
  const laned = items.map((item) => {
    const lane = freeLane(ends, item.top)
    ends[lane] = item.top + item.height
    return { ...item, lane }
  })
  return overlapGroups(laned).flatMap((group) => {
    const lanes = Math.max(...group.map(({ lane }) => lane)) + 1
    return group.map((item) => ({ ...item, lanes }))
  })
}
