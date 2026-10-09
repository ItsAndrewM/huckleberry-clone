import type { ReactNode } from "react"

interface PageProps {
  readonly title: string
  readonly subtitle?: string | undefined
  readonly children?: ReactNode
}

export const Page = ({ title, subtitle, children }: PageProps) => (
  <div className="mx-auto flex w-full max-w-lg flex-col gap-6">
    <header className="flex flex-col gap-1">
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      {subtitle === undefined ? null : <p className="text-muted-foreground">{subtitle}</p>}
    </header>
    {children}
  </div>
)
