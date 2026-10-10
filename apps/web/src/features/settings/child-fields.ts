import type { ChildFields } from "../../api/settings.ts"

const DAYS_PER_WEEK = 7

export const weeksAndDays = (gestationalAgeDays: number) => ({
  weeks: Math.floor(gestationalAgeDays / DAYS_PER_WEEK),
  days: gestationalAgeDays % DAYS_PER_WEEK,
})

const text = (form: FormData, name: string) => String(form.get(name) ?? "")

const ageInDays = (weeks: number, days: number) =>
  Number.isInteger(days) && days >= 0 && days < DAYS_PER_WEEK ? weeks * DAYS_PER_WEEK + days : Number.NaN

export const childFieldsOf = (form: FormData): ChildFields => ({
  name: text(form, "name").trim(),
  birthDate: text(form, "birthDate"),
  sex: text(form, "sex") === "male" ? "male" : "female",
  gestationalAgeDays: ageInDays(Number(text(form, "weeks")), Number(text(form, "days"))),
})
