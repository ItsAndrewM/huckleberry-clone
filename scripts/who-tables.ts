import { createHash } from "node:crypto"

export type Indicator = "weightForAge" | "lengthForAge" | "headCircumferenceForAge"
export type TableKind = "zscore" | "percentiles"

export interface WhoSource {
  readonly dataset: string
  readonly sheet: string
  readonly indicator: Indicator
  readonly kind: TableKind
  readonly url: string
}

const INDICATORS_URL = "https://cdn.who.int/media/docs/default-source/child-growth/child-growth-standards/indicators"

export const WHO_SOURCES: readonly WhoSource[] = [
  {
    dataset: "wfa-girls-zscore-expanded-tables",
    sheet: "WFA_girls_z_exp",
    indicator: "weightForAge",
    kind: "zscore",
    url: `${INDICATORS_URL}/weight-for-age/expanded-tables/wfa-girls-zscore-expanded-tables.xlsx?sfvrsn=f01bc813_10`,
  },
  {
    dataset: "wfa-girls-percentiles-expanded-tables",
    sheet: "wfa_girls_p_exp",
    indicator: "weightForAge",
    kind: "percentiles",
    url: `${INDICATORS_URL}/weight-for-age/expanded-tables/wfa-girls-percentiles-expanded-tables.xlsx?sfvrsn=54cfa5e8_9`,
  },
  {
    dataset: "lhfa-girls-zscore-expanded-tables",
    sheet: "LFA_girls_z_exp",
    indicator: "lengthForAge",
    kind: "zscore",
    url: `${INDICATORS_URL}/length-height-for-age/expandable-tables/lhfa-girls-zscore-expanded-tables.xlsx?sfvrsn=27f1e2cb_10`,
  },
  {
    dataset: "lhfa-girls-percentiles-expanded-tables",
    sheet: "lhfa_girls_p_exp",
    indicator: "lengthForAge",
    kind: "percentiles",
    url: `${INDICATORS_URL}/length-height-for-age/expandable-tables/lhfa-girls-percentiles-expanded-tables.xlsx?sfvrsn=478569a5_9`,
  },
  {
    dataset: "hcfa-girls-zscore-expanded-tables",
    sheet: "HCFA_girls_z_exp",
    indicator: "headCircumferenceForAge",
    kind: "zscore",
    url: `${INDICATORS_URL}/head-circumference-for-age/expanded-tables/hcfa-girls-zscore-expanded-tables.xlsx?sfvrsn=3a34b8b0_8`,
  },
  {
    dataset: "hcfa-girls-percentiles-expanded-tables",
    sheet: "hcfa_girls_p_exp",
    indicator: "headCircumferenceForAge",
    kind: "percentiles",
    url: `${INDICATORS_URL}/head-circumference-for-age/expanded-tables/hcfa-girls-percentiles-expanded-tables.xlsx?sfvrsn=71b282d1_13`,
  },
]

export const LAST_DAY = 730
export const LMS_FILE = "lms-girls.json"
export const MANIFEST_FILE = "MANIFEST.json"

const LMS_COLUMNS = ["L", "M", "S"] as const

export const COLUMNS = {
  zscore: [...LMS_COLUMNS, "SD4neg", "SD3neg", "SD2neg", "SD1neg", "SD0", "SD1", "SD2", "SD3", "SD4"],
  percentiles: [
    ...LMS_COLUMNS,
    "P01",
    "P1",
    "P3",
    "P5",
    "P10",
    "P15",
    "P25",
    "P50",
    "P75",
    "P85",
    "P90",
    "P95",
    "P97",
    "P99",
    "P999",
  ],
} as const

const DAY_HEADINGS: ReadonlySet<string> = new Set(["Day", "Age"])
const SHARED_STRING = /<si><t[^>]*>([^<]*)<\/t><\/si>/g
const ROW = /<row\b[^>]*[^/]>(.*?)<\/row>/gs
const CELL = /<c ([^>]*?)(?:\/>|>(?:<v>([^<]*)<\/v>)?<\/c>)/g
const DECIMAL = /^-?\d+(?:\.\d+)?(?:E[-+]?\d+)?$/i
const SHEET = /<sheet\b[^>]*\bname="([^"]*)"/g

export type Table = readonly (readonly number[])[]

export const sharedStrings = (xml: string): string[] => Array.from(xml.matchAll(SHARED_STRING), ([, text = ""]) => text)

const cellText = (attributes: string, value: string, strings: readonly string[]) =>
  attributes.includes('t="s"') ? (strings[Number(value)] ?? "") : value

export const sheetRows = (sheetXml: string, strings: readonly string[]): string[][] =>
  Array.from(sheetXml.matchAll(ROW), ([, cells = ""]) =>
    Array.from(cells.matchAll(CELL), ([, attributes = "", value = ""]) => cellText(attributes, value, strings)),
  )

export const checkWorkbook = (source: WhoSource, workbookXml: string): void => {
  const names = Array.from(workbookXml.matchAll(SHEET), ([, name = ""]) => name)
  if (names.length !== 1 || names[0] !== source.sheet) {
    throw new Error(`${source.dataset}: expected one sheet, ${source.sheet}; found ${names.join(", ")}`)
  }
}

