export const THEMES = ["system", "light", "dark"] as const
export type Theme = (typeof THEMES)[number]

export const THEME_KEY = "bt.theme"

type ThemeStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">
type ThemeRoot = Pick<HTMLElement, "dataset">

const isChosen = (value: string | null): value is "light" | "dark" => value === "light" || value === "dark"

export const storedTheme = (storage: ThemeStorage): Theme => {
  const stored = storage.getItem(THEME_KEY)
  return isChosen(stored) ? stored : "system"
}

export const applyTheme = (theme: Theme, storage: ThemeStorage, root: ThemeRoot) => {
  if (theme === "system") {
    storage.removeItem(THEME_KEY)
    delete root.dataset.theme
    return
  }
  storage.setItem(THEME_KEY, theme)
  root.dataset.theme = theme
}
