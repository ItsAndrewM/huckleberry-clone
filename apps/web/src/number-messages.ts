export type NumberIssue = "not_a_number" | "out_of_range"

export const NUMBER_MESSAGES = {
  not_a_number: "Enter a number.",
  out_of_range: "Out of range. Check the number and its unit.",
} as const satisfies Record<NumberIssue, string>
