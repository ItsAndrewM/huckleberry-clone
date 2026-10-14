import type { Dose, Supplement, Today } from "@bt/contracts"

export const doseTextOf = (supplements: ReadonlyArray<Supplement>, supplementId: string) =>
  supplements.find(({ id }) => id === supplementId)?.dose ?? ""

export const withoutTodaysDose = (today: Today, id: string): Today => ({
  ...today,
  doses: today.doses.filter((dose) => dose.id !== id),
})

export const withTodaysDose = (today: Today, dose: Dose): Today => {
  const kept = withoutTodaysDose(today, dose.id)
  if (dose.deletedAt !== null || dose.localDate !== today.date) return kept
  return { ...kept, doses: [...kept.doses, dose].toSorted((a, b) => a.occurredAt - b.occurredAt) }
}
