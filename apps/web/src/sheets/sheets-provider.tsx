import { type ReactNode, useState } from "react"
import { useConnectivity } from "../api/hooks.ts"
import type { Sending } from "./sending.ts"
import { type Sheets, SheetsContext } from "./sheets-context.ts"
import { CLOSED, expiredState, failedState, savedState, sendingState } from "./sheets-state.ts"
import { TOAST_MS } from "./undo.ts"
import { useSend } from "./use-send.ts"

export const SheetsProvider = ({ children }: { readonly children: ReactNode }) => {
  const [state, setState] = useState(CLOSED)
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
    setState((current) => sendingState(current, sending, online))
    mutation.mutate(sending)
  }
  const sheets: Sheets = {
    ...state,
    busy: mutation.isPending ? (mutation.variables ?? null) : null,
    show: (sheet) => setState((current) => ({ ...current, open: sheet, failed: null })),
    close: () => setState((current) => ({ ...current, open: null, failed: null })),
    send,
  }
  return <SheetsContext value={sheets}>{children}</SheetsContext>
}
