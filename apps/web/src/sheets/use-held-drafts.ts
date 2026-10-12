import { useEffect } from "react"
import { draftStorage, dropDraftUnlessHeld } from "./drafts.ts"
import { actionIdOf } from "./held.ts"
import type { Failed } from "./sending.ts"

export const useHeldDrafts = (held: ReadonlyArray<Failed>) => {
  useEffect(
    function dropLetGoDraft() {
      dropDraftUnlessHeld(
        draftStorage,
        held.map(({ sending }) => actionIdOf(sending)),
      )
    },
    [held],
  )
}
