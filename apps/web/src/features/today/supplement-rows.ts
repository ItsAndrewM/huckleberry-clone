import type { Dose, Supplement } from "@bt/contracts"
import { isPending } from "../../api/pending.ts"
import { clockTime } from "../../clock-time.ts"
import type { Display } from "./display.ts"

export interface SupplementRow {
  readonly id: string
  readonly name: string
  readonly title: string
  readonly detail: ReadonlyArray<string>
}

const present = (parts: ReadonlyArray<string>) => parts.filter((part) => part !== "")

const timesOf = (count: number) => (count === 2 ? "twice" : `${count} times`)

const whoLogged = ({ caregivers }: Display, id: string) => {
  const name = caregivers.find((caregiver) => caregiver.id === id)?.displayName
  return name === undefined ? "" : `by ${name}`
}

const rowOf = (supplement: Supplement, given: ReadonlyArray<Dose>, display: Display): SupplementRow => {
  const { id, name } = supplement
  const last = given.at(-1)
  if (last === undefined) return { id, name, title: `${name} not logged yet today`, detail: present([supplement.dose]) }
  const time = clockTime(last.occurredAt, display.timeZone, display.locale)
  const title =
    given.length === 1 ? `${name} logged at ${time}` : `${name} logged ${timesOf(given.length)} today, last at ${time}`
  const by = isPending(last.id) ? "Saving…" : whoLogged(display, last.createdBy)
  return { id, name, title, detail: present([by, last.dose]) }
}

export const supplementRows = (display: Display, doses: ReadonlyArray<Dose>): ReadonlyArray<SupplementRow> =>
  display.supplements
    .filter((supplement) => supplement.stoppedAt === null)
    .map((supplement) =>
      rowOf(
        supplement,
        doses.filter((dose) => dose.supplementId === supplement.id),
        display,
      ),
    )
