import { attempt, type BrowserStorage } from "../storage.ts"

export const THEMES = ["system", "light", "dark"] as const
export type Theme = (typeof THEMES)[number]

export const THEME_KEY = "bt.theme"

type ThemeRoot = Pick<HTMLElement, "dataset">

const isChosen = (value: string | null): value is "light" | "dark" => value === "light" || value === "dark"

export const storedTheme = (openStorage: () => BrowserStorage): Theme => {
  const stored = attempt(() => openStorage().getItem(THEME_KEY), null)
  return isChosen(stored) ? stored : "system"
}

export const applyTheme = (theme: Theme, openStorage: () => BrowserStorage, root: ThemeRoot) => {
  if (theme === "system") {
    delete root.dataset.theme
    attempt(() => openStorage().removeItem(THEME_KEY), undefined)
    return
  }
  root.dataset.theme = theme
  attempt(() => openStorage().setItem(THEME_KEY, theme), undefined)
}
