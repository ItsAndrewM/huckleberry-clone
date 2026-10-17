import { useEffect, useRef } from "react"
import { CONTROL } from "../shell/page-heading.ts"

export const useLastPressed = () => {
  const pressed = useRef<Element | null>(null)
  useEffect(() => {
    const remember = (event: Event) => {
      pressed.current = event.target instanceof Element ? event.target.closest(CONTROL) : null
      setTimeout(() => {
        pressed.current = null
      }, 0)
    }
    document.addEventListener("click", remember, true)
    return () => document.removeEventListener("click", remember, true)
  }, [])
  return pressed
}
