import { useEffect } from "react"
import { type Draft, isFresh } from "./drafts.ts"
import type { Sending } from "./sending.ts"

let resumed = false

export const useResumedDraft = (draft: Draft | null, send: (sending: Sending) => void) => {
  useEffect(
    function resumeDraft() {
      if (resumed || draft === null || !isFresh(draft, Date.now())) return
      resumed = true
      send(draft.sending)
    },
    [draft, send],
  )
}
