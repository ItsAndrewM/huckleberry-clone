const EXACT_VERSION = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/
const CATALOG_ENTRY = /^\s+("[^"]*"|'[^']*'|[^\s:]+):\s*(.*?)\s*(?:#.*)?$/
const BLOCK_HEADING = /^(?:"([^"]*)"|'([^']*)'|([^\s"'?{[][^:]*?))\s*:$/
const WORKSPACE_SPECS = new Set(["catalog:", "workspace:*"])
const DEPENDENCY_FIELDS = ["dependencies", "devDependencies", "optionalDependencies", "peerDependencies"] as const

export type PackageManifest = Partial<Record<(typeof DEPENDENCY_FIELDS)[number], Readonly<Record<string, string>>>>

const unquote = (text: string) => text.replace(/^(["'])(.*)\1$/, "$2")

const headingKey = (heading: string) => {
  const key = BLOCK_HEADING.exec(heading)
  return key === null ? null : (key[1] ?? key[2] ?? key[3])
}

const entryViolation = (line: string) => {
  const [, name = line.trim(), value = ""] = CATALOG_ENTRY.exec(line) ?? []
  const version = unquote(value)
  return EXACT_VERSION.test(version) ? null : `catalog ${unquote(name)}: ${version || "(no version)"}`
}

export const catalogViolations = (workspaceYaml: string): string[] => {
  const violations: string[] = []
  let inCatalog = false
  for (const line of workspaceYaml.split("\n")) {
    if (line.trim() === "" || line.trim().startsWith("#")) continue
    if (/^\S/.test(line)) {
      const heading = line.replace(/\s+#.*$/, "").trimEnd()
      inCatalog = headingKey(heading) === "catalog"
      if (!inCatalog && /\bcatalogs?\b/.test(heading)) violations.push(`unreadable catalog syntax: ${heading}`)
      continue
    }
    if (!inCatalog) continue
    const violation = entryViolation(line)
    if (violation !== null) violations.push(violation)
  }
  return violations
}

export const manifestViolations = (file: string, manifest: PackageManifest): string[] =>
  DEPENDENCY_FIELDS.flatMap((field) =>
    Object.entries<string>(manifest[field] ?? {})
      .filter(([, spec]) => !WORKSPACE_SPECS.has(spec))
      .map(([name, spec]) => `${file} ${field}.${name}: ${spec}`),
  )
