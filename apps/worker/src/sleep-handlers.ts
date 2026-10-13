import { Api, NewSleep, Sleep, SleepConflict, SleepEdit, SleepStart, TimedAction, VersionedAction } from "@bt/contracts"
import { Effect } from "effect"
import { HttpApiBuilder } from "effect/http-api"
import { deleteSleep, editSleep, restoreSleep } from "./core/sleeps/edits.ts"
import { startSleep, wakeSleep } from "./core/sleeps/lifecycle.ts"
import { logSleep } from "./core/sleeps/log.ts"
import { mutations, type Saved } from "./mutations.ts"
import type { Broadcast } from "./sockets.ts"

const asSavedSleep = Effect.map(({ record, changed }: Saved<Sleep>) => ({ sleep: record, changed }))

export const sleepHandlers = (storage: DurableObjectStorage, broadcast: Broadcast) => {
  const mutate = mutations(
    storage,
    broadcast,
    Sleep,
    (saved) => new SleepConflict({ code: "ACTION_REPLAY_MISMATCH", current: saved }),
  )
  return HttpApiBuilder.group(Api, "sleeps", (handlers) =>
    handlers
      .handle("logSleep", ({ payload, request }) =>
        mutate(request, NewSleep, payload, (stamp) => logSleep(stamp, payload)).pipe(asSavedSleep),
      )
      .handle("startSleep", ({ payload, request }) =>
        mutate(request, SleepStart, payload, (stamp) => startSleep(stamp, payload)).pipe(asSavedSleep),
      )
      .handle("wakeSleep", ({ params, payload, request }) =>
        mutate(request, TimedAction, payload, (stamp) => wakeSleep(stamp, params.id, payload)).pipe(asSavedSleep),
      )
      .handle("editSleep", ({ params, payload, request }) =>
        mutate(request, SleepEdit, payload, (stamp) => editSleep(stamp, params.id, payload)).pipe(asSavedSleep),
      )
      .handle("deleteSleep", ({ params, payload, request }) =>
        mutate(request, VersionedAction, payload, (stamp) => deleteSleep(stamp, params.id, payload)).pipe(asSavedSleep),
      )
      .handle("restoreSleep", ({ params, payload, request }) =>
        mutate(request, VersionedAction, payload, (stamp) => restoreSleep(stamp, params.id, payload)).pipe(
          asSavedSleep,
        ),
      ),
  )
}
