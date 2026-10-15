import { CONTROL, pageHeading, readyForFocus } from "../shell/page-heading.ts"

export interface FocusHome {
  readonly opener: HTMLElement | null
  readonly row: HTMLElement | null
  readonly next: HTMLElement | null
  readonly previous: HTMLElement | null
}

export const NO_HOME: FocusHome = { opener: null, row: null, next: null, previous: null }

const asHtml = (element: Element | null | undefined) => (element instanceof HTMLElement ? element : null)

export const homeOf = (opener: Element | null): FocusHome => {
  const row = asHtml(opener?.closest("li"))
  return {
    opener: asHtml(opener),
    row,
    next: asHtml(row?.nextElementSibling),
    previous: asHtml(row?.previousElementSibling),
  }
}

const isUsable = (element: HTMLElement | null): element is HTMLElement =>
  element !== null && element.isConnected && element.matches(CONTROL)

const landingIn = (row: HTMLElement) => row.querySelector<HTMLElement>(CONTROL) ?? row

const homeTarget = ({ opener, row, next, previous }: FocusHome) => {
  if (isUsable(opener)) return opener
  const standIn = [row, next, previous].find((one) => one?.isConnected === true)
  return standIn === undefined || standIn === null ? pageHeading() : landingIn(standIn)
}

export const focusTarget = (home: FocusHome) => {
  const target = homeTarget(home)
  return target === null ? true : readyForFocus(target)
}
