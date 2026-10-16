import { useState } from "react"
import type { Retry } from "../api/retry.ts"
import { Button } from "../components/ui/button.tsx"

interface NotLoadedProps {
  readonly failed: boolean
  readonly message: string
  readonly retry: Retry
}

export const NotLoaded = ({ failed, message, retry }: NotLoadedProps) => {
  const [retrying, setRetrying] = useState(false)
  if (!failed && !(retrying && retry.running)) return <output className="text-muted-foreground">Loading…</output>
  return (
    <div className="flex flex-col items-start gap-3">
      <output className="text-muted-foreground">{message}</output>
      <Button
        variant="outline"
        size="lg"
        disabled={retry.running}
        focusableWhenDisabled
        onClick={() => {
          setRetrying(true)
          retry.run()
        }}
      >
        {retry.running ? "Trying again…" : "Try again"}
      </Button>
    </div>
  )
}
