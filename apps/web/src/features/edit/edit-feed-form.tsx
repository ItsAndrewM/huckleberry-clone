import type { Feed, RecentEntry } from "@bt/contracts"
import { Button } from "../../components/ui/button.tsx"
import { DeleteEntry } from "../../sheets/delete-entry.tsx"
import type { Display } from "../today/display.ts"
import { EditFailure } from "./edit-failure.tsx"
import { feedNoun } from "./feed-edit.ts"
import { ISSUES } from "./feed-entry.ts"
import { startOf } from "./feed-move.ts"
import { FeedPartsEditor } from "./feed-parts-editor.tsx"
import { FeedStartField } from "./feed-start-field.tsx"
import { useFeedEditor } from "./use-feed-editor.ts"

interface EditFeedFormProps {
  readonly feed: Feed
  readonly display: Display
  readonly onUseTheirs: (current: RecentEntry) => void
}

export const EditFeedForm = ({ feed, display, onUseTheirs }: EditFeedFormProps) => {
  const editor = useFeedEditor(feed, display.timeZone, display.volume)
  const { checked, zone, now } = editor
  const start = startOf(editor.draft, zone)
  const issue = checked.ok ? null : checked.issue
  const emptied = issue === "nothing"
  return (
    <>
      <EditFailure sheet="editFeed" display={display} onUseTheirs={onUseTheirs} />
      {start === null ? null : (
        <FeedStartField start={start} moved={editor.moved} zone={zone} now={now} onMove={editor.moveTo} />
      )}
      <FeedPartsEditor editor={editor} />
      {issue === null || emptied ? null : <p className="text-sm text-destructive">{ISSUES[issue]}</p>}
      {emptied ? null : (
        <Button size="lg" className="h-14 text-lg" disabled={!checked.ok} onClick={editor.save}>
          Save
        </Button>
      )}
      <DeleteEntry
        noun={feedNoun(feed)}
        emptied={emptied ? "Nothing is left in this feed." : null}
        onDelete={editor.deleteFeed}
      />
    </>
  )
}
