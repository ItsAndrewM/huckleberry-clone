import type { ExportKind } from "../../api/export.ts"
import { type Attempt, afterRefusal, type Delivery, exportFileOf, ShareFailed } from "./export-file.ts"

const REVOKE_AFTER_MS = 60_000

const sharesFile = (file: File) => "canShare" in navigator && navigator.canShare({ files: [file] })

export const sharesKind = (kind: ExportKind) => sharesFile(exportFileOf(kind, "", "check"))

const download = (file: File): Delivery => {
  const url = URL.createObjectURL(file)
  Object.assign(document.createElement("a"), { href: url, download: file.name }).click()
  setTimeout(() => URL.revokeObjectURL(url), REVOKE_AFTER_MS)
  return "downloaded"
}

const share = async (file: File, attempt: Attempt): Promise<Delivery> => {
  try {
    await navigator.share({ files: [file] })
    return "shared"
  } catch (error) {
    const next = error instanceof DOMException ? afterRefusal(error.name, attempt) : null
    if (next === null) throw new ShareFailed("The share sheet refused the file", { cause: error })
    return next === "download" ? download(file) : next
  }
}

export const deliverFile = (file: File, attempt: Attempt): Promise<Delivery> =>
  sharesFile(file) ? share(file, attempt) : Promise.resolve(download(file))
