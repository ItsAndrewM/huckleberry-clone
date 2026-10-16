import { type FocusHome, handFocusHome, homeOf, NO_HOME } from "../sheets/focus-home.ts"
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

const leavingWithFocus = (homeFor: (control: HTMLElement) => FocusHome) => (control: HTMLElement | null) => {
  if (control === null) return undefined
  return () => {
    if (control.contains(document.activeElement)) handFocusHome(homeFor(control))
  }
}

export const focusHomeOnLeave = leavingWithFocus(homeOf)

export const focusOpenerOnLeave = (openerId: string) =>
  leavingWithFocus(() => ({ ...NO_HOME, opener: document.getElementById(openerId) }))
