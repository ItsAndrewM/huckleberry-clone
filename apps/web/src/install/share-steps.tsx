import { EllipsisIcon, ShareIcon } from "lucide-react"

const INLINE_ICON = "inline size-4 align-[-0.125em]"

export const ShareSteps = () => (
  <>
    Tap Share <ShareIcon aria-hidden="true" className={INLINE_ICON} />, then Add to Home Screen. No Share button? Tap{" "}
    <EllipsisIcon aria-hidden="true" className={INLINE_ICON} />
    <span className="sr-only">More</span> first. Already added it? Open Baby tracker from your Home Screen.
  </>
)
