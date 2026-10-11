import { DiaperSheet } from "../features/diaper/diaper-sheet.tsx"
import { BottleSheet } from "../features/feed/bottle-sheet.tsx"
import { NursingSheet } from "../features/feed/nursing-sheet.tsx"

export const LogSheets = () => (
  <>
    <BottleSheet />
    <NursingSheet />
    <DiaperSheet />
  </>
)
