import { type ReactNode, useState } from "react"
import { useConnectivity } from "../api/hooks.ts"
import type { Restored } from "./restored.ts"
import type { Sending, SheetKind } from "./sending.ts"
import { type Sheets, SheetsContext } from "./sheets-context.ts"
import {
  announcedState,
  askedBeforeSending,
  blockerFor,
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
import { useKeptControls } from "./use-kept-controls.ts"
import { useKeptEntries } from "./use-kept-entries.ts"
import { useOnTheirWay } from "./use-on-their-way.ts"
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
  const inFlight = useOnTheirWay(restored.resend)
  const online = useConnectivity() === "online"
  useHeldDrafts(state.held)
  useReopenWhenReady(state, () => setState(reopenedState))
  useKeptControls(kept.follow, state.held, inFlight.onTheirWay)
  const sweepAfter = (shownAt: number) =>
    setTimeout(() => setState((current) => expiredState(current, shownAt + TOAST_MS)), TOAST_MS)
  const mutation = useSend({
    onFailed: (failed) => {
      inFlight.settled(failed.sending)
      kept.failed(failed)
      const now = Date.now()
      setState((current) => failedState(current, failed, now))
      sweepAfter(now)
    },
    onSaved: (sending, saved) => {
      inFlight.settled(sending)
      kept.done(sending)
      const now = Date.now()
      setState((current) => savedState(current, sending, saved, now))
      sweepAfter(now)
    },
  })
  const busy = mutation.isPending ? (mutation.variables ?? null) : null
  const deliver = (sending: Sending) => {
    kept.sending(sending)
    inFlight.left(sending)
    setState((current) => sendingState(current, sending, online))
    mutation.mutate(sending)
  }
  const send = (sending: Sending) => {
    const blocker = blockerFor(state, sending)
    if (blocker === null) deliver(sending)
    else setState((current) => askedBeforeSending(current, sending, blocker))
  }
  useResumedDraft(restored.resend, deliver)
  const sheets: Sheets = {
    ...state,
    keeping: kept.keeping,
    busy,
    show: (sheet, record) => setState((current) => shownState(current, sheet, record ?? null)),
    showAt: (sheet, time, record) => setState((current) => shownState(current, sheet, record ?? null, time)),
    close: () => setState(dismissedState),
    dismiss,
    keep: () => setState(keptState),
    discard: (failed) => {
      kept.done(failed.sending)
      const waiting = state.pending
      const asksNext = discardedState(state, failed).pending !== null
      setState((current) => discardedState(current, failed))
      if (waiting !== null && !asksNext) deliver(waiting.sending)
    },
    send,
    announce: (toast) => {
      setState((current) => announcedState(current, toast))
      sweepAfter(toast.until - TOAST_MS)
    },
  }
  return <SheetsContext value={sheets}>{children}</SheetsContext>
}
