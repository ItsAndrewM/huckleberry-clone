import { XIcon } from "lucide-react"
import type { ReactNode } from "react"
import { Button } from "../../components/ui/button.tsx"

interface PartGroupProps {
  readonly name: string
  readonly onRemove: () => void
  readonly children: ReactNode
}

export const PartGroup = ({ name, onRemove, children }: PartGroupProps) => (
  <fieldset className="flex min-w-0 flex-col gap-3 rounded-lg border p-3">
    <legend className="sr-only">{name}</legend>
    <div className="flex items-center justify-between gap-2">
      <span aria-hidden="true" className="text-sm font-medium text-muted-foreground">
        {name}
      </span>
      <Button variant="ghost" size="icon-lg" aria-label={`Remove ${name.toLowerCase()}`} onClick={onRemove}>
        <XIcon aria-hidden="true" />
      </Button>
    </div>
    {children}
  </fieldset>
)
