import { readFileSync } from "node:fs"
import ts from "typescript"
import { describe, expect, it } from "vitest"
import {
  bookmarkFrom,
  type Checkout,
  checkoutProblems,
  ciProblems,
  type DeployConfig,
  deployLogLine,
  deployProblems,
  withoutCloudflareEnv,
} from "./release-checks.ts"

const BOOKMARK = "0000007b-0000b26e-00001538-0c3e87bb37b3db5cc52eedb93cd3b96b"

const DEPLOYABLE: DeployConfig = {
  name: "baby-tracker",
  routes: [{ pattern: "baby.andamonium.dev", custom_domain: true }],
  workers_dev: false,
  preview_urls: false,
  vars: { ACCESS_AUD: "941d341f", ADMIN_SERVICE_TOKEN_CN: "a1b2c3.access" },
  observability: { logs: { invocation_logs: false } },
}

const ON_MAIN: Checkout = { branch: "main", clean: true, head: "7321bf2", originMain: "7321bf2" }

describe("the Worker config a release deploys", () => {
  it("passes as built for production", () => {
    expect(deployProblems(DEPLOYABLE)).toEqual([])
  })

  it("passes as committed in apps/worker/wrangler.jsonc", () => {
    const path = new URL("../apps/worker/wrangler.jsonc", import.meta.url)
    const { config, error } = ts.parseConfigFileTextToJson(path.pathname, readFileSync(path, "utf8"))
    expect(error).toBeUndefined()
    expect(deployProblems(config)).toEqual([])
  })

  it.each([
    [
      "a local build, whose name and made-up household E2E left behind",
      { name: "baby-tracker-local", vars: { ...DEPLOYABLE.vars, LOCAL_HOUSEHOLD: { name: "Local household" } } },
      [
        "the Worker is baby-tracker, not a local build (rebuild without CLOUDFLARE_ENV)",
        "no made-up LOCAL_HOUSEHOLD is seeded",
      ],
    ],
    [
      "workers.dev or preview URLs, which Access doesn't cover",
      { workers_dev: true, preview_urls: true },
      ["workers.dev is off", "preview URLs are off"],
    ],
    [
      "a route that isn't the Custom Domain",
      { routes: [{ pattern: "baby.andamonium.dev/*" }] },
      ["its only route is the Custom Domain baby.andamonium.dev"],
    ],
    [
      "a second route",
      { routes: [...(DEPLOYABLE.routes ?? []), { pattern: "baby.example.test", custom_domain: true }] },
      ["its only route is the Custom Domain baby.andamonium.dev"],
    ],
    [
      "empty Access settings, which refuse every caller",
      { vars: { ACCESS_AUD: "", ADMIN_SERVICE_TOKEN_CN: "" } },
      ["ACCESS_AUD is set", "ADMIN_SERVICE_TOKEN_CN is set"],
    ],
    [
      "Cloudflare's per-request logs, which would store the Access JWT and the email",
      { observability: { logs: { invocation_logs: true } } },
      ["Cloudflare's per-request logs are off"],
    ],
    [
      "no observability settings, which keep per-request logs",
      { observability: {} },
      ["Cloudflare's per-request logs are off"],
    ],
  ])("refuses %s", (_label, change, problems) => {
    expect(deployProblems({ ...DEPLOYABLE, ...change })).toEqual(problems)
  })
})

describe("the checkout a release deploys from", () => {
  it("passes on a clean main that matches origin/main", () => {
    expect(checkoutProblems(ON_MAIN)).toEqual([])
  })

  it.each([
    ["a feature branch", { branch: "feature/x" }, ["the checkout is on main"]],
    ["uncommitted changes", { clean: false }, ["the checkout has no uncommitted changes"]],
    ["a main that's behind or ahead of origin", { originMain: "2eee922" }, ["main is the same commit as origin/main"]],
  ])("refuses %s", (_label, change, problems) => {
    expect(checkoutProblems({ ...ON_MAIN, ...change })).toEqual(problems)
  })
})

describe("CI on the commit a release deploys", () => {
  const EARLIER = "2026-10-10T18:00:00Z"
  const LATER = "2026-10-10T19:00:00Z"
  const run = (conclusion: string, createdAt: string) => ({ status: "completed", conclusion, createdAt })

  it("passes once a run has finished green", () => {
    expect(ciProblems([run("success", EARLIER)])).toEqual([])
  })

  it("passes when a later run went green after a red one, however the runs are listed", () => {
    expect(ciProblems([run("failure", EARLIER), run("success", LATER)])).toEqual([])
    expect(ciProblems([run("success", LATER), run("failure", EARLIER)])).toEqual([])
  })

  it.each([
    ["no run yet", [], ["CI has run on this commit"]],
    [
      "a run still going",
      [{ status: "in_progress", conclusion: "", createdAt: EARLIER }],
      ["CI has finished on this commit"],
    ],
    ["a red run", [run("failure", EARLIER)], ["CI passed on this commit"]],
    ["a cancelled run", [run("cancelled", EARLIER)], ["CI passed on this commit"]],
    ["a red run after a green one", [run("success", EARLIER), run("failure", LATER)], ["CI passed on this commit"]],
    [
      "a red run after a green one, listed newest first",
      [run("failure", LATER), run("success", EARLIER)],
      ["CI passed on this commit"],
    ],
  ])("refuses %s", (_label, runs, problems) => {
    expect(ciProblems(runs)).toEqual(problems)
  })
})

describe("the build a release runs", () => {
  it("drops CLOUDFLARE_ENV, so a shell left on local still builds production", () => {
    expect(withoutCloudflareEnv({ CLOUDFLARE_ENV: "local", PATH: "/usr/bin" })).toEqual({ PATH: "/usr/bin" })
  })
})

describe("the bookmark a release takes before deploying", () => {
  it("is read from the admin route's answer", () => {
    expect(bookmarkFrom(200, JSON.stringify({ bookmark: BOOKMARK }))).toBe(BOOKMARK)
  })

  it.each([
    ["a refusal", 401, JSON.stringify({ _tag: "Unauthorized" })],
    ["Access's sign-in redirect, from a wrong service token", 302, ""],
    ["an answer that isn't JSON", 200, "<html>"],
    ["a bookmark that isn't one", 200, JSON.stringify({ bookmark: "yesterday" })],
  ])("stops the release on %s", (_label, status, body) => {
    expect(() => bookmarkFrom(status, body)).toThrow(`Couldn't take a bookmark before deploying: ${status}`)
  })

  it("is logged with the time and the commit, or noted as missing on the first deploy", () => {
    const at = new Date(Date.UTC(2026, 9, 10, 18))
    expect(deployLogLine(at, "7321bf2", BOOKMARK)).toBe(`2026-10-10T18:00:00.000Z 7321bf2 ${BOOKMARK}\n`)
    expect(deployLogLine(at, "7321bf2", null)).toBe("2026-10-10T18:00:00.000Z 7321bf2 first-deploy-no-bookmark\n")
  })
})
