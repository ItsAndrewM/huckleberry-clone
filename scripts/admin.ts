import { homedir } from "node:os"
import { fileURLToPath } from "node:url"
import { caregiverFromArgs, emailChangeFromArgs } from "./admin-caregiver.ts"
import { exportFileFromArgs, saveExport } from "./admin-export.ts"
import { restoreFromArgs } from "./admin-pitr.ts"
import { adminRequest, seedFromArgs } from "./admin-seed.ts"

const USAGE = `Usage: pnpm admin household:seed --name <name> --time-zone <IANA zone>
  --caregiver <email=Display Name> [--caregiver <email=Display Name>]
  --child-name <name> --birth-date <YYYY-MM-DD> --sex <female|male> --gestational-age-days <days>
       pnpm admin caregiver:disable <email>
       pnpm admin caregiver:enable <email>
       pnpm admin caregiver:set-email <current email> <new email>
       pnpm admin pitr:bookmark
       pnpm admin pitr:restore <bookmark>
       pnpm admin pitr:restore --at <ISO time, like 2026-10-10T18:00:00Z>
       pnpm admin export <file>`

const COMMANDS = new Map([
  ["household:seed", (args: string[]) => adminRequest(process.env, "/api/admin/household", seedFromArgs(args))],
  [
    "caregiver:disable",
    (args: string[]) => adminRequest(process.env, "/api/admin/caregiver/disable", caregiverFromArgs(args)),
  ],
  [
    "caregiver:enable",
    (args: string[]) => adminRequest(process.env, "/api/admin/caregiver/enable", caregiverFromArgs(args)),
  ],
  [
    "caregiver:set-email",
    (args: string[]) => adminRequest(process.env, "/api/admin/caregiver/set-email", emailChangeFromArgs(args)),
  ],
  ["pitr:bookmark", () => adminRequest(process.env, "/api/admin/pitr/bookmark")],
  ["pitr:restore", (args: string[]) => adminRequest(process.env, "/api/admin/pitr/restore", restoreFromArgs(args))],
])

const [command = "", ...args] = process.argv.slice(2)
if (command === "export") {
  const places = { cwd: process.cwd(), home: homedir(), checkout: fileURLToPath(new URL("../", import.meta.url)) }
  console.log(await saveExport(process.env, exportFileFromArgs(args, places)))
  process.exit(0)
}
const requestFor = COMMANDS.get(command)
if (requestFor === undefined) {
  console.error(USAGE)
  process.exit(2)
}

const response = await fetch(requestFor(args))
console.log(`${response.status} ${await response.text()}`)
if (!response.ok) process.exit(1)
