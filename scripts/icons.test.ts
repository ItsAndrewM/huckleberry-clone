import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { ICON_FILES, pngSize } from "./icons.ts"

const publicDir = new URL("../apps/web/public/", import.meta.url)
const read = (path: string) => readFileSync(new URL(path.replace(/^\//, ""), publicDir))

interface ManifestIcon {
  readonly src: string
  readonly sizes: string
}

const manifestIcons: ReadonlyArray<ManifestIcon> = JSON.parse(read("manifest.webmanifest").toString("utf8")).icons

describe("app icons", () => {
  it.each(ICON_FILES)("renders $file as a $size px square", ({ file, size }) => {
    expect(pngSize(read(`icons/${file}`))).toEqual({ width: size, height: size })
  })

  it.each(manifestIcons)("declares $src at the size the file has", ({ src, sizes }) => {
    const { width, height } = pngSize(read(src))
    expect(sizes).toBe(`${width}x${height}`)
  })

  it("refuses a file that isn't a PNG", () => {
    expect(() => pngSize(read("icons/icon.svg"))).toThrow("not a PNG")
  })
})
