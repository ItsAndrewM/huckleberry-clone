import { type ReactNode, useState } from "react"
import { useConnectivity } from "../api/hooks.ts"
import type { Restored } from "./restored.ts"
import type { Sending, SheetKind } from "./sending.ts"
import { type Sheets, SheetsContext } from "./sheets-context.ts"
import {
  announcedState,
  discardedState,
  dismissedKindState,
  dismissedState,
  expiredState,
  failedState,
  keptState,
  reopenedState,
  restoredState,
  savedState,
  sendingState,
  shownState,
} from "./sheets-state.ts"
import { TOAST_MS } from "./undo.ts"
import { useHeldDrafts } from "./use-held-drafts.ts"
import { useKeptEntries } from "./use-kept-entries.ts"
import { useReopenWhenReady } from "./use-reopen.ts"
import { useResumedDraft } from "./use-resumed-draft.ts"
import { useSend } from "./use-send.ts"

interface SheetsProviderProps {
  readonly restored: Restored
  readonly children: ReactNode
}

export const SheetsProvider = ({ restored, children }: SheetsProviderProps) => {
  const [state, setState] = useState(() => restoredState(restored.held))
  const [dismiss] = useState(() => (sheet: SheetKind) => setState((current) => dismissedKindState(current, sheet)))
  const kept = useKeptEntries(restored)
  const online = useConnectivity() === "online"
  useHeldDrafts(state.held)
  useReopenWhenReady(state, () => setState(reopenedState))
  const sweepAfter = (shownAt: number) =>
    setTimeout(() => setState((current) => expiredState(current, shownAt + TOAST_MS)), TOAST_MS)
  const mutation = useSend({
    onFailed: (failed) => {
      kept.failed(failed)
      const now = Date.now()
      setState((current) => failedState(current, failed, now))
      sweepAfter(now)
    },
    onSaved: (sending, saved) => {
      kept.done(sending)
      const now = Date.now()
      setState((current) => savedState(current, sending, saved, now))
      sweepAfter(now)
    },
  })
  const send = (sending: Sending) => {
    kept.sending(sending)
    setState((current) => sendingState(current, sending, online))
    mutation.mutate(sending)
  }
  useResumedDraft(restored.resend, send)
  const sheets: Sheets = {
    ...state,
    keeping: kept.keeping,
    busy: mutation.isPending ? (mutation.variables ?? null) : null,
    show: (sheet, record) => setState((current) => shownState(current, sheet, record ?? null)),
    showAt: (sheet, time, record) => setState((current) => shownState(current, sheet, record ?? null, time)),
    close: () => setState(dismissedState),
    dismiss,
    keep: () => setState(keptState),
    discard: (failed) => {
      kept.done(failed.sending)
      setState((current) => discardedState(current, failed))
    },
    send,
    announce: (toast) => {
      setState((current) => announcedState(current, toast))
      sweepAfter(toast.until - TOAST_MS)
    },
  }
  return <SheetsContext value={sheets}>{children}</SheetsContext>
}
