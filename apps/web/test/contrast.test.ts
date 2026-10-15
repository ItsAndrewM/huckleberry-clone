import { readdirSync, readFileSync } from "node:fs"
import { describe, expect, test } from "vitest"
import { contrast, over, srgbOfOklch, type Theme, themeTokens } from "./contrast.ts"

const LIGHT: Theme = 0
const DARK: Theme = 1
const SOURCE = new URL("../src/", import.meta.url)
const read = (path: string) => readFileSync(new URL(path, SOURCE), "utf8")
const token = themeTokens(read("index.css"))
const utilityColour = (name: string, theme: Theme) => token(`color-${name}`, theme)

const usesClass = (source: string, className: string) =>
  new RegExp(`(^|[\\s"'\`])${className.replaceAll(/[.[\]]/gu, String.raw`\$&`)}(?=[\\s"'\`]|$)`, "mu").test(source)

interface Mark {
  readonly name: string
  readonly file: string
  readonly className: string
  readonly colour: string
  readonly alpha: number
  readonly on: ReadonlyArray<string>
  readonly fill?: string
}

const MARKS: ReadonlyArray<Mark> = [
  {
    name: "the focus outline",
    file: "index.css",
    className: "outline-ring;",
    colour: "ring",
    alpha: 1,
    on: ["background", "card"],
  },
  {
    name: "a field's border",
    file: "components/ui/input.tsx",
    className: "border-field",
    colour: "field",
    alpha: 1,
    on: ["background", "card"],
  },
  {
    name: "a select's border",
    file: "components/ui/native-select.tsx",
    className: "border-field",
    colour: "field",
    alpha: 1,
    on: ["background", "card"],
  },
  {
    name: "an invalid field's border",
    file: "components/ui/input.tsx",
    className: "dark:aria-invalid:border-destructive",
    colour: "destructive",
    alpha: 1,
    on: ["background", "card"],
  },
  {
    name: "a pressed chip's border",
    file: "components/ui/toggle.tsx",
    className: "aria-pressed:border-primary",
    colour: "primary",
    alpha: 1,
    on: ["background", "card"],
  },
  {
    name: "a checked choice's border",
    file: "features/settings/sex-choice.tsx",
    className: "has-checked:border-primary",
    colour: "primary",
    alpha: 1,
    on: ["background", "card"],
  },
  {
    name: "an unchecked choice's border",
    file: "features/settings/sex-choice.tsx",
    className: "border-field",
    colour: "field",
    alpha: 1,
    on: ["background", "card"],
  },
  {
    name: "a feed's block on the Day grid",
    file: "features/history/grid-block.tsx",
    className: "border-primary/70",
    colour: "primary",
    alpha: 0.7,
    fill: "card",
    on: ["background"],
  },
  {
    name: "a sleep's block on the Day grid",
    file: "features/history/sleep-block.tsx",
    className: "border-muted-foreground/70",
    colour: "muted-foreground",
    alpha: 0.7,
    on: ["background"],
  },
  {
    name: "a feed's bar on the Week view",
    file: "features/history/week-marks.tsx",
    className: "border-primary/65",
    colour: "primary",
    alpha: 0.65,
    on: ["background", "card"],
  },
  {
    name: "a sleep's stripe on the Week view",
    file: "features/history/week-marks.tsx",
    className: "bg-muted-foreground/70",
    colour: "muted-foreground",
    alpha: 0.7,
    on: ["card"],
  },
  {
    name: "a diaper's dot on the Week view",
    file: "features/history/week-marks.tsx",
    className: "bg-foreground/55",
    colour: "foreground",
    alpha: 0.55,
    on: ["card"],
  },
]

const sourceFiles = readdirSync(SOURCE, { recursive: true, encoding: "utf8" }).filter((path) =>
  /\.(tsx?|css)$/u.test(path),
)

describe("the contrast helper", () => {
  test("matches WCAG's own figures", () => {
    expect(contrast([1, 1, 1], [0, 0, 0])).toBeCloseTo(21, 5)
    expect(contrast([0x76 / 255, 0x76 / 255, 0x76 / 255], [1, 1, 1])).toBeCloseTo(4.54, 2)
    expect(srgbOfOklch(1, 0, 0).map((channel) => Math.round(channel * 255))).toEqual([255, 255, 255])
    expect(srgbOfOklch(0.627_96, 0.257_68, 29.2339).map((channel) => Math.round(channel * 255))).toEqual([255, 0, 0])
  })
})

describe.each(MARKS)("$name", ({ file, className, colour, alpha, on, fill }) => {
  test(`is drawn with ${className}`, () => {
    expect(usesClass(read(file), className)).toBe(true)
  })

  test.each(
    on.flatMap((under) => [
      { under, theme: LIGHT, scheme: "light" },
      { under, theme: DARK, scheme: "dark" },
    ]),
  )("reaches 3:1 on $under in $scheme", ({ under, theme }) => {
    const behind = utilityColour(under, theme)
    const beneath = utilityColour(fill ?? under, theme)
    expect(contrast(over(utilityColour(colour, theme), alpha, beneath), behind)).toBeGreaterThanOrEqual(3)
  })
})

const FADED_FOCUS =
  /\b(?:ring|outline)-ring\/\d+|\bfocus(?:-visible|-within)?(?:\/[a-z-]+)?:(?:ring|outline|border)-[a-z-]+\/\d+/u

test("no focus ring or outline is faded", () => {
  const faded = sourceFiles.filter((path) => FADED_FOCUS.test(read(path)))
  expect(faded).toEqual([])
})

const FADED_INVALID_BORDER = /\baria-invalid:border-[a-z-]+\/\d+/u

test("no invalid border is faded", () => {
  const faded = sourceFiles.filter((path) => FADED_INVALID_BORDER.test(read(path)))
  expect(faded).toEqual([])
})
