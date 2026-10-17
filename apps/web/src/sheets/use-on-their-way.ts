import { useState } from "react"
import type { Sending } from "./sending.ts"

export const useOnTheirWay = (resend: Sending | null) => {
  const [onTheirWay, setOnTheirWay] = useState<ReadonlyArray<Sending>>(() => (resend === null ? [] : [resend]))
  return {
    onTheirWay,
    left: (sending: Sending) =>
      setOnTheirWay((current) => (current.includes(sending) ? current : [...current, sending])),
    settled: (sending: Sending) => setOnTheirWay((current) => current.filter((sent) => sent !== sending)),
  }
}
