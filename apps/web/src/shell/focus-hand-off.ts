import { handFocusHome, homeOf } from "../sheets/focus-home.ts"
import { CONTROL } from "./page-heading.ts"

const firstControlOf = (view: HTMLElement) => (view.matches(CONTROL) ? view : view.querySelector<HTMLElement>(CONTROL))

export const focusFollowsSwap = () => {
  let leftWithFocus = false
  return (view: HTMLElement | null) => {
    if (view === null) return undefined
    if (leftWithFocus && !view.contains(document.activeElement)) firstControlOf(view)?.focus()
    leftWithFocus = false
    return () => {
      leftWithFocus = view.contains(document.activeElement)
    }
  }
}

export const focusHomeOnLeave = (control: HTMLElement | null) => {
  if (control === null) return undefined
  return () => {
    if (control.contains(document.activeElement)) handFocusHome(homeOf(control))
  }
}
