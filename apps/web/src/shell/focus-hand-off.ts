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

const SHEET = '[data-slot="drawer-popup"]'

const isUsableIn = (sheet: Element | null, element: Element | null): element is HTMLElement =>
  element instanceof HTMLElement && element.isConnected && element.matches(CONTROL) && sheet?.contains(element) === true

const isLost = (sheet: Element | null) => [null, document.body, sheet].includes(document.activeElement)

const focusBack = (note: HTMLElement, sheet: Element | null, from: Element | null) =>
  queueMicrotask(() => {
    if (note.isConnected || !isLost(sheet)) return
    const target = isUsableIn(sheet, from) ? from : sheet?.querySelector<HTMLElement>(CONTROL)
    target?.focus()
  })

export const noteTakesFocus = (note: HTMLElement | null) => {
  if (note === null) return undefined
  const from = document.activeElement
  note.focus()
  return () => {
    if (note.contains(document.activeElement)) focusBack(note, note.closest(SHEET), from)
  }
}

export const focusOpenerOnLeave = (openerId: string) =>
  leavingWithFocus(() => ({ ...NO_HOME, opener: document.getElementById(openerId) }))
