import type { KeptOn } from "./failure.ts"
import type { Sending } from "./sending.ts"
import { isEntry } from "./sheets-state.ts"

export const keptOnFor = (sending: Sending, keeping: boolean): KeptOn => (isEntry(sending) && keeping ? "phone" : "app")
