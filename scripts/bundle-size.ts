import { existsSync, readFileSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { stripVTControlCharacters } from "node:util"

const UPLOAD_LINE = /Total Upload:\s*(\d+(?:\.\d+)?)\s*KiB\s*\/\s*gzip:\s*(\d+(?:\.\d+)?)\s*KiB/

export interface UploadSize {
  readonly rawKiB: number
  readonly gzipKiB: number
}

export const parseUploadSize = (wranglerOutput: string): UploadSize => {
  const text = stripVTControlCharacters(wranglerOutput)
  const match = UPLOAD_LINE.exec(text)
  if (match === null) throw new Error(`No 'Total Upload: <n> KiB / gzip: <n> KiB' line in wrangler output:\n${text}`)
  return { rawKiB: Number(match[1]), gzipKiB: Number(match[2]) }
}

export const exceedsBudget = (size: UploadSize, budgetGzipKiB: number): boolean => size.gzipKiB > budgetGzipKiB

const DEPLOY_REDIRECT = join(".wrangler", "deploy", "config.json")

export const builtWorkerConfig = (webDir: string): string => {
  const redirect = join(webDir, DEPLOY_REDIRECT)
  if (!existsSync(redirect)) throw new Error(`No ${DEPLOY_REDIRECT} in ${webDir}; run \`pnpm build\` first`)
  // SAFETY: vite build writes configPath here; a missing or non-string one makes resolve() throw.
  const { configPath } = JSON.parse(readFileSync(redirect, "utf8")) as { configPath: string }
  return resolve(dirname(redirect), configPath)
}
