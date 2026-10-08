const EXACT_VERSION = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/
const CATALOG_ENTRY = /^\s+("[^"]*"|'[^']*'|[^\s:]+):\s*(.*?)\s*(?:#.*)?$/
const BLOCK_HEADING = /^(?:"([^"]*)"|'([^']*)'|([^\s"'?{[][^:]*?))\s*:$/
const WORKSPACE_SPECS = new Set(["catalog:", "workspace:*"])
const DEPENDENCY_FIELDS = ["dependencies", "devDependencies", "optionalDependencies", "peerDependencies"] as const

const unquote = (text: string) => text.replace(/^(["'])(.*)\1$/, "$2")

export const catalogViolations = (workspaceYaml: string): string[] => {
  const violations: string[] = []
  let inCatalog = false
  for (const line of workspaceYaml.split("\n")) {
    if (line.trim() === "" || line.trim().startsWith("#")) continue
    if (/^\S/.test(line)) {
      const heading = line.replace(/\s+#.*$/, "").trimEnd()
      const key = BLOCK_HEADING.exec(heading)
      inCatalog = key !== null && (key[1] ?? key[2] ?? key[3]) === "catalog"
      if (!inCatalog && /\bcatalogs?\b/.test(heading)) violations.push(`unreadable catalog syntax: ${heading}`)
      continue
    }
    if (!inCatalog) continue
    const [, name = line.trim(), value = ""] = CATALOG_ENTRY.exec(line) ?? []
    const version = unquote(value)
    if (!EXACT_VERSION.test(version)) violations.push(`catalog ${unquote(name)}: ${version || "(no version)"}`)
  }
  return violations
}

export const manifestViolations = (file: string, manifest: Record<string, unknown>): string[] =>
  DEPENDENCY_FIELDS.flatMap((field) =>
    Object.entries((manifest[field] ?? {}) as Record<string, string>)
      .filter(([, spec]) => !WORKSPACE_SPECS.has(spec))
      .map(([name, spec]) => `${file} ${field}.${name}: ${spec}`),
  )
