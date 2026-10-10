import type { LucideIcon } from "lucide-react"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "../components/ui/empty.tsx"
import { Page } from "./page.tsx"

export const ComingSoon = ({ title, Icon, description }: { title: string; Icon: LucideIcon; description: string }) => (
  <Page title={title}>
    <Empty className="border">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <Icon aria-hidden="true" />
        </EmptyMedia>
        <EmptyTitle>Coming soon</EmptyTitle>
        <EmptyDescription>{description}</EmptyDescription>
      </EmptyHeader>
    </Empty>
  </Page>
)
