import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { CI_WORKFLOW } from "./release-checks.ts"

const workflow = (file: string) => readFileSync(new URL(`../.github/workflows/${file}`, import.meta.url), "utf8")

describe("the deploy workflow", () => {
  const deploy = workflow("deploy.yml")

  it("waits for the workflow ci.yml names, the one pnpm release asks gh about, so a rename can't stop deploys silently", () => {
    expect(workflow("ci.yml")).toMatch(new RegExp(`^name: ${CI_WORKFLOW}$`, "m"))
    expect(deploy).toContain(`workflows: [${CI_WORKFLOW}]`)
  })

  it("deploys only after CI passed on a push", () => {
    expect(deploy).toContain(
      "if: github.event.workflow_run.conclusion == 'success' && github.event.workflow_run.event == 'push'",
    )
  })

  it("checks out the commit CI tested, not main's latest", () => {
    expect(deploy).toContain(`ref: \${{ github.event.workflow_run.head_sha }}`)
  })

  it("fails, rather than skipping green, when it can't read main's head", () => {
    expect(deploy).toContain("shell: bash")
    expect(deploy).toContain("git ls-remote --exit-code origin refs/heads/main")
  })

  it("hands the Cloudflare token to the release step alone, after the install", () => {
    expect(deploy.match(/secrets\.CLOUDFLARE_API_TOKEN/g)).toHaveLength(1)
    expect(deploy.indexOf("secrets.CLOUDFLARE_API_TOKEN")).toBeGreaterThan(deploy.indexOf("run: pnpm release"))
  })

  it("never cancels a deploy that's running", () => {
    expect(deploy).toContain("cancel-in-progress: false")
  })
})
