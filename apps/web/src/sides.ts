import type { Side } from "@bt/contracts"

export const SIDES = ["left", "right"] as const satisfies ReadonlyArray<Side>

export const SIDE_NAMES = { left: "Left", right: "Right" } as const satisfies Record<Side, string>

export const OTHER_SIDE = { left: "right", right: "left" } as const satisfies Record<Side, Side>
