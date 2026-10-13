import { readFileSync } from "node:fs"
import ts from "typescript"
import { describe, expect, it } from "vitest"
import { restoreFromArgs } from "./admin-pitr.ts"
import {
  type Checkout,
  checkoutProblems,
  ciProblems,
  type DeployConfig,
  deployProblems,
  envFor,
  refuseUnknownFlags,
  releasedReport,
  restorePointOf,
  restorePointReport,
  uploadedVersionId,
  versionDeployArgs,
  versionUploadArgs,
} from "./release-checks.ts"

const COMMIT = "20390a32dd62e7c7a4b1f0e9d8c7b6a5f4e3d2c1"
const VERSION_ID = "3f1c2d4e-5a6b-4c7d-8e9f-0a1b2c3d4e5f"
const BUILT_CONFIG = "/repo/apps/web/dist/baby_tracker/wrangler.json"

const valueAfter = (args: ReadonlyArray<string>, flag: string) => args[args.indexOf(flag) + 1] ?? ""

const DEPLOYABLE: DeployConfig = {
  name: "baby-tracker",
  account_id: "6624f09210327baade61004af0d9be84",
  routes: [{ pattern: "baby.andamonium.dev", custom_domain: true }],
  workers_dev: false,
  preview_urls: false,
  vars: { ACCESS_AUD: "941d341f", ADMIN_SERVICE_TOKEN_CN: "a1b2c3.access" },
  observability: { logs: { invocation_logs: false } },
}

