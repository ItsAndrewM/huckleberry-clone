import type { Retry } from "../api/retry.ts"
import { Button } from "../components/ui/button.tsx"

interface NotLoadedProps {
  readonly failed: boolean
  readonly message: string
  readonly retry: Retry
}

export const NotLoaded = ({ failed, message, retry }: NotLoadedProps) =>
  failed ? (
    <div className="flex flex-col items-start gap-3">
      <output className="text-muted-foreground">{message}</output>
      <Button variant="outline" size="lg" disabled={retry.running} onClick={retry.run}>
        {retry.running ? "Trying again…" : "Try again"}
      </Button>
    </div>
  ) : (
    <output className="text-muted-foreground">Loading…</output>
  )
