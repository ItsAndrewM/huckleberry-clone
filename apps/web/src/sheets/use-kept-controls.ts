import { useEffect } from "react"
import type { Failed, Sending } from "./sending.ts"

type Follow = (held: ReadonlyArray<Failed>, onTheirWay: ReadonlyArray<Sending>) => void

export const useKeptControls = (follow: Follow, held: ReadonlyArray<Failed>, onTheirWay: ReadonlyArray<Sending>) => {
  useEffect(
    function keepHeldControls() {
      follow(held, onTheirWay)
    },
    [follow, held, onTheirWay],
  )
}
