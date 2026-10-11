import { Button } from "../components/ui/button.tsx"
import { useSheets } from "./sheets-context.ts"

export const UndoToast = () => {
  const sheets = useSheets()
  const { toast } = sheets
  return (
    <output className="pointer-events-none fixed inset-x-0 bottom-[calc(8rem+env(safe-area-inset-bottom))] z-40 block px-4">
      {toast === null ? null : (
        <span className="pointer-events-auto mx-auto flex max-w-lg items-center justify-between gap-3 rounded-xl bg-foreground py-1 pr-1 pl-4 text-background shadow-lg">
          <span className="text-sm font-medium">{toast.message}</span>
          {toast.undo === null ? null : (
            <Button
              variant="ghost"
              size="lg"
              className="text-background hover:bg-background/10 hover:text-background"
              onClick={() => toast.undo !== null && sheets.send(toast.undo)}
            >
              Undo
            </Button>
          )}
        </span>
      )}
    </output>
  )
}
