import { spawnSync } from "node:child_process"
import { basename, join } from "node:path"
import { fileURLToPath } from "node:url"
import { builtWorkerConfig, entryAsset, exceedsBudget, gzipKB, parseUploadSize } from "./bundle-size.ts"

const BUDGET_GZIP_KIB = 400
const APP_LIMITS_GZIP_KB = [
  ["js", "script", 350],
  ["css", "CSS", 15],
] as const

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
const workerOver = exceedsBudget(size, BUDGET_GZIP_KIB)
if (workerOver) console.error(`Worker bundle exceeds the ${BUDGET_GZIP_KIB} KiB gzip budget`)

const assetsDir = join(webDir, "dist", "client", "assets")
const appSizes = APP_LIMITS_GZIP_KB.map(([kind, name, limitKB]) => {
  const file = entryAsset(assetsDir, kind)
  return { name, limitKB, file: basename(file), gzip: gzipKB(file) }
})
for (const { name, limitKB, file, gzip } of appSizes) {
  console.log(`App ${name}: ${gzip.toFixed(2)} kB gzip by node:zlib (limit ${limitKB} kB), ${file}`)
}
const appOver = appSizes.filter(({ gzip, limitKB }) => gzip > limitKB)
for (const { name, limitKB } of appOver) console.error(`The app's ${name} exceeds the ${limitKB} kB gzip limit`)
if (workerOver || appOver.length > 0) process.exit(1)
