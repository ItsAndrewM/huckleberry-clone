import type { Feed, VolumeUnit } from "@bt/contracts"
import { useState } from "react"
import { failedFor, useSheets } from "../../sheets/sheets-context.ts"
import { tapTime } from "../../sheets/tap-time.ts"
import type { When } from "../../sheets/when.ts"
import { useNow } from "../../timer/use-now.ts"
import { newBottle, newSide } from "./added-parts.ts"
import {
  type BottleFields,
  type SideFields,
  withAddedBottle,
  withAddedSide,
  withBottle,
  withoutPart,
  withSide,
} from "./feed-draft.ts"
import { feedDelete, feedEdit, feedEditSession } from "./feed-edit.ts"
import { checkedParts } from "./feed-entry.ts"
import { movedBy, movedDraft } from "./feed-move.ts"

export const useFeedEditor = (feed: Feed, zone: string, unit: VolumeUnit) => {
  const sheets = useSheets()
  const [session] = useState(() => feedEditSession(failedFor(sheets, "editFeed"), feed, zone))
  const [draft, setDraft] = useState(session.draft)
  const [moved, setMoved] = useState(0)
  const now = useNow()
  const send = (action: ReturnType<typeof feedDelete>) => {
    if (sheets.open === "editFeed") sheets.send({ sheet: "editFeed", action })
  }
  return {
    draft,
    moved,
    unit,
    zone,
    now,
    checked: checkedParts(draft, zone, now),
    setSide: (key: string, fields: SideFields) => setDraft(withSide(draft, key, fields)),
    setBottle: (key: string, fields: BottleFields) => setDraft(withBottle(draft, key, fields)),
    remove: (key: string) => setDraft(withoutPart(draft, key)),
    addSide: () => setDraft(withAddedSide(draft, crypto.randomUUID(), newSide(draft, zone, tapTime()))),
    addBottle: () => setDraft(withAddedBottle(draft, crypto.randomUUID(), newBottle(draft, zone, tapTime()))),
    moveTo: (when: When) => {
      const offset = movedBy(draft, zone, when)
      if (offset === null || offset === 0) return
      setDraft(movedDraft(draft, zone, offset))
      setMoved(moved + offset)
    },
    save: () => {
      const checked = checkedParts(draft, zone, tapTime())
      if (checked.ok) send(feedEdit(session, checked.value))
    },
    deleteFeed: () => send(feedDelete(session.target)),
  }
}

export type FeedEditor = ReturnType<typeof useFeedEditor>
