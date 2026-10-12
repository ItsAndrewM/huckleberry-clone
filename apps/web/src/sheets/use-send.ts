import { useMutation, useQueryClient } from "@tanstack/react-query"
import { pendIn, rollBack, settle } from "../api/optimistic.ts"
import { send } from "../api/send.ts"
import type { Saved } from "../api/send.ts"
import { useApp } from "../app-context.ts"
import type { Failed, Sending } from "./sending.ts"

export interface SendHandlers {
  readonly onFailed: (failed: Failed) => void
  readonly onSaved: (sending: Sending, saved: Saved) => void
}

export const useSend = ({ onFailed, onSaved }: SendHandlers) => {
  const { api } = useApp()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ action }: Sending) => send(api, action),
    onMutate: ({ action }) => pendIn(queryClient, action, Date.now()),
    onError: (error, sending, pended) => {
      rollBack(queryClient, sending.action, pended)
      onFailed({ sending, error })
    },
    onSuccess: (saved, sending) => {
      settle(queryClient, saved, sending.action)
      onSaved(sending, saved)
    },
  })
}
