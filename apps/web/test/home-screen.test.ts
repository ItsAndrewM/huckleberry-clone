import { describe, expect, it } from "vitest"
import {
  dismissInstallCard,
  type HomeScreen,
  homeScreenOf,
  INSTALL_CARD_KEY,
  installCardDismissed,
  showsInstallCard,
} from "../src/install/home-screen.ts"
import type { BrowserStorage } from "../src/storage.ts"

const memoryStorage = (entries: ReadonlyArray<readonly [string, string]> = []) => {
  const items = new Map(entries)
  const storage: BrowserStorage = {
    getItem: (key) => items.get(key) ?? null,
    setItem: (key, value) => void items.set(key, value),
    removeItem: (key) => void items.delete(key),
  }
  return { items, open: () => storage }
}

const blocked = (): BrowserStorage => {
  throw new DOMException("The operation is insecure.", "SecurityError")
}

describe("homeScreenOf", () => {
  it("knows nothing about a Home Screen where the browser has no standalone flag, as on desktop or Android", () => {
    expect(homeScreenOf(undefined, false)).toBe("elsewhere")
    expect(homeScreenOf(undefined, true)).toBe("elsewhere")
  })

  it("calls an iPhone app opened from the Home Screen installed", () => {
    expect(homeScreenOf(true, false)).toBe("installed")
    expect(homeScreenOf(true, true)).toBe("installed")
  })

  it("trusts the display mode too, in case a WebKit reports standalone late", () => {
    expect(homeScreenOf(false, true)).toBe("installed")
  })

  it("calls everything else on an iPhone a browser tab", () => {
    expect(homeScreenOf(false, false)).toBe("browser-tab")
  })
})

describe("showsInstallCard", () => {
  it.each<[HomeScreen, boolean, boolean]>([
    ["browser-tab", false, true],
    ["browser-tab", true, false],
    ["installed", false, false],
    ["elsewhere", false, false],
  ])("on %s, dismissed %s: %s", (homeScreen, dismissed, shown) => {
    expect(showsInstallCard(homeScreen, dismissed)).toBe(shown)
  })
})

describe("the install card's dismissal", () => {
  it("starts undismissed on a phone that never chose", () => {
    expect(installCardDismissed(memoryStorage().open)).toBe(false)
  })

  it("remembers Not now on this phone", () => {
    const storage = memoryStorage()
    dismissInstallCard(storage.open)
    expect(storage.items.get(INSTALL_CARD_KEY)).toBe("dismissed")
    expect(installCardDismissed(storage.open)).toBe(true)
  })

  it("ignores a stored value it didn't write", () => {
    expect(installCardDismissed(memoryStorage([[INSTALL_CARD_KEY, "yes"]]).open)).toBe(false)
  })

  it("treats blocked storage as undismissed, and Not now there as a no-op rather than an error", () => {
    expect(installCardDismissed(blocked)).toBe(false)
    expect(() => dismissInstallCard(blocked)).not.toThrow()
  })
})
