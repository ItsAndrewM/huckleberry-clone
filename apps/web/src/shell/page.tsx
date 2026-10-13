import type { ReactNode } from "react"

interface PageProps {
  readonly title: string
  readonly subtitle?: string | undefined
  readonly back?: ReactNode
  readonly action?: ReactNode
  readonly children?: ReactNode
}

export const Page = ({ title, subtitle, back, action, children }: PageProps) => (
  <div className="mx-auto flex w-full max-w-lg flex-1 flex-col gap-6">
    <header className="flex items-start justify-between gap-3">
      <div className="flex flex-col gap-1">
        {back}
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {subtitle === undefined ? null : <p className="text-muted-foreground">{subtitle}</p>}
      </div>
      {action}
    </header>
    {children}
  </div>
)
