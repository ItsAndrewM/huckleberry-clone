import { Button } from "../../components/ui/button.tsx"
import { KIND_ICONS } from "./kind-icons.ts"

const ACTIONS = [
  { label: "Bottle", Icon: KIND_ICONS.bottle },
  { label: "Nursing", Icon: KIND_ICONS.nursing },
  { label: "Diaper", Icon: KIND_ICONS.diaper },
] as const

export const QuickActions = () => (
  <div className="fixed inset-x-0 bottom-[calc(3.5rem+env(safe-area-inset-bottom))] border-t bg-background/95 backdrop-blur-sm">
    <section aria-label="Log" className="mx-auto flex max-w-lg gap-2 px-4 py-2">
      {ACTIONS.map(({ label, Icon }) => (
        <Button key={label} variant="secondary" size="lg" className="h-12 flex-1" disabled>
          <Icon aria-hidden="true" />
          {label}
        </Button>
      ))}
    </section>
  </div>
)
