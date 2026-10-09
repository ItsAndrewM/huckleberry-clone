import { useState } from "react"
import { applyTheme, storedTheme, type Theme } from "./theme.ts"

export const useTheme = () => {
  const [theme, setTheme] = useState<Theme>(() => storedTheme(localStorage))
  const chooseTheme = (next: Theme) => {
    applyTheme(next, localStorage, document.documentElement)
    setTheme(next)
  }
  return { theme, chooseTheme }
}
