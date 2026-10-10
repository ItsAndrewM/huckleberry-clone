import type { ChildFields } from "../../api/settings.ts"

const DAYS_PER_WEEK = 7

export const weeksAndDays = (gestationalAgeDays: number) => ({
  weeks: Math.floor(gestationalAgeDays / DAYS_PER_WEEK),
  days: gestationalAgeDays % DAYS_PER_WEEK,
})

const text = (form: FormData, name: string) => String(form.get(name) ?? "")

export const childFieldsOf = (form: FormData): ChildFields => ({
  name: text(form, "name").trim(),
  birthDate: text(form, "birthDate"),
  sex: text(form, "sex") === "male" ? "male" : "female",
  gestationalAgeDays: Number(text(form, "weeks")) * DAYS_PER_WEEK + Number(text(form, "days")),
})
