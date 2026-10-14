import { useQuery } from "@tanstack/react-query"
import { checkOfflineCopy, type OfflineCopy, pageBuild } from "./offline-copy.ts"
import { SettingsSection } from "./settings-section.tsx"

const CHECK_AGAIN_MS = 5_000
const BUILD = pageBuild(document)

const STATUS = {
  saved: "Saved for this version.",
  older: "An older version. It updates while the app is open online.",
  newer: "A newer version is saved. It opens when you next come back to the app.",
  none: "Not saved yet.",
} satisfies Record<OfflineCopy, string>

const statusOf = (copy: OfflineCopy | undefined, failed: boolean) => {
  if (failed) return "Couldn't be checked on this phone."
  return copy === undefined ? "Checking…" : STATUS[copy]
}

const OfflineCopyStatus = ({ build }: { readonly build: string }) => {
  const { data, isError } = useQuery({
    queryKey: ["offline-copy", build],
    queryFn: () => checkOfflineCopy(caches, build, false),
    refetchInterval: ({ state }) => (state.data === "saved" ? false : CHECK_AGAIN_MS),
  })
  return (
    <SettingsSection
      titleId="offline-copy-label"
      title="Offline copy"
      hint="What the app opens with when there's no connection."
    >
      <p className="text-base">{statusOf(data, isError)}</p>
    </SettingsSection>
  )
}

export const OfflineCopySection = () => (BUILD === null ? null : <OfflineCopyStatus build={BUILD} />)
