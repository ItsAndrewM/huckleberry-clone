import { cn } from "cn"
import type { ReactNode } from "react"
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from "../components/ui/drawer.tsx"
import { holdTapsWhileArriving } from "./arrival.ts"
import { DiscardPrompt } from "./discard-prompt.tsx"
import type { SheetKind } from "./sending.ts"
import { failedFor, useSheets } from "./sheets-context.ts"

const SIZES_TO_CONTENT_ON_REOPEN = "*:data-[slot=drawer-content]:basis-auto"

interface SheetProps {
  readonly sheet: SheetKind
  readonly title: string
  readonly description?: string | undefined
  readonly children: ReactNode
}

export const Sheet = ({ sheet, title, description, children }: SheetProps) => {
  const sheets = useSheets()
  const failed = failedFor(sheets, sheet)
  const asking = sheets.asking && sheets.open === sheet && failed !== null
  return (
    <Drawer
      open={sheets.open === sheet}
      onOpenChange={(open) => (open ? sheets.show(sheet) : sheets.close())}
      showSwipeHandle
    >
      <DrawerContent
        className={cn("pb-[env(safe-area-inset-bottom)]", SIZES_TO_CONTENT_ON_REOPEN)}
        finalFocus={sheets.focusOnClose}
      >
        <div className="mx-auto flex w-full max-w-lg flex-col gap-5 overflow-y-auto p-4 pt-2">
          <DrawerHeader className="p-0 text-left">
            <DrawerTitle className="text-xl font-semibold tracking-tight break-words">{title}</DrawerTitle>
            {description === undefined ? null : <DrawerDescription>{description}</DrawerDescription>}
          </DrawerHeader>
          {asking ? <DiscardPrompt failed={failed} /> : null}
          <div
            key={sheets.opened}
            ref={sheets.queued ? holdTapsWhileArriving : undefined}
            className={cn(asking ? "hidden" : "contents", "data-arriving:pointer-events-none")}
          >
            {children}
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  )
}
