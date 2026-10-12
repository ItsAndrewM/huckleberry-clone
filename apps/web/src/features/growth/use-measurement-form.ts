import type { Measurement, Me } from "@bt/contracts"
import { useState } from "react"
import { failedFor, useSheets } from "../../sheets/sheets-context.ts"
import { tapTime } from "../../sheets/tap-time.ts"
import { useNow } from "../../timer/use-now.ts"
import {
  deleteAction,
  isCleared,
  isComplete,
  measuredAtOf,
  measurementSession,
  readingsOf,
  saveAction,
  valuesOf,
} from "./measurement-session.ts"

export const useMeasurementForm = (me: Me, editing: Measurement | null) => {
  const sheets = useSheets()
  const zone = me.household.timeZone
  const [session] = useState(() =>
    measurementSession(failedFor(sheets, "measurement"), editing, me.household.units, zone, sheets.at),
  )
  const [form, setForm] = useState(session.form)
  const now = useNow()
  const readings = readingsOf(form)
  const save = () => {
    const resolved = measuredAtOf(session, form.when, zone, tapTime())
    if (!resolved.ok || !isComplete(readings)) return
    sheets.send({ sheet: "measurement", action: saveAction(session, valuesOf(readings), resolved.instant) })
  }
  const remove = () => {
    if (session.target !== null) sheets.send({ sheet: "measurement", action: deleteAction(session.target) })
  }
  return {
    target: session.target,
    form,
    setForm,
    readings,
    ready: isComplete(readings) && measuredAtOf(session, form.when, zone, now).ok,
    cleared: isCleared(session, readings),
    save,
    remove,
    zone,
    now,
  }
}
