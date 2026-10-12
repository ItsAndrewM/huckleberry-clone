import { RECENTLY_DELETED_DAYS } from "@bt/contracts"
import { Link } from "@tanstack/react-router"
import { ChevronRightIcon } from "lucide-react"
import { buttonVariants } from "../../components/ui/button.tsx"
import { SettingsSection } from "./settings-section.tsx"

export const DeletedSection = () => (
  <SettingsSection
    titleId="deleted-label"
    title="Recently deleted"
    hint={`Entries deleted in the last ${RECENTLY_DELETED_DAYS} days can be restored.`}
  >
    <Link to="/settings/deleted" className={buttonVariants({ variant: "secondary", size: "lg" })}>
      See deleted entries
      <ChevronRightIcon aria-hidden="true" />
    </Link>
  </SettingsSection>
)
