import { useLocation } from "@tanstack/react-router"
import { Button, buttonVariants } from "../components/ui/button.tsx"
import { signInUrl } from "../shell/sign-in.ts"
import { stashDraft } from "./drafts.ts"
import { failureNote } from "./failure.ts"
import type { Sending, SheetKind } from "./sending.ts"
import { failedFor, useSheets } from "./sheets-context.ts"
import { useHousehold } from "./use-household.ts"

const browserStorage = () => sessionStorage

const SignInLink = ({ sending }: { readonly sending: Sending }) => {
  const route = useLocation({ select: ({ pathname, searchStr }) => `${pathname}${searchStr}` })
  return (
    <a
      href={signInUrl({ pathname: route, search: "" })}
      onClick={() => stashDraft(browserStorage, { route, sending, createdAt: Date.now() })}
      className={buttonVariants({ size: "lg" })}
    >
      Sign in
    </a>
  )
}

export const FailureNote = ({ sheet }: { readonly sheet: SheetKind }) => {
  const sheets = useSheets()
  const household = useHousehold()
  const failed = failedFor(sheets, sheet)
  if (failed === null || household === null) return null
  const { message, retry, signIn } = failureNote(failed.error, household)
  return (
    <div role="alert" className="flex flex-col gap-3 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
      <p>{message}</p>
      {retry === null ? null : (
        <Button variant="outline" size="lg" onClick={() => sheets.send(failed.sending)}>
          {retry}
        </Button>
      )}
      {signIn ? <SignInLink sending={failed.sending} /> : null}
    </div>
  )
}
