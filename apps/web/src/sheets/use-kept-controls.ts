import { useEffect } from "react"
import type { Failed, Sending } from "./sending.ts"

type Keep = (held: ReadonlyArray<Failed>, busy: Sending | null) => void

export const useKeptControls = (keep: Keep, held: ReadonlyArray<Failed>, busy: Sending | null) => {
  useEffect(
    function keepHeldControls() {
      keep(held, busy)
    },
    [keep, held, busy],
  )
}
