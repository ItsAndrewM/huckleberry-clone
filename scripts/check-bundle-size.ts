import { spawnSync } from "node:child_process"
import { fileURLToPath } from "node:url"
import { builtWorkerConfig, exceedsBudget, parseUploadSize } from "./bundle-size.ts"

// Spike S6 measured 228 KiB gzip with Effect http-api + sql included; M1 fails above 400 (spike-results.md).
const BUDGET_GZIP_KIB = 400

const webDir = fileURLToPath(new URL("../apps/web/", import.meta.url))
const run = spawnSync("pnpm", ["exec", "wrangler", "deploy", "--dry-run", "--config", builtWorkerConfig(webDir)], {
  cwd: webDir,
  encoding: "utf8",
})
if (run.error !== undefined) throw run.error
const output = `${run.stdout}${run.stderr}`
if (run.status !== 0) {
  process.stderr.write(output)
  process.exit(run.status ?? 1)
}

const size = parseUploadSize(output)
console.log(`Worker bundle: ${size.rawKiB} KiB raw / ${size.gzipKiB} KiB gzip (budget ${BUDGET_GZIP_KIB} KiB gzip)`)
if (exceedsBudget(size, BUDGET_GZIP_KIB)) {
  console.error(`Worker bundle exceeds the ${BUDGET_GZIP_KIB} KiB gzip budget`)
  process.exit(1)
}
