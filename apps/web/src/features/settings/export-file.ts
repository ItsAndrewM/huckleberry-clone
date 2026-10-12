import { Unauthorized } from "@bt/contracts"
import type { Connectivity } from "../../api/connectivity.ts"
import { AuthRequired, Offline } from "../../api/errors.ts"
import type { ExportKind } from "../../api/export.ts"

export type Attempt = "first" | "again"

export type Delivery = "shared" | "downloaded" | "cancelled" | "needs-a-tap"

export class ShareFailed extends Error {
  override readonly name = "ShareFailed"
}

const BYTE_ORDER_MARK = "\uFEFF"

const MEDIA_TYPES = { csv: "text/csv", json: "application/json" } satisfies Record<ExportKind, string>

export const exportFileName = (kind: ExportKind, date: string) => `baby-tracker-${date}.${kind}`

export const exportFileOf = (kind: ExportKind, text: string, date: string): File =>
  new File([kind === "csv" ? `${BYTE_ORDER_MARK}${text}` : text], exportFileName(kind, date), {
    type: MEDIA_TYPES[kind],
  })

export const afterRefusal = (name: string, attempt: Attempt): Delivery | "download" | null => {
  if (name === "AbortError") return "cancelled"
  if (name !== "NotAllowedError") return null
  return attempt === "first" ? "needs-a-tap" : "download"
}

export const waitReason = (connectivity: Connectivity): string | null => {
  if (connectivity === "offline") return "Exports need a connection."
  return connectivity === "auth-required" ? "Sign in to export." : null
}

export const exportFailure = (error: Error | null): string | null => {
  if (error === null) return null
  if (error instanceof Offline) return "No connection. Try again once you're back online."
  if (error instanceof AuthRequired || error instanceof Unauthorized)
    return "You're signed out. Sign in, then try again."
  if (error instanceof ShareFailed) return "The file couldn't be shared. Try again."
  return "The export couldn't be made. Try again."
}