const numberOf = (text: string) => (DECIMAL.test(text) ? Number(text) : Number.NaN)

const dayValues = (cells: readonly string[], day: number, width: number): number[] => {
  const [dayCell, ...values] = cells.map(numberOf)
  if (dayCell !== day || values.length !== width || !values.every(Number.isFinite)) {
    throw new Error(`Expected day ${day} and ${width} numbers; found ${cells.join(", ")}`)
  }
  return values
}

export const whoTable = (rows: readonly (readonly string[])[], columns: readonly string[], lastDay: number): Table => {
  const [heading = [], ...body] = rows
  const [dayHeading = "", ...valueHeadings] = heading
  if (!DAY_HEADINGS.has(dayHeading) || valueHeadings.join() !== columns.join()) {
    throw new Error(`Expected Day or Age, then ${columns.join(", ")}; found ${heading.join(", ")}`)
  }
  if (body.length <= lastDay) throw new Error(`Expected days 0 to ${lastDay}; found ${body.length} rows`)
  return body.slice(0, lastDay + 1).map((cells, day) => dayValues(cells, day, columns.length))
}

const column = (table: Table, index: number) => table.map((row) => row[index] ?? Number.NaN)

const jsonObject = (lines: readonly string[]) => `{\n${lines.join(",\n")}\n}\n`

export const tableJson = (columns: readonly string[], table: Table): string =>
  jsonObject(columns.map((name, index) => `  ${JSON.stringify(name)}: ${JSON.stringify(column(table, index))}`))

export interface LmsColumns {
  readonly L: readonly number[]
  readonly M: readonly number[]
  readonly S: readonly number[]
}

export interface IndicatorLms {
  readonly indicator: Indicator
  readonly lms: LmsColumns
}

export const lmsColumns = (table: Table): LmsColumns => ({
  L: column(table, 0),
  M: column(table, 1),
  S: column(table, 2),
})

const lmsRows = ({ L, M, S }: LmsColumns) => L.map((l, day) => `    ${JSON.stringify({ L: l, M: M[day], S: S[day] })}`)

export const lmsJson = (indicators: readonly IndicatorLms[]): string =>
  jsonObject(
    indicators.map(({ indicator, lms }) => `  ${JSON.stringify(indicator)}: [\n${lmsRows(lms).join(",\n")}\n  ]`),
  )

export interface SourceRead {
  readonly source: WhoSource
  readonly sha256: string
  readonly table: Table
}

export interface DataFile {
  readonly path: string
  readonly text: string
  readonly from: readonly string[]
}

const sameLms = (a: Table, b: Table) => JSON.stringify(lmsColumns(a)) === JSON.stringify(lmsColumns(b))

const checkLmsAgree = (zscores: readonly SourceRead[], percentiles: readonly SourceRead[]) => {
  for (const { source, table } of percentiles) {
    const zscore = zscores.find((read) => read.source.indicator === source.indicator)
    if (zscore === undefined || !sameLms(zscore.table, table)) {
      throw new Error(`${source.dataset}: L, M and S differ from the ${source.indicator} z-score table's`)
    }
  }
}

export const whoFiles = (reads: readonly SourceRead[]): DataFile[] => {
  const zscores = reads.filter(({ source }) => source.kind === "zscore")
  const percentiles = reads.filter(({ source }) => source.kind === "percentiles")
  checkLmsAgree(zscores, percentiles)
  return [
    ...reads.map(({ source, table }) => ({
      path: `${source.dataset}.json`,
      text: tableJson(COLUMNS[source.kind], table),
      from: [source.dataset],
    })),
    {
      path: LMS_FILE,
      text: lmsJson(zscores.map(({ source, table }) => ({ indicator: source.indicator, lms: lmsColumns(table) }))),
      from: zscores.map(({ source }) => source.dataset),
    },
  ]
}

export const sha256Of = (bytes: Uint8Array | string): string => createHash("sha256").update(bytes).digest("hex")

export interface ManifestSource {
  readonly dataset: string
  readonly url: string
  readonly sha256: string
}

export interface ManifestFile {
  readonly path: string
  readonly sha256: string
  readonly from: readonly string[]
}

export interface WhoManifest {
  readonly standard: string
  readonly days: { readonly first: number; readonly last: number }
  readonly sources: readonly ManifestSource[]
  readonly files: readonly ManifestFile[]
}

export const whoManifest = (reads: readonly SourceRead[], files: readonly DataFile[]): WhoManifest => ({
  standard: "WHO Child Growth Standards (2006), expanded tables for girls",
  days: { first: 0, last: LAST_DAY },
  sources: reads.map(({ source, sha256 }) => ({ dataset: source.dataset, url: source.url, sha256 })),
  files: files.map(({ path, text, from }) => ({ path, sha256: sha256Of(text), from })),
})

export const manifestJson = (manifest: WhoManifest): string => `${JSON.stringify(manifest, null, 2)}\n`
