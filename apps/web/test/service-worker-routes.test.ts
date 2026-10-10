import { describe, expect, it } from "vitest"
import { type Route, routeOf } from "../src/service-worker/routes.ts"

const ORIGIN = "https://baby.example.test"

const request = (url: string, mode: RequestMode, method = "GET") => ({ url: new URL(url, ORIGIN).href, mode, method })

describe("routeOf", () => {
  it.each<[string, ReturnType<typeof request>, Route]>([
    ["opening the app", request("/", "navigate"), "page"],
    ["opening a tab's address with a query", request("/history?week=2026-W41", "navigate"), "page"],
    ["a path that only starts like the API", request("/apiary", "navigate"), "page"],
    ["a built script", request("/assets/index-CSxg7yjE.js", "cors"), "asset"],
    ["the manifest", request("/manifest.webmanifest", "no-cors"), "asset"],
    ["a household read", request("/api/me", "cors"), "network"],
    ["Sign in, a top-level navigation to the API", request("/api/login?return=%2F", "navigate"), "network"],
    ["a save", request("/api/diapers", "cors", "POST"), "network"],
    ["a HEAD of the app", request("/", "navigate", "HEAD"), "network"],
    ["Access's sign-in page", request("https://team.cloudflareaccess.com/cdn-cgi/access/login", "navigate"), "network"],
  ])("routes %s to %s", (_, routed, route) => {
    expect(routeOf(routed, ORIGIN)).toBe(route)
  })
})
