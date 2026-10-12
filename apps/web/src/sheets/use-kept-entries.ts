import { useRef, useState } from "react"
import { actionIdOf, settlesWithoutAsking } from "./held.ts"
import { type KeptEntry, keptFailed, keptSending, keptStorage, keptWithout, writeKept } from "./kept.ts"
import type { Failed, Sending } from "./sending.ts"
import { isEntry } from "./sheets-state.ts"

export const useKeptEntries = (restored: ReadonlyArray<KeptEntry>) => {
  const entries = useRef(restored)
  const [keeping, setKeeping] = useState(true)
  const store = (next: ReadonlyArray<KeptEntry>) => {
    if (next === entries.current) return
    entries.current = next
    setKeeping(writeKept(keptStorage, next))
  }
  return {
    keeping,
    sending: (sending: Sending) => {
      if (isEntry(sending)) store(keptSending(entries.current, sending, Date.now()))
    },
    failed: ({ sending, error }: Failed) => {
      if (!isEntry(sending)) return
      const settled = settlesWithoutAsking(error)
      store(
        settled ? keptWithout(entries.current, actionIdOf(sending)) : keptFailed(entries.current, sending, Date.now()),
      )
    },
    done: (sending: Sending) => store(keptWithout(entries.current, actionIdOf(sending))),
  }
}
