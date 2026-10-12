import { homeScreenOf } from "./home-screen.ts"

declare global {
  interface Navigator {
    readonly standalone?: boolean
  }
}

export const thisPhone = homeScreenOf(
  navigator.standalone,
  matchMedia("(display-mode: standalone)").matches,
  navigator.maxTouchPoints,
)

export const phoneStorage = () => localStorage
