import { focusManager, useQueryClient } from "@tanstack/react-query"
import { useEffect, useEffectEvent } from "react"
import { useApp } from "../app-context.ts"
import { checkOfflineCopy, pageBuild } from "../features/settings/offline-copy.ts"
import { useSheets } from "../sheets/sheets-context.ts"
import { isIdle, returnToApp } from "./new-version.ts"

const BUILD = pageBuild(document)

export const NewVersionOnReturn = () => {
  const sheets = useSheets()
  const queryClient = useQueryClient()
  const { updates } = useApp()
  const idle = useEffectEvent(() => isIdle(sheets, document, queryClient.isMutating()))
  const returned = useEffectEvent((build: string) =>
    returnToApp({
      idle: () => idle(),
      online: () => navigator.onLine,
      newerSaved: () =>
        checkOfflineCopy(caches, build, updates.changes() > 0).then(
          (copy) => copy === "newer",
          () => false,
        ),
      reload: () => window.location.reload(),
      check: updates.check,
    }),
  )
  useEffect(function switchOnReturn() {
    if (BUILD === null) return
    const build = BUILD
    return focusManager.subscribe((focused) => {
      if (focused) void returned(build)
    })
  }, [])
  return null
}
