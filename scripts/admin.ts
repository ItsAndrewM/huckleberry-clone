import { adminRequest, seedFromArgs } from "./admin-seed.ts"

const USAGE = `Usage: pnpm admin household:seed --name <name> --time-zone <IANA zone>
  --caregiver <email=Display Name> [--caregiver <email=Display Name>]
  --child-name <name> --birth-date <YYYY-MM-DD> --sex <female|male> --gestational-age-days <days>`

const [command, ...args] = process.argv.slice(2)
if (command !== "household:seed") {
  console.error(USAGE)
  process.exit(2)
}

const response = await fetch(adminRequest(process.env, "/api/admin/household", seedFromArgs(args)))
console.log(`${response.status} ${await response.text()}`)
if (!response.ok) process.exit(1)
