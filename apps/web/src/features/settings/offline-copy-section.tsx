import { keepPreviousData, useQuery } from "@tanstack/react-query"
import { useId, useSyncExternalStore } from "react"
import { useConnectivity } from "../../api/hooks.ts"
import { useApp } from "../../app-context.ts"
import { Button } from "../../components/ui/button.tsx"
import { checkOfflineCopy, type OfflineCopy, openNowReason, pageBuild } from "./offline-copy.ts"
import { SettingsSection } from "./settings-section.tsx"

const CHECK_AGAIN_MS = 5_000
const BUILD = pageBuild(document)

const STATUS = {
  saved: "Saved for this version.",
  older: "An older version. It updates while the app is open online.",
  newer: "A newer version is saved. It opens when you next come back to the app.",
  none: "Not saved yet.",
} satisfies Record<OfflineCopy, string>

const SETTLED = new Set<OfflineCopy | undefined>(["saved", "newer"])

const statusOf = (copy: OfflineCopy | undefined, failed: boolean) => {
  if (failed) return "Couldn't be checked on this phone."
  return copy === undefined ? "Checking…" : STATUS[copy]
}

const NewerCopy = () => {
  const reasonId = useId()
  const reason = openNowReason(useConnectivity())
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-3">
        <p className="text-base">{STATUS.newer}</p>
        <Button
          size="lg"
          aria-label="Open it now, the newer version"
          disabled={reason !== null}
          aria-describedby={reason === null ? undefined : reasonId}
          onClick={() => window.location.reload()}
        >
          Open it now
        </Button>
      </div>
      {reason === null ? null : (
        <p id={reasonId} className="text-sm text-muted-foreground">
          {reason}
        </p>
      )}
    </div>
  )
}

const OfflineCopyStatus = ({ build }: { readonly build: string }) => {
  const { updates } = useApp()
  const changes = useSyncExternalStore(updates.subscribe, updates.changes)
  const { data, isError } = useQuery({
    queryKey: ["offline-copy", build, changes],
    queryFn: () => checkOfflineCopy(caches, build, changes > 0),
    placeholderData: keepPreviousData,
    refetchInterval: ({ state }) => (SETTLED.has(state.data) ? false : CHECK_AGAIN_MS),
  })
  return (
    <SettingsSection
      titleId="offline-copy-label"
      title="Offline copy"
      hint="What the app opens with when there's no connection."
    >
      {data === "newer" && !isError ? <NewerCopy /> : <p className="text-base">{statusOf(data, isError)}</p>}
    </SettingsSection>
  )
}

export const OfflineCopySection = () => (BUILD === null ? null : <OfflineCopyStatus build={BUILD} />)
