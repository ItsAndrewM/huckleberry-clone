import { caregiverFromArgs } from "./admin-caregiver.ts"
import { adminRequest, seedFromArgs } from "./admin-seed.ts"

const USAGE = `Usage: pnpm admin household:seed --name <name> --time-zone <IANA zone>
  --caregiver <email=Display Name> [--caregiver <email=Display Name>]
  --child-name <name> --birth-date <YYYY-MM-DD> --sex <female|male> --gestational-age-days <days>
       pnpm admin caregiver:disable <email>
       pnpm admin caregiver:enable <email>`

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
])

const [command = "", ...args] = process.argv.slice(2)
const requestFor = COMMANDS.get(command)
if (requestFor === undefined) {
  console.error(USAGE)
  process.exit(2)
}

const response = await fetch(requestFor(args))
console.log(`${response.status} ${await response.text()}`)
if (!response.ok) process.exit(1)
