const MOST_LANES = 6
const TEN = 10

const inTensAndOnes = (prefix: string, steps: number) =>
  `${prefix} ${prefix}-tens-${Math.floor(steps / TEN)} ${prefix}-ones-${steps % TEN}`

export const atStep = (step: number) => inTensAndOnes("cal-at", step)

export const stepsTall = (steps: number) => inTensAndOnes("cal-tall", steps)

export const inLane = (lane: number, lanes: number) =>
  `cal-lanes-${Math.min(lanes, MOST_LANES)} cal-lane-${Math.min(lane, MOST_LANES - 1)}`
