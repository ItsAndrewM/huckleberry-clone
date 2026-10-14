import { useState } from "react"

export interface Opening<A> {
  readonly opened: number
  readonly value: A
}

export const openingAt = <A>(held: Opening<A>, opened: number, value: A): Opening<A> =>
  held.opened === opened ? held : { opened, value }

export const useOpening = <A>(opened: number, value: A): A => {
  const [held, setHeld] = useState<Opening<A>>({ opened, value })
  const now = openingAt(held, opened, value)
  if (now !== held) setHeld(now)
  return now.value
}