const AT_ORIGIN_MAIN: Checkout = { clean: true, head: "7321bf2", originMain: "7321bf2" }

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
      "an empty account_id, which CI's token for one Worker can't look up",
      { account_id: "" },
      ["account_id is 6624f09210327baade61004af0d9be84, the production account"],
    ],
    [
      "another account's id, where a deploy from a Mac logged into both would land",
      { account_id: "0000000000000000000000000000beef" },
      ["account_id is 6624f09210327baade61004af0d9be84, the production account"],
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

describe("the flags pnpm release takes", () => {
  it("takes none", () => {
    expect(() => refuseUnknownFlags([])).not.toThrow()
  })

  it.each(["--first", "--skip-export"])("refuses %s, which M5.7 removed, rather than ignoring it", (flag) => {
    expect(() => refuseUnknownFlags([flag])).toThrow(`Unknown option '${flag}'`)
  })
})

describe("the checkout a release deploys from", () => {
  it("passes on a clean checkout at origin/main's head, on a branch or on CI's checkout of a commit", () => {
    expect(checkoutProblems(AT_ORIGIN_MAIN)).toEqual([])
  })

  it.each([
    ["uncommitted changes", { clean: false }, ["the checkout has no uncommitted changes"]],
    [
      "a commit behind or ahead of origin/main, such as an old CI run re-run after main moved on",
      { originMain: "2eee922" },
      ["HEAD is the same commit as origin/main"],
    ],
  ])("refuses %s", (_label, change, problems) => {
    expect(checkoutProblems({ ...AT_ORIGIN_MAIN, ...change })).toEqual(problems)
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

describe("the credentials each step of a release gets", () => {
  const SHELL = {
    PATH: "/usr/bin",
    CLOUDFLARE_ENV: "local",
    CLOUDFLARE_API_TOKEN: "cf-token",
    GH_TOKEN: "gh-token",
    GITHUB_TOKEN: "github-token",
  }

  it("gives the build no token and no CLOUDFLARE_ENV, since it runs dependency code and must build production", () => {
    expect(envFor("build", SHELL)).toEqual({ PATH: "/usr/bin" })
  })

  it("gives git no token, since the checkout carries its own credentials", () => {
    expect(envFor("git", SHELL)).toEqual({ PATH: "/usr/bin" })
  })

  it("gives gh the GitHub tokens and no Cloudflare one", () => {
    expect(envFor("gh", SHELL)).toEqual({ PATH: "/usr/bin", GH_TOKEN: "gh-token", GITHUB_TOKEN: "github-token" })
  })

  it("gives Wrangler the Cloudflare token and no GitHub one", () => {
    expect(envFor("wrangler", SHELL)).toEqual({ PATH: "/usr/bin", CLOUDFLARE_API_TOKEN: "cf-token" })
  })
})

describe("the restore point a release records", () => {
  const AT = new Date(Date.UTC(2026, 9, 12, 15, 49, 59, 812))

  it("is the UTC second, written with its zone", () => {
    expect(restorePointOf(AT)).toBe("2026-10-12T15:49:59Z")
  })

  it("is a time pnpm admin pitr:restore --at takes, at that same second", () => {
    expect(restoreFromArgs(["--at", restorePointOf(AT)])).toEqual({ at: Date.UTC(2026, 9, 12, 15, 49, 59) })
  })
})

describe("the version a release uploads", () => {
  const UPLOAD = { config: BUILT_CONFIG, commit: COMMIT }

  it("uploads the build as a version tagged with the whole commit, naming the CI run, without putting it live", () => {
    expect(versionUploadArgs({ ...UPLOAD, runId: "18233456789" })).toEqual([
      "versions",
      "upload",
      "--config",
      BUILT_CONFIG,
      "--tag",
      COMMIT,
      "--message",
      "20390a3 ci:18233456789",
    ])
  })

  it("says local when it runs from the Mac", () => {
    expect(valueAfter(versionUploadArgs({ ...UPLOAD, runId: undefined }), "--message")).toBe("20390a3 local")
  })
})

describe("the version Wrangler reports it uploaded", () => {
  it("is read from the version-upload line of Wrangler's output file", () => {
    const output = [
      JSON.stringify({ type: "wrangler-session", version: 1 }),
      JSON.stringify({ type: "version-upload", version: 1, version_id: VERSION_ID }),
      "",
    ].join("\n")
    expect(uploadedVersionId(output)).toBe(VERSION_ID)
  })

  it.each([
    ["an empty file, from an upload that failed before writing it", ""],
    ["a file with no version-upload line", JSON.stringify({ type: "wrangler-session", version: 1 })],
  ])("stops the release on %s", (_label, output) => {
    expect(() => uploadedVersionId(output)).toThrow("Wrangler reported no uploaded version")
  })
})

describe("the deploy that puts the uploaded version live", () => {
  const ROLLOUT = { config: BUILT_CONFIG, versionId: VERSION_ID, commit: COMMIT, restorePoint: "2026-10-12T15:49:59Z" }

  it("sends all traffic to that version, with the restore point and the CI run in the deployment's message", () => {
    expect(versionDeployArgs({ ...ROLLOUT, runId: "18233456789" })).toEqual([
      "versions",
      "deploy",
      `${VERSION_ID}@100%`,
      "--config",
      BUILT_CONFIG,
      "--message",
      "20390a3 restore point 2026-10-12T15:49:59Z ci:18233456789",
      "--yes",
    ])
  })

  it("says local when it runs from the Mac", () => {
    expect(valueAfter(versionDeployArgs({ ...ROLLOUT, runId: undefined }), "--message")).toBe(
      "20390a3 restore point 2026-10-12T15:49:59Z local",
    )
  })

  it("stays within Cloudflare's 100-byte tag and 1,000-byte messages", () => {
    const runId = "9".repeat(20)
    const upload = versionUploadArgs({ config: BUILT_CONFIG, commit: COMMIT, runId })
    const rollout = versionDeployArgs({ ...ROLLOUT, runId })
    expect(Buffer.byteLength(valueAfter(upload, "--tag"))).toBeLessThanOrEqual(100)
    expect(Buffer.byteLength(valueAfter(upload, "--message"))).toBeLessThanOrEqual(1000)
    expect(Buffer.byteLength(valueAfter(rollout, "--message"))).toBeLessThanOrEqual(1000)
  })
})

describe("what a release reports", () => {
  it("gives the restore point and the command that rewinds to it, before the version goes live", () => {
    expect(restorePointReport("2026-10-12T15:49:59Z")).toBe(
      "Restore point: 2026-10-12T15:49:59Z. To rewind the household to just before this deploy, run `pnpm admin pitr:restore --at 2026-10-12T15:49:59Z`.",
    )
  })

  it("names the commit once it's live, and reminds about the phones", () => {
    expect(releasedReport(COMMIT)).toBe(
      [
        "Released 20390a3 to https://baby.andamonium.dev.",
        "Open the app online on each phone, so its offline copy updates to this build.",
      ].join("\n\n"),
    )
  })
})
