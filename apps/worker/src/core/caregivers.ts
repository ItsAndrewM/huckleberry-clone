import type { Caregiver } from "@bt/contracts"

type CaregiverRow = { id: string; email: string; display_name: string }

export type EmailChange =
  | { readonly kind: "changed"; readonly caregiverId: string }
  | { readonly kind: "unknown" }
  | { readonly kind: "taken" }

export const activeCaregiver = (sql: SqlStorage, email: string | undefined): Caregiver | undefined => {
  if (email === undefined) return undefined
  const [row] = sql
    .exec<CaregiverRow>("SELECT id, email, display_name FROM caregivers WHERE email = ? AND active = 1", email)
    .toArray()
  return row === undefined ? undefined : { id: row.id, email: row.email, displayName: row.display_name }
}

export const setCaregiverActive = (
  sql: SqlStorage,
  email: string,
  active: boolean,
  now: number,
): string | undefined => {
  const [row] = sql
    .exec<{ id: string }>(
      "UPDATE caregivers SET active = ?, updated_at = ? WHERE email = ? RETURNING id",
      active ? 1 : 0,
      now,
      email,
    )
    .toArray()
  return row?.id
}

export const setCaregiverEmail = (sql: SqlStorage, email: string, newEmail: string, now: number): EmailChange => {
  const [owner] = sql.exec<{ id: string }>("SELECT id FROM caregivers WHERE email = ?", newEmail).toArray()
  if (owner !== undefined) return { kind: "taken" }
  const [row] = sql
    .exec<{ id: string }>(
      "UPDATE caregivers SET email = ?, updated_at = ? WHERE email = ? RETURNING id",
      newEmail,
      now,
      email,
    )
    .toArray()
  return row === undefined ? { kind: "unknown" } : { kind: "changed", caregiverId: row.id }
}
