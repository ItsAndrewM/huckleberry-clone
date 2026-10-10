import { useState } from "react"
import { applyTheme, storedTheme, type Theme } from "./theme.ts"

const browserStorage = () => localStorage

export const useTheme = () => {
  const [theme, setTheme] = useState<Theme>(() => storedTheme(browserStorage))
  const chooseTheme = (next: Theme) => {
    applyTheme(next, browserStorage, document.documentElement)
    setTheme(next)
  }
  return { theme, chooseTheme }
}
