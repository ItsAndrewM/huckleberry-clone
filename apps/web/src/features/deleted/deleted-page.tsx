import { RECENTLY_DELETED_DAYS } from "@bt/contracts"
import { Link } from "@tanstack/react-router"
import { ChevronLeftIcon } from "lucide-react"
import { useConnectivity, useDeleted, useMe } from "../../api/hooks.ts"
import { retryOf } from "../../api/retry.ts"
import { useHousehold } from "../../sheets/use-household.ts"
import { NotLoaded } from "../../shell/not-loaded.tsx"
import { Page } from "../../shell/page.tsx"
import { DeletedList } from "./deleted-list.tsx"
import { deletedRows } from "./deleted-rows.ts"
import { restoreWaitReason } from "./restore.ts"

const BackToSettings = () => (
  <Link to="/settings" className="-ml-1 inline-flex h-11 items-center gap-1 self-start text-primary">
    <ChevronLeftIcon aria-hidden="true" className="size-5" />
    Settings
  </Link>
)

export const DeletedPage = () => {
  const meQuery = useMe()
  const deletedQuery = useDeleted()
  const household = useHousehold()
  const reason = restoreWaitReason(useConnectivity())
  const { data: me } = meQuery
  const { data: deleted } = deletedQuery
  return (
    <Page
      back={<BackToSettings />}
      title="Recently deleted"
      subtitle={`Entries deleted in the last ${RECENTLY_DELETED_DAYS} days.`}
    >
      {me === undefined || deleted === undefined || household === null ? (
        <NotLoaded
          failed={meQuery.isError || deletedQuery.isError}
          message="Recently deleted couldn't be loaded."
          retry={retryOf(meQuery, deletedQuery)}
        />
      ) : (
        <DeletedList rows={deletedRows(deleted, me)} household={household} reason={reason} />
      )}
    </Page>
  )
}
