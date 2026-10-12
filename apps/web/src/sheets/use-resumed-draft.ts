import { useEffect } from "react"
import type { Sending } from "./sending.ts"

let resumed = false

export const useResumedDraft = (resend: Sending | null, send: (sending: Sending) => void) => {
  useEffect(
    function resumeDraft() {
      if (resumed || resend === null) return
      resumed = true
      send(resend)
    },
    [resend, send],
  )
}
