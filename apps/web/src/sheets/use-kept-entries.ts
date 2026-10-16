import { useRef, useState } from "react"
import { actionIdOf } from "./held.ts"
import {
  type KeptEntry,
  keptAfterFailure,
  keptAfterSend,
  keptStorage,
  keptWithHeld,
  keptWithout,
  writeKept,
} from "./kept.ts"
import type { Restored } from "./restored.ts"
import type { Failed, Sending } from "./sending.ts"

export const useKeptEntries = ({ kept, unreadable }: Restored) => {
  const entries = useRef(kept)
  const [keeping, setKeeping] = useState(true)
  const [store] = useState(() => (next: ReadonlyArray<KeptEntry>) => {
    if (next === entries.current) return
    entries.current = next
    setKeeping(writeKept(keptStorage, next, unreadable))
  })
  const [follow] = useState(
    () => (held: ReadonlyArray<Failed>, onTheirWay: ReadonlyArray<Sending>) =>
      store(keptWithHeld(entries.current, held, onTheirWay, Date.now())),
  )
  return {
    keeping,
    sending: (sending: Sending) => store(keptAfterSend(entries.current, sending, Date.now())),
    failed: (failed: Failed) => store(keptAfterFailure(entries.current, failed, Date.now())),
    done: (sending: Sending) => store(keptWithout(entries.current, actionIdOf(sending))),
    follow,
  }
}
