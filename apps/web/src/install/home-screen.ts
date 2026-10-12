import { attempt, type BrowserStorage } from "../storage.ts"

export type HomeScreen = "installed" | "browser-tab" | "elsewhere"

export const INSTALL_CARD_KEY = "bt.install-card"
const DISMISSED = "dismissed"

export const homeScreenOf = (standalone: boolean | undefined, displayedStandalone: boolean): HomeScreen => {
  if (standalone === undefined) return "elsewhere"
  return standalone || displayedStandalone ? "installed" : "browser-tab"
}

export const installCardDismissed = (openStorage: () => BrowserStorage) =>
  attempt(() => openStorage().getItem(INSTALL_CARD_KEY), null) === DISMISSED

export const dismissInstallCard = (openStorage: () => BrowserStorage) =>
  attempt(() => openStorage().setItem(INSTALL_CARD_KEY, DISMISSED), undefined)

export const showsInstallCard = (homeScreen: HomeScreen, dismissed: boolean) =>
  homeScreen === "browser-tab" && !dismissed
