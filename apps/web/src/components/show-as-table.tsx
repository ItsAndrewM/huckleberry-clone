import { ChevronRightIcon } from "lucide-react"
import type { ReactNode } from "react"

export const ShowAsTable = ({ children }: { readonly children: ReactNode }) => (
  <details className="group/table">
    <summary className="flex min-h-11 cursor-pointer items-center gap-1 text-sm font-medium text-primary">
      <ChevronRightIcon aria-hidden="true" className="size-4 transition-transform group-open/table:rotate-90" />
      Show as a table
    </summary>
    {children}
  </details>
)
