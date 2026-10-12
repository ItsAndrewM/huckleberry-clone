import { type Deleted, queryKeys } from "@bt/contracts"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import { send } from "../../api/send.ts"
import { useApp } from "../../app-context.ts"
import { useSheets } from "../../sheets/sheets-context.ts"
import { restoredToast } from "../../sheets/undo.ts"
import type { DeletedRow } from "./deleted-rows.ts"
import { restoreOf, withoutEntry } from "./restore.ts"

export const useRestore = (row: DeletedRow) => {
  const { api } = useApp()
  const queryClient = useQueryClient()
  const { announce } = useSheets()
  const [actionId] = useState(() => crypto.randomUUID())
  const restoring = useMutation({
    mutationFn: () => send(api, restoreOf(row.record, actionId)),
    onSuccess: (saved) => {
      queryClient.setQueryData<Deleted>(queryKeys.deleted, (deleted) =>
        deleted === undefined ? deleted : withoutEntry(deleted, row.id),
      )
      for (const queryKey of saved.changed) void queryClient.invalidateQueries({ queryKey })
      announce(restoredToast(saved, Date.now(), crypto.randomUUID()))
    },
  })
  return {
    busy: restoring.isPending,
    error: restoring.isPending ? null : restoring.error,
    restore: () => restoring.mutate(),
  }
}
