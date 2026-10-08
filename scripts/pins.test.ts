import { describe, expect, it } from "vitest"
import { catalogViolations, manifestViolations } from "./pins.ts"

const workspace = (catalogLines: string) =>
  `packages:\n  - apps/*\n  - packages/*\n\ncatalog:\n${catalogLines}\nonlyBuiltDependencies:\n  - esbuild\n`

describe("catalogViolations", () => {
  it("accepts exact versions, quoted or not, with or without a trailing comment", () => {
    const yaml = workspace(
      '  "@biomejs/biome": 2.5.15\n  effect: "4.0.1"\n  jose: \'6.2.12\' # pinned\n  workers-types: 5.20261006.1\n  pre: 1.0.0-alpha.1',
    )
    expect(catalogViolations(yaml)).toEqual([])
  })

  it.each(['"^8.3.3"', "'~8.3.3'", '">=8.3.3"', "8.x", "latest", '"*"', "^8.3.3", ""])("rejects vite: %s", (value) => {
    expect(catalogViolations(workspace(`  vite: ${value}`))).toHaveLength(1)
  })

  it("still reads the catalog when its heading carries a comment", () => {
    expect(catalogViolations("catalog: # pinned versions\n  vite: ^8.3.3\n")).toEqual(["catalog vite: ^8.3.3"])
  })

  it("keeps reading the catalog past a comment at column 0", () => {
    expect(catalogViolations("catalog:\n  effect: 4.0.1\n# runtime\n  vite: ^8.3.3\n")).toEqual([
      "catalog vite: ^8.3.3",
    ])
  })

  it.each(["catalog :", '"catalog":', "'catalog' :"])("reads the catalog under the heading %s", (heading) => {
    expect(catalogViolations(`${heading}\n  vite: ^8.3.3\n`)).toEqual(["catalog vite: ^8.3.3"])
  })

  it.each([
    "catalog: { vite: ^8.3.3 }",
    "catalogs:\n  react19:\n    react: ^19.0.0",
    "? catalog\n:\n  vite: ^8.3.3",
    '{"catalog": {"vite": "^8.3.3"}}',
  ])("fails closed on catalog syntax it cannot read: %s", (yaml) => {
    expect(catalogViolations(`${yaml}\n`)).toHaveLength(1)
  })

  it("leaves other top-level keys that start with catalog alone", () => {
    expect(catalogViolations("catalogMode: strict\ncatalog:\n  vite: 8.3.3\n")).toEqual([])
  })

  it("reads only the catalog block", () => {
    expect(catalogViolations("packages:\n  - apps/*\nonlyBuiltDependencies:\n  - esbuild\n")).toEqual([])
  })
})

describe("manifestViolations", () => {
  it("accepts catalog: and workspace:* in every dependency field", () => {
    const manifest = {
      dependencies: { react: "catalog:" },
      devDependencies: { "@bt/domain": "workspace:*" },
      optionalDependencies: { fsevents: "catalog:" },
      peerDependencies: { vite: "catalog:" },
    }
    expect(manifestViolations("apps/web/package.json", manifest)).toEqual([])
  })

  it.each(["19.3.0", ">=19.3.0", "19.x", "latest", "^19.3.0", "workspace:^"])("rejects react: %s", (spec) => {
    expect(manifestViolations("apps/web/package.json", { dependencies: { react: spec } })).toEqual([
      `apps/web/package.json dependencies.react: ${spec}`,
    ])
  })

  it("ignores manifests with no dependencies", () => {
    expect(manifestViolations("packages/domain/package.json", { name: "@bt/domain" })).toEqual([])
  })
})
