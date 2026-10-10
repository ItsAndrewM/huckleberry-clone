import { parseArgs } from "node:util"

export interface CaregiverJson {
  readonly email: string
}

export interface EmailChangeJson {
  readonly email: string
  readonly newEmail: string
}

const emailOf = (value: string) => value.trim().toLowerCase()

export const caregiverFromArgs = (args: ReadonlyArray<string>): CaregiverJson => {
  const { positionals } = parseArgs({ args: [...args], allowPositionals: true, strict: true })
  const [email, ...rest] = positionals
  if (email === undefined || email.trim() === "" || rest.length > 0) throw new Error("Give one caregiver email")
  return { email: emailOf(email) }
}

export const emailChangeFromArgs = (args: ReadonlyArray<string>): EmailChangeJson => {
  const { positionals } = parseArgs({ args: [...args], allowPositionals: true, strict: true })
  const [email, newEmail, ...rest] = positionals
  if (
    email === undefined ||
    newEmail === undefined ||
    rest.length > 0 ||
    [email, newEmail].some((value) => value.trim() === "")
  ) {
    throw new Error("Give the caregiver's current email, then the new one")
  }
  return { email: emailOf(email), newEmail: emailOf(newEmail) }
}
