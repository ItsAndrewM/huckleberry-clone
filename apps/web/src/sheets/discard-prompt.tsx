import { Button } from "../components/ui/button.tsx"
import { discardQuestion } from "./discard-question.ts"
import type { Failed } from "./sending.ts"
import { useSheets } from "./sheets-context.ts"
import { useHousehold } from "./use-household.ts"

const focusOnArrival = (button: HTMLButtonElement | null) => button?.focus()

export const DiscardPrompt = ({ failed }: { readonly failed: Failed }) => {
  const sheets = useSheets()
  const household = useHousehold()
  return (
    <div role="alert" className="flex flex-col gap-3">
      <p className="text-base">{discardQuestion(failed.sending, household)}</p>
      <Button variant="destructive" size="lg" onClick={() => sheets.discard(failed)}>
        Discard
      </Button>
      <Button ref={focusOnArrival} variant="outline" size="lg" onClick={sheets.keep}>
        Keep
      </Button>
    </div>
  )
}
