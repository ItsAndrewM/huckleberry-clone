import { describe, expect, it } from "vitest"
import { type DeployConfig, deployProblems } from "./release-checks.ts"

const DEPLOYABLE: DeployConfig = {
  name: "baby-tracker",
  routes: [{ pattern: "baby.andamonium.dev", custom_domain: true }],
  workers_dev: false,
  preview_urls: false,
  vars: { ACCESS_AUD: "941d341f", ADMIN_SERVICE_TOKEN_CN: "a1b2c3.access" },
  observability: { logs: { invocation_logs: false } },
}

describe("the Worker config a release deploys", () => {
  it("passes as built for production", () => {
    expect(deployProblems(DEPLOYABLE)).toEqual([])
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
