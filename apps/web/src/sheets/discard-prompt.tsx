import { Button } from "../components/ui/button.tsx"
import { discardQuestion } from "./discard-question.ts"
import type { Failed } from "./sending.ts"
import { useSheets } from "./sheets-context.ts"
import { useHousehold } from "./use-household.ts"

const focusOnArrival = (button: HTMLButtonElement | null) => button?.focus()

interface DiscardPromptProps {
  readonly failed: Failed
  readonly onDiscard?: () => void
  readonly onKeep?: () => void
}

export const DiscardPrompt = ({ failed, onDiscard, onKeep }: DiscardPromptProps) => {
  const sheets = useSheets()
  const household = useHousehold()
  return (
    <div role="alert" className="flex flex-col gap-3">
      <p className="text-base">{discardQuestion(failed.sending, household)}</p>
      <Button variant="destructive" size="lg" onClick={onDiscard ?? (() => sheets.discard(failed))}>
        Discard
      </Button>
      <Button ref={focusOnArrival} variant="outline" size="lg" onClick={onKeep ?? sheets.keep}>
        Keep
      </Button>
    </div>
  )
}
