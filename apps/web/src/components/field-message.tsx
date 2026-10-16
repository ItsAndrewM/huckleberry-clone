import { cn } from "cn"
import type { ReactNode } from "react"

export interface MessageLink {
  readonly id: string
  readonly invalid: boolean
}

interface FieldMessageProps {
  readonly id: string
  readonly className?: string
  readonly children: ReactNode
}

export const FieldMessage = ({ id, className, children }: FieldMessageProps) => (
  <p id={id} aria-live="polite" className={cn("text-sm text-destructive empty:sr-only", className)}>
    {children}
  </p>
)
