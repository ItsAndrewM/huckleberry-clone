import { cn } from "cn"
import type { ReactNode } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card.tsx"
import { Parts } from "./parts.tsx"

interface StatusCardProps {
  readonly label: ReactNode
  readonly value?: string | undefined
  readonly detail: ReadonlyArray<string>
  readonly running?: boolean
}

export const StatusCard = ({ label, value, detail, running = false }: StatusCardProps) => (
  <Card>
    <CardHeader>
      <CardTitle className="flex items-center gap-2 text-sm text-muted-foreground">{label}</CardTitle>
    </CardHeader>
    <CardContent className="flex flex-col gap-1">
      {value === undefined ? null : (
        <p
          role={running ? "timer" : undefined}
          className={cn("text-5xl font-semibold tracking-tight tabular-nums", running && "text-primary")}
        >
          {value}
        </p>
      )}
      <p className="text-sm text-muted-foreground">
        <Parts parts={detail} />
      </p>
    </CardContent>
  </Card>
)
