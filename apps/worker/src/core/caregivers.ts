import type { Caregiver } from "@bt/contracts"

type CaregiverRow = { id: string; email: string; display_name: string }

export const activeCaregiver = (sql: SqlStorage, email: string | undefined): Caregiver | undefined => {
  if (email === undefined) return undefined
  const [row] = sql
    .exec<CaregiverRow>("SELECT id, email, display_name FROM caregivers WHERE email = ? AND active = 1", email)
    .toArray()
  return row === undefined ? undefined : { id: row.id, email: row.email, displayName: row.display_name }
}
