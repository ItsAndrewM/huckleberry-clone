import { PlusIcon } from "lucide-react"
import { Button } from "../../components/ui/button.tsx"
import { BottleEditor } from "./bottle-editor.tsx"
import { linksTo } from "./feed-faults.ts"
import { SideEditor } from "./side-editor.tsx"
import type { FeedEditor } from "./use-feed-editor.ts"

interface FeedPartsEditorProps {
  readonly editor: FeedEditor
  readonly issueId: string
}

export const FeedPartsEditor = ({ editor, issueId }: FeedPartsEditorProps) => {
  const { draft, zone, now, unit } = editor
  const linksOf = (key: string) => linksTo(issueId, editor.faults.get(key) ?? [])
  return (
    <>
      {draft.sides.map(({ key, fields }, index) => (
        <SideEditor
          key={key}
          name={`Side ${index + 1}`}
          fields={fields}
          links={linksOf(key)}
          zone={zone}
          now={now}
          onChange={(changed) => editor.setSide(key, changed)}
          onRemove={() => editor.remove(key)}
        />
      ))}
      {draft.bottles.map(({ key, fields }, index) => (
        <BottleEditor
          key={key}
          name={`Bottle ${index + 1}`}
          fields={fields}
          links={linksOf(key)}
          unit={unit}
          zone={zone}
          now={now}
          onChange={(changed) => editor.setBottle(key, changed)}
          onRemove={() => editor.remove(key)}
        />
      ))}
      <div className="grid grid-cols-2 gap-2">
        <Button variant="outline" size="lg" onClick={editor.addSide}>
          <PlusIcon aria-hidden="true" />
          Add a side
        </Button>
        <Button variant="outline" size="lg" onClick={editor.addBottle}>
          <PlusIcon aria-hidden="true" />
          Add a bottle
        </Button>
      </div>
    </>
  )
}
