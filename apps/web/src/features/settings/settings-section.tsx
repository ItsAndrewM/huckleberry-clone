import type { ReactNode } from "react"

interface SettingsSectionProps {
  readonly titleId: string
  readonly title: string
  readonly hint?: string | undefined
  readonly children: ReactNode
}

export const SettingsSection = ({ titleId, title, hint, children }: SettingsSectionProps) => (
  <section className="flex flex-col gap-3">
    <div className="flex flex-col gap-1">
      <h2 id={titleId} className="text-sm font-medium text-muted-foreground">
        {title}
      </h2>
      {hint === undefined ? null : <p className="text-sm text-muted-foreground">{hint}</p>}
    </div>
    {children}
  </section>
)
