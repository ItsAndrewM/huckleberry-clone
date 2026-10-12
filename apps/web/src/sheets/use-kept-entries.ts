import { useRef, useState } from "react"
import { actionIdOf } from "./held.ts"
import { type KeptEntry, keptAfterFailure, keptAfterSend, keptStorage, keptWithout, writeKept } from "./kept.ts"
import type { Restored } from "./restored.ts"
import type { Failed, Sending } from "./sending.ts"

export const useKeptEntries = ({ kept, unreadable }: Restored) => {
  const entries = useRef(kept)
  const [keeping, setKeeping] = useState(true)
  const store = (next: ReadonlyArray<KeptEntry>) => {
    if (next === entries.current) return
    entries.current = next
    setKeeping(writeKept(keptStorage, next, unreadable))
  }
  return {
    keeping,
    sending: (sending: Sending) => store(keptAfterSend(entries.current, sending, Date.now())),
    failed: (failed: Failed) => store(keptAfterFailure(entries.current, failed, Date.now())),
    done: (sending: Sending) => store(keptWithout(entries.current, actionIdOf(sending))),
  }
}
