import { Button } from "../components/ui/button.tsx"
import { offersOk, recoveryOf } from "./recovery.ts"
import type { Failed } from "./sending.ts"
import { useSheets } from "./sheets-context.ts"
import { tapTime } from "./tap-time.ts"

interface RecoveryButtonsProps {
  readonly failed: Failed
  readonly about?: string | undefined
}

export const RecoveryButtons = ({ failed, about }: RecoveryButtonsProps) => {
  const sheets = useSheets()
  const recovery = recoveryOf(failed)
  const ok = offersOk(failed)
  if (recovery === null && !ok) return null
  return (
    <div className="flex gap-2">
      {recovery === null ? null : (
        <Button
          variant="outline"
          size="lg"
          className="flex-1"
          aria-label={about === undefined ? undefined : `${recovery.label}, ${about}`}
          onClick={() => {
            sheets.discard(failed)
            sheets.send(recovery.sendingAt({ at: tapTime(), actionId: crypto.randomUUID() }))
          }}
        >
          {recovery.label}
        </Button>
      )}
      {ok ? (
        <Button variant="ghost" size="lg" className="flex-1" onClick={() => sheets.discard(failed)}>
          OK
        </Button>
      ) : null}
    </div>
  )
}
