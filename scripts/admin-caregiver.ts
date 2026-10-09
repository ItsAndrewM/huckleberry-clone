import { parseArgs } from "node:util"

export interface CaregiverJson {
  readonly email: string
}

export const caregiverFromArgs = (args: ReadonlyArray<string>): CaregiverJson => {
  const { positionals } = parseArgs({ args: [...args], allowPositionals: true, strict: true })
  const [email, ...rest] = positionals
  if (email === undefined || email.trim() === "" || rest.length > 0) throw new Error("Give one caregiver email")
  return { email: email.trim().toLowerCase() }
}
