import { spawnSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { join, relative } from "node:path"
import { fileURLToPath } from "node:url"
import { catalogViolations, manifestViolations } from "./pins.ts"

const root = fileURLToPath(new URL("..", import.meta.url))

const listed = spawnSync("pnpm", ["ls", "-r", "--depth", "-1", "--json"], { cwd: root, encoding: "utf8" })
if (listed.status !== 0) {
  console.error(listed.error?.message ?? `${listed.stdout}${listed.stderr}`)
  process.exit(listed.status ?? 1)
}
const manifests = (JSON.parse(listed.stdout) as Array<{ path: string }>).map(({ path }) =>
  relative(root, join(path, "package.json")),
)

const violations = [
  ...catalogViolations(readFileSync(join(root, "pnpm-workspace.yaml"), "utf8")),
  ...manifests.flatMap((file) => manifestViolations(file, JSON.parse(readFileSync(join(root, file), "utf8")))),
]
if (violations.length > 0) {
  console.error(
    ["Pin each version exactly in the pnpm catalog; packages use catalog: or workspace:*", ...violations].join("\n  "),
  )
  process.exit(1)
}
console.log(`Pins exact: the catalog and ${manifests.length} package.json files`)
