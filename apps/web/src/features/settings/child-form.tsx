import type { Child } from "@bt/contracts"
import { type FormEvent, useState } from "react"
import type { SaveChild } from "../../api/hooks.ts"
import { Button } from "../../components/ui/button.tsx"
import { childFieldsOf } from "./child-fields.ts"
import { GestationalAgeField } from "./gestational-age-field.tsx"
import { fieldMessage } from "./messages.ts"
import { SaveFailure } from "./save-failure.tsx"
import { SexChoice } from "./sex-choice.tsx"
import { TextField } from "./text-field.tsx"

interface ChildFormProps {
  readonly child: Child
  readonly save: SaveChild
}

export const ChildForm = ({ child, save }: ChildFormProps) => {
  const [edited, setEdited] = useState(false)
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    save.mutate({ child, fields: childFieldsOf(new FormData(event.currentTarget)) })
  }
  const saved = save.isSuccess && !edited
  return (
    <form noValidate className="flex flex-col gap-4" onChange={() => setEdited(true)} onSubmit={submit}>
      <TextField name="name" label="Name" defaultValue={child.name} error={fieldMessage(save.error, "name")} />
      <TextField
        name="birthDate"
        type="date"
        label="Birth date"
        defaultValue={child.birthDate}
        error={fieldMessage(save.error, "birthDate")}
      />
      <SexChoice defaultValue={child.sex} />
      <GestationalAgeField
        gestationalAgeDays={child.gestationalAgeDays}
        error={fieldMessage(save.error, "gestationalAgeDays")}
      />
      <div className="flex items-center gap-3">
        <Button type="submit" size="lg" disabled={!edited || save.isPending}>
          {save.isPending ? "Saving…" : "Save"}
        </Button>
        {saved ? <output className="text-sm text-muted-foreground">Saved</output> : null}
      </div>
      <SaveFailure error={save.error} />
    </form>
  )
}
