import type { KeptOn } from "./failure.ts"
import { isEntry, type Sending } from "./sending.ts"

export const keptOnFor = (sending: Sending, keeping: boolean): KeptOn => (isEntry(sending) && keeping ? "phone" : "app")
