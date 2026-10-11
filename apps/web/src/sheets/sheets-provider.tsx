import { type ReactNode, useState } from "react"
import { useConnectivity } from "../api/hooks.ts"
import { type Draft, draftStorage, dropDraft } from "./drafts.ts"
import { isHeld } from "./held.ts"
import type { Sending } from "./sending.ts"
import { type Sheets, SheetsContext } from "./sheets-context.ts"
import {
  discardedState,
  dismissedState,
  expiredState,
  failedState,
  keptState,
  restoredState,
  savedState,
  sendingState,
  shownState,
} from "./sheets-state.ts"
import { TOAST_MS } from "./undo.ts"
import { useResumedDraft } from "./use-resumed-draft.ts"
import { useSend } from "./use-send.ts"

interface SheetsProviderProps {
  readonly draft: Draft | null
  readonly children: ReactNode
}

const dropDraftOf = ({ action }: Sending) => dropDraft(draftStorage, action.payload.actionId)

export const SheetsProvider = ({ draft, children }: SheetsProviderProps) => {
  const [state, setState] = useState(() => restoredState(draft, Date.now(), crypto.randomUUID()))
  const online = useConnectivity() === "online"
  const sweepAfter = (shownAt: number) =>
    setTimeout(() => setState((current) => expiredState(current, shownAt + TOAST_MS)), TOAST_MS)
  const mutation = useSend({
    onFailed: (failed) => {
      const now = Date.now()
      setState((current) => failedState(current, failed, now))
      sweepAfter(now)
    },
    onSaved: (sending, saved) => {
      const now = Date.now()
      setState((current) => savedState(current, sending, saved, now))
      sweepAfter(now)
    },
  })
  const send = (sending: Sending) => {
    if (isHeld(state.held, sending)) dropDraftOf(sending)
    setState((current) => sendingState(current, sending, online))
    mutation.mutate(sending)
  }
  useResumedDraft(draft, send)
  const sheets: Sheets = {
    ...state,
    busy: mutation.isPending ? (mutation.variables ?? null) : null,
    show: (sheet) => setState((current) => shownState(current, sheet)),
    close: () => setState(dismissedState),
    keep: () => setState(keptState),
    discard: (failed) => {
      dropDraftOf(failed.sending)
      setState((current) => discardedState(current, failed))
    },
    send,
  }
  return <SheetsContext value={sheets}>{children}</SheetsContext>
}
