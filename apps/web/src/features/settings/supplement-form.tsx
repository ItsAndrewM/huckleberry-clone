import type { Supplement } from "@bt/contracts"
import { type FormEvent, useState } from "react"
import { useSaveSupplement } from "../../api/hooks.ts"
import { Button } from "../../components/ui/button.tsx"
import { useSheets } from "../../sheets/sheets-context.ts"
import { SaveFailure } from "./save-failure.tsx"
import { StopSupplement } from "./stop-supplement.tsx"
import { supplementFieldMessage, supplementFieldsOf } from "./supplement-fields.ts"
import { TextField } from "./text-field.tsx"

export const SupplementForm = ({ shown }: { readonly shown: Supplement | null }) => {
  const sheets = useSheets()
  const save = useSaveSupplement()
  const [addActionId] = useState(() => crypto.randomUUID())
  const stopped = shown !== null && shown.stoppedAt !== null
  const send = (form: HTMLFormElement, stop: boolean) =>
    save.mutate(
      { shown, fields: supplementFieldsOf(new FormData(form), stop), addActionId },
      { onSuccess: () => sheets.close() },
    )
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    send(event.currentTarget, stopped)
  }
  const clearStaleError = () => {
    if (save.isError) save.reset()
  }
  return (
    <form noValidate className="flex flex-col gap-4" onChange={clearStaleError} onSubmit={submit}>
      <TextField
        name="supplement-name"
        label="Name"
        defaultValue={shown?.name ?? ""}
        error={supplementFieldMessage(save.error, "name")}
      />
      <TextField
        name="supplement-dose"
        label="Dose"
        defaultValue={shown?.dose ?? ""}
        error={supplementFieldMessage(save.error, "dose")}
      />
      <p className="text-sm text-muted-foreground">Doses already logged keep the dose they were given at.</p>
      <Button type="submit" size="lg" disabled={save.isPending}>
        {shown === null ? "Add supplement" : "Save"}
      </Button>
      {shown === null ? null : (
        <StopSupplement
          name={shown.name}
          stopped={stopped}
          disabled={save.isPending}
          onChange={(form) => send(form, !stopped)}
        />
      )}
      <SaveFailure error={save.error} />
    </form>
  )
}
