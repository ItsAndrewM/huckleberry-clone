export type Indicator = "weightForAge" | "lengthForAge" | "headCircumferenceForAge"
export type TableKind = "zscore" | "percentiles"

export interface WhoSource {
  readonly dataset: string
  readonly indicator: Indicator
  readonly kind: TableKind
  readonly url: string
}

export const LAST_DAY = 730
export const LMS_FILE = "lms-girls.json"

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

export type Table = readonly (readonly number[])[]

export const sharedStrings = (xml: string): string[] => Array.from(xml.matchAll(SHARED_STRING), ([, text = ""]) => text)

const cellText = (attributes: string, value: string, strings: readonly string[]) =>
  attributes.includes('t="s"') ? (strings[Number(value)] ?? "") : value

export const sheetRows = (sheetXml: string, strings: readonly string[]): string[][] =>
  Array.from(sheetXml.matchAll(ROW), ([, cells = ""]) =>
    Array.from(cells.matchAll(CELL), ([, attributes = "", value = ""]) => cellText(attributes, value, strings)),
  )

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
