import { useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import { cachedEntry } from "../../api/entry-cache.ts"
import { useMe } from "../../api/hooks.ts"
import { Sheet } from "../../sheets/sheet.tsx"
import { useSheets } from "../../sheets/sheets-context.ts"
import { displayOf } from "../today/display.ts"
import { EditFeedForm } from "./edit-feed-form.tsx"
import { editFeedTitle } from "./feed-edit.ts"
import { useCachedEntry } from "./use-cached-entry.ts"

const EditFeedContent = () => {
  const sheets = useSheets()
  const { data: me } = useMe()
  const cached = useCachedEntry(sheets.editing)
  const [shown, setShown] = useState({ entry: cached, taken: 0 })
  if (me === undefined) return null
  if (shown.entry?.kind !== "feed") return <p className="text-sm text-muted-foreground">This feed was deleted.</p>
  return (
    <EditFeedForm
      key={shown.taken}
      feed={shown.entry.feed}
      display={displayOf(me.household)}
      onUseTheirs={(entry) => setShown(({ taken }) => ({ entry, taken: taken + 1 }))}
    />
  )
}

export const EditFeedSheet = () => {
  const sheets = useSheets()
  const queryClient = useQueryClient()
  const [title, setTitle] = useState({ opened: -1, text: "Edit feed" })
  if (sheets.open === "editFeed" && sheets.editing !== null && title.opened !== sheets.opened) {
    setTitle({ opened: sheets.opened, text: editFeedTitle(cachedEntry(queryClient, sheets.editing)) })
  }
  return (
    <Sheet sheet="editFeed" title={title.text}>
      <EditFeedContent />
    </Sheet>
  )
}
