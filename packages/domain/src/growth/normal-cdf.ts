const LN_SQRT_TWO_PI = 0.9189385332046728
const NEGLIGIBLE_TAIL_Z = 8

const marsagliaSeries = (z: number): number => {
  const square = z * z
  let term = z
  let sum = z
  for (let k = 3; Math.abs(term) > Number.EPSILON * Math.abs(sum); k += 2) {
    term *= square / k
    sum += term
  }
  return sum
}

export const percentile = (z: number): number => {
  if (Number.isNaN(z)) return Number.NaN
  if (z <= -NEGLIGIBLE_TAIL_Z) return 0
  if (z >= NEGLIGIBLE_TAIL_Z) return 100
  return Math.min(100, Math.max(0, 100 * (0.5 + marsagliaSeries(z) * Math.exp(-0.5 * z * z - LN_SQRT_TWO_PI))))
}
