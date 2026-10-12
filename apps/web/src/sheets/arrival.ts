const ARRIVAL_MS = 500

export const holdTapsWhileArriving = (node: HTMLDivElement) => {
  node.setAttribute("data-arriving", "")
  const timer = setTimeout(() => node.removeAttribute("data-arriving"), ARRIVAL_MS)
  return () => clearTimeout(timer)
}
