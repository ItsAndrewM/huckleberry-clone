import { useState } from "react"

export const lastOpen = <A>(shown: A, open: boolean, value: A): A => (open ? value : shown)

export const useLastOpen = <A>(open: boolean, value: A): A => {
  const [shown, setShown] = useState(value)
  const now = lastOpen(shown, open, value)
  if (now !== shown) setShown(now)
  return now
}
