export const THEMES = ["system", "light", "dark"] as const
export type Theme = (typeof THEMES)[number]

export const THEME_KEY = "bt.theme"

type ThemeStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">
type ThemeRoot = Pick<HTMLElement, "dataset">

const isChosen = (value: string | null): value is "light" | "dark" => value === "light" || value === "dark"

const attempt = <A>(run: () => A, otherwise: A): A => {
  try {
    return run()
  } catch {
    return otherwise
  }
}

export const storedTheme = (openStorage: () => ThemeStorage): Theme => {
  const stored = attempt(() => openStorage().getItem(THEME_KEY), null)
  return isChosen(stored) ? stored : "system"
}

export const applyTheme = (theme: Theme, openStorage: () => ThemeStorage, root: ThemeRoot) => {
  if (theme === "system") {
    delete root.dataset.theme
    attempt(() => openStorage().removeItem(THEME_KEY), undefined)
    return
  }
  root.dataset.theme = theme
  attempt(() => openStorage().setItem(THEME_KEY, theme), undefined)
}
