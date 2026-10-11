import { type Me, queryKeys, type Today } from "@bt/contracts"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { send } from "../api/send.ts"
import type { Saved } from "../api/send.ts"
import { pendingToday, savedToday, withdrawnToday } from "../api/today-cache.ts"
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
      if (before === undefined || me === undefined) return null
      const pending = { by: me.caregiver.id, now: Date.now(), zone: me.household.timeZone }
      const shown = pendingToday(before, action, pending)
      if (shown === before) return null
      queryClient.setQueryData(queryKeys.today, shown)
      return { before, pending }
    },
    onError: (error, sending, optimistic) => {
      if (optimistic?.before !== undefined) {
        const { before, pending } = optimistic
        queryClient.setQueryData<Today>(queryKeys.today, (today) =>
          today === undefined ? today : withdrawnToday(today, sending.action, pending, before),
        )
      }
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
