import { useLocation } from "@tanstack/react-router"
import { useState } from "react"
import { Button, buttonVariants } from "../components/ui/button.tsx"
import { signInUrl } from "../shell/sign-in.ts"
import { stashDraft } from "./drafts.ts"
import { failureNote } from "./failure.ts"
import type { Sending, SheetKind } from "./sending.ts"
import { failedFor, useSheets } from "./sheets-context.ts"
import { useHousehold } from "./use-household.ts"

const CANT_KEEP = "This phone can't keep the entry while you sign in. Sign in, then log it again."

const browserStorage = () => sessionStorage

interface SignInNoteProps {
  readonly message: string
  readonly sending: Sending
}

const SignInNote = ({ message, sending }: SignInNoteProps) => {
  const route = useLocation({ select: ({ pathname, searchStr }) => `${pathname}${searchStr}` })
  const [refused, setRefused] = useState(false)
  const href = signInUrl({ pathname: route, search: "" })
  if (refused) {
    return (
      <>
        <p>{CANT_KEEP}</p>
        <a href={href} className={buttonVariants({ size: "lg" })}>
          Sign in anyway
        </a>
      </>
    )
  }
  return (
    <>
      <p>{message}</p>
      <a
        href={href}
        onClick={(event) => {
          if (stashDraft(browserStorage, { route, sending, createdAt: Date.now() })) return
          event.preventDefault()
          setRefused(true)
        }}
        className={buttonVariants({ size: "lg" })}
      >
        Sign in
      </a>
    </>
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
      {signIn ? <SignInNote message={message} sending={failed.sending} /> : <p>{message}</p>}
      {retry === null ? null : (
        <Button variant="outline" size="lg" onClick={() => sheets.send(failed.sending)}>
          {retry}
        </Button>
      )}
    </div>
  )
}
