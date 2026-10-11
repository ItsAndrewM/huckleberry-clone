import { Button } from "../components/ui/button.tsx"
import type { Failed } from "./sending.ts"
import { useSheets } from "./sheets-context.ts"

const focusOnArrival = (button: HTMLButtonElement | null) => button?.focus()

export const DiscardPrompt = ({ failed }: { readonly failed: Failed }) => {
  const sheets = useSheets()
  return (
    <div role="alert" className="flex flex-col gap-3">
      <p className="text-base">Discard this entry?</p>
      <Button variant="destructive" size="lg" onClick={() => sheets.discard(failed)}>
        Discard
      </Button>
      <Button ref={focusOnArrival} variant="outline" size="lg" onClick={sheets.keep}>
        Keep
      </Button>
    </div>
  )
}
