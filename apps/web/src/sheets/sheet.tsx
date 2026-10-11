import type { ReactNode } from "react"
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from "../components/ui/drawer.tsx"
import type { SheetKind } from "./sending.ts"
import { useSheets } from "./sheets-context.ts"

interface SheetProps {
  readonly sheet: SheetKind
  readonly title: string
  readonly description?: string | undefined
  readonly children: ReactNode
}

export const Sheet = ({ sheet, title, description, children }: SheetProps) => {
  const sheets = useSheets()
  return (
    <Drawer
      open={sheets.open === sheet}
      onOpenChange={(open) => (open ? sheets.show(sheet) : sheets.close())}
      showSwipeHandle
    >
      <DrawerContent className="pb-[env(safe-area-inset-bottom)]">
        <div className="mx-auto flex w-full max-w-lg flex-col gap-5 overflow-y-auto p-4 pt-2">
          <DrawerHeader className="p-0 text-left">
            <DrawerTitle className="text-xl font-semibold tracking-tight">{title}</DrawerTitle>
            {description === undefined ? null : <DrawerDescription>{description}</DrawerDescription>}
          </DrawerHeader>
          {children}
        </div>
      </DrawerContent>
    </Drawer>
  )
}
