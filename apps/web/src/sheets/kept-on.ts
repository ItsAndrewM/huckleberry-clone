import type { KeptOn } from "./failure.ts"
import { isKept } from "./kept.ts"
import type { Sending } from "./sending.ts"

export const keptOnFor = (sending: Sending, keeping: boolean): KeptOn => (isKept(sending) && keeping ? "phone" : "app")
