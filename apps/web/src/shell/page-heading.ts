export const CONTROL =
  "a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex='-1'])"

export const readyForFocus = (target: HTMLElement) => {
  if (!target.matches(CONTROL)) target.tabIndex = -1
  return target
}

export const pageHeading = () => document.querySelector<HTMLElement>("main h1")

export const focusPageHeading = () => {
  const heading = pageHeading()
  if (heading !== null) readyForFocus(heading).focus()
}
