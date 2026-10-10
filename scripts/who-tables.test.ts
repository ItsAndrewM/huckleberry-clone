import { describe, expect, it } from "vitest"
import {
  LMS_FILE,
  lmsJson,
  sharedStrings,
  sheetRows,
  type Table,
  tableJson,
  type WhoSource,
  whoFiles,
  whoTable,
} from "./who-tables.ts"

const SHARED_STRINGS = "<sst><si><t>Day</t></si><si><t>L</t></si></sst>"
const sheet = (...rows: string[]) =>
  `<worksheet><sheetData>${rows.map((cells, i) => `<row r="${i + 1}" spans="1:2">${cells}</row>`).join("")}</sheetData></worksheet>`

describe("sheetRows", () => {
  it("reads shared-string headings, Excel's numbers and empty cells", () => {
    const xml = sheet(
      '<c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c>',
      '<c r="A2"><v>0</v></c><c r="B2"><v>3.7830000000000003E-2</v></c>',
      '<c r="A3" s="2"/><c r="B3"><v>1</v></c>',
    )
    expect(sheetRows(xml, sharedStrings(SHARED_STRINGS))).toEqual([
      ["Day", "L"],
      ["0", "3.7830000000000003E-2"],
      ["", "1"],
    ])
  })
})

const LMS = ["L", "M", "S"]
const day = (n: number, l = "0.38090000000000002") => [String(n), l, "3.2322000000000002", "3.7830000000000003E-2"]

describe("whoTable", () => {
  it("keeps day 0 to the last day, in WHO's published decimals", () => {
    const rows = [["Day", ...LMS], day(0), day(1), day(2)]
    expect(whoTable(rows, LMS, 1)).toEqual([
      [0.3809, 3.2322, 0.03783],
      [0.3809, 3.2322, 0.03783],
    ])
  })

  it("accepts Age as the first heading, as two of WHO's workbooks have it", () => {
    expect(whoTable([["Age", ...LMS], day(0)], LMS, 0)).toEqual([[0.3809, 3.2322, 0.03783]])
  })

  it.each([
    { problem: "a heading WHO changed", rows: [["Day", "L", "M", "SD"], day(0)] },
    { problem: "a skipped day", rows: [["Day", ...LMS], day(1)] },
    { problem: "an empty cell", rows: [["Day", ...LMS], day(0, "")] },
    { problem: "a cell that isn't a number", rows: [["Day", ...LMS], day(0, "n/a")] },
    { problem: "a missing cell", rows: [["Day", ...LMS], day(0).slice(0, 3)] },
    { problem: "too few days", rows: [["Day", ...LMS]] },
  ])("refuses $problem", ({ rows }) => {
    expect(() => whoTable(rows, LMS, 0)).toThrow(/^Expected /)
  })
})

describe("tableJson and lmsJson", () => {
  it("write one column per line", () => {
    const table = [
      [0.3809, 3.2322],
      [0.3259, 3.1957],
    ]
    expect(tableJson(["L", "M"], table)).toBe('{\n  "L": [0.3809,0.3259],\n  "M": [3.2322,3.1957]\n}\n')
  })

  it("write one day per line, for each indicator", () => {
    const lms = { L: [0.3809], M: [3.2322], S: [0.14171] }
    expect(lmsJson([{ indicator: "weightForAge", lms }])).toBe(
      '{\n  "weightForAge": [\n    {"L":0.3809,"M":3.2322,"S":0.14171}\n  ]\n}\n',
    )
  })
})

const zscore: WhoSource = { dataset: "z", indicator: "weightForAge", kind: "zscore", url: "https://who.test/z.xlsx" }
const percentiles: WhoSource = { ...zscore, dataset: "p", kind: "percentiles" }
const read = (source: WhoSource, table: Table) => ({ source, sha256: "", table })

describe("whoFiles", () => {
  it("writes each workbook's table, and the runtime L, M and S from the z-score tables", () => {
    const table = [[0.3809, 3.2322, 0.14171]]
    const files = whoFiles([read(zscore, table), read(percentiles, table)])
    expect(files.map(({ path, from }) => ({ path, from }))).toEqual([
      { path: "z.json", from: ["z"] },
      { path: "p.json", from: ["p"] },
      { path: LMS_FILE, from: ["z"] },
    ])
  })

  it("refuses a percentile table whose L, M and S differ from the z-score table's", () => {
    const files = () =>
      whoFiles([read(zscore, [[0.3809, 3.2322, 0.14171]]), read(percentiles, [[0.3809, 3.2322, 0.1417]])])
    expect(files).toThrow("p: L, M and S differ from the weightForAge z-score table's")
  })

  it("refuses a percentile table with no z-score table to check it against", () => {
    expect(() => whoFiles([read(percentiles, [[1, 2, 3]])])).toThrow(/^p: L, M and S differ/)
  })
})
