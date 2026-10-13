import { DiaperSheet } from "../features/diaper/diaper-sheet.tsx"
import { EditDiaperSheet } from "../features/edit/edit-diaper-sheet.tsx"
import { EditFeedSheet } from "../features/edit/edit-feed-sheet.tsx"
import { BottleSheet } from "../features/feed/bottle-sheet.tsx"
import { NursingSheet } from "../features/feed/nursing-sheet.tsx"
import { PastFeedSheet } from "../features/feed/past-feed-sheet.tsx"
import { MeasurementSheet } from "../features/growth/measurement-sheet.tsx"
import { SleepSheet } from "../features/sleep/sleep-sheet.tsx"

export const LogSheets = () => (
  <>
    <BottleSheet />
    <NursingSheet />
    <PastFeedSheet />
    <DiaperSheet />
    <SleepSheet />
    <MeasurementSheet />
    <EditDiaperSheet />
    <EditFeedSheet />
  </>
)
