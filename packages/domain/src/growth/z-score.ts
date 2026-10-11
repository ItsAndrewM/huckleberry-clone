import type { Lms } from "./who-lms.ts"

const LAST_SD_ON_THE_CURVE = 3

const boxCoxZ = ({ L, M, S }: Lms, value: number): number =>
  L === 0 ? Math.log(value / M) / S : ((value / M) ** L - 1) / (L * S)

export const valueAtZ = ({ L, M, S }: Lms, z: number): number =>
  L === 0 ? M * Math.exp(S * z) : M * (1 + L * S * z) ** (1 / L)

export const zScoreLMS = (value: number, lms: Lms): number => {
  if (!(value > 0)) return Number.NaN
  const z = boxCoxZ(lms, value)
  if (Math.abs(z) <= LAST_SD_ON_THE_CURVE) return z
  const side = Math.sign(z)
  const outer = valueAtZ(lms, side * LAST_SD_ON_THE_CURVE)
  const inner = valueAtZ(lms, side * (LAST_SD_ON_THE_CURVE - 1))
  return side * LAST_SD_ON_THE_CURVE + (value - outer) / (side * (outer - inner))
}
