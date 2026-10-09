import { writeFileSync } from "node:fs"
import { apiDocument } from "../packages/contracts/src/openapi.ts"

writeFileSync(new URL("../docs/api.json", import.meta.url), apiDocument())
