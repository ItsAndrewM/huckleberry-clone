import { useCallback } from "react"

export const usePublishedHeight = (name: string) =>
  useCallback(
    (element: HTMLElement | null) => {
      if (element === null) return undefined
      const property = `--${name}`
      const root = document.documentElement
      const observer = new ResizeObserver(([entry]) => {
        const height = entry?.borderBoxSize[0]?.blockSize
        if (height !== undefined) root.style.setProperty(property, `${height}px`)
      })
      observer.observe(element, { box: "border-box" })
      return () => {
        observer.disconnect()
        root.style.removeProperty(property)
      }
    },
    [name],
  )
