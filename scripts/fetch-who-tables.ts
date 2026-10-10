import { spawnSync } from "node:child_process"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import {
  checkWorkbook,
  COLUMNS,
  LAST_DAY,
  MANIFEST_FILE,
  manifestJson,
  sha256Of,
  sharedStrings,
  sheetRows,
  type SourceRead,
  WHO_SOURCES,
  type WhoSource,
  whoFiles,
  whoManifest,
  whoTable,
} from "./who-tables.ts"

const dataDir = fileURLToPath(new URL("../packages/domain/data/who/", import.meta.url))
const downloads = mkdtempSync(join(tmpdir(), "who-tables-"))

const download = async ({ dataset, url }: WhoSource) => {
  const response = await fetch(url, { redirect: "error" })
  if (!response.ok) throw new Error(`${dataset}: HTTP ${response.status} from ${url}`)
  return new Uint8Array(await response.arrayBuffer())
}

const unzipped = (workbook: string, entry: string) => {
  const run = spawnSync("unzip", ["-p", workbook, entry], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 })
  if (run.status !== 0) throw new Error(`unzip ${entry} from ${workbook}: ${run.error?.message ?? run.stderr}`)
  return run.stdout
}

const read = async (source: WhoSource): Promise<SourceRead> => {
  const bytes = await download(source)
  const workbook = join(downloads, `${source.dataset}.xlsx`)
  writeFileSync(workbook, bytes)
  checkWorkbook(source, unzipped(workbook, "xl/workbook.xml"))
  const strings = sharedStrings(unzipped(workbook, "xl/sharedStrings.xml"))
  const rows = sheetRows(unzipped(workbook, "xl/worksheets/sheet1.xml"), strings)
  return { source, sha256: sha256Of(bytes), table: whoTable(rows, COLUMNS[source.kind], LAST_DAY) }
}

try {
  const reads = await Promise.all(WHO_SOURCES.map(read))
  const files = whoFiles(reads)
  mkdirSync(dataDir, { recursive: true })
  for (const { path, text } of files) writeFileSync(join(dataDir, path), text)
  writeFileSync(join(dataDir, MANIFEST_FILE), manifestJson(whoManifest(reads, files)))
  console.log(`Wrote ${files.length} tables and ${MANIFEST_FILE} to ${dataDir}`)
} finally {
  rmSync(downloads, { recursive: true, force: true })
}
