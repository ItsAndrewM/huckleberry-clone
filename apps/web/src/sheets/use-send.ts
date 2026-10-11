import { type Me, queryKeys, type Today } from "@bt/contracts"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { send } from "../api/send.ts"
import type { Saved } from "../api/send.ts"
import { pendingToday, savedToday } from "../api/today-cache.ts"
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
    onMutate: async ({ action }) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.today })
      const before = queryClient.getQueryData<Today>(queryKeys.today)
      const me = queryClient.getQueryData<Me>(queryKeys.me)
      if (before !== undefined && me !== undefined) {
        const pending = { by: me.caregiver.id, now: Date.now(), zone: me.household.timeZone }
        queryClient.setQueryData(queryKeys.today, pendingToday(before, action, pending))
      }
      return { before }
    },
    onError: (error, sending, context) => {
      if (context?.before !== undefined) queryClient.setQueryData(queryKeys.today, context.before)
      void queryClient.invalidateQueries({ queryKey: queryKeys.today })
      onFailed({ sending, error })
    },
    onSuccess: (saved, sending) => {
      queryClient.setQueryData<Today>(queryKeys.today, (today) =>
        today === undefined ? today : savedToday(today, saved, sending.action),
      )
      for (const queryKey of saved.changed) void queryClient.invalidateQueries({ queryKey })
      onSaved(sending, saved)
    },
  })
}
