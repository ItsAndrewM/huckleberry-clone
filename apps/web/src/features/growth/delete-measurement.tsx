import { Trash2Icon } from "lucide-react"
import { useState } from "react"
import { Button } from "../../components/ui/button.tsx"

interface DeleteMeasurementProps {
  readonly cleared: boolean
  readonly onDelete: () => void
}

export const DeleteMeasurement = ({ cleared, onDelete }: DeleteMeasurementProps) => {
  const [asked, setAsked] = useState(false)
  if (!asked && !cleared) {
    return (
      <Button variant="ghost" size="lg" className="text-destructive" onClick={() => setAsked(true)}>
        <Trash2Icon aria-hidden="true" />
        Delete measurement
      </Button>
    )
  }
  return (
    <div className="flex flex-col gap-3 rounded-lg bg-destructive/10 p-3">
      <p className="text-sm">
        {cleared ? "Every value is cleared. Delete this measurement?" : "Delete this measurement?"}
      </p>
      <div className="flex gap-2">
        <Button variant="destructive" size="lg" className="flex-1" onClick={onDelete}>
          Delete
        </Button>
        {cleared ? null : (
          <Button variant="outline" size="lg" className="flex-1" onClick={() => setAsked(false)}>
            Keep it
          </Button>
        )}
      </div>
    </div>
  )
}
