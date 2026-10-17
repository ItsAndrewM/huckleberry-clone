import { type ReactNode, useRef, useState } from "react"
import { useConnectivity } from "../api/hooks.ts"
import { type FocusHome, focusOnClosing, homeOf, NO_HOME } from "./focus-home.ts"
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
import { useLastPressed } from "./use-last-pressed.ts"
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
  const pressed = useLastPressed()
  const home = useRef<FocusHome>(NO_HOME)
  const rememberOpener = () => {
    if (state.open === null) home.current = homeOf(pressed.current ?? document.activeElement)
  }
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
    show: (sheet, record) => {
      rememberOpener()
      setState((current) => shownState(current, sheet, record ?? null))
    },
    showAt: (sheet, time, record) => {
      rememberOpener()
      setState((current) => shownState(current, sheet, record ?? null, time))
    },
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
    focusOnClose: (sheet) => focusOnClosing(state.open, sheet, home.current),
  }
  return <SheetsContext value={sheets}>{children}</SheetsContext>
}
