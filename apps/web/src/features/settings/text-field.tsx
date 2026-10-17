import { FieldMessage } from "../../components/field-message.tsx"
import { Input } from "../../components/ui/input.tsx"

interface TextFieldProps {
  readonly name: string
  readonly label: string
  readonly type?: "text" | "date"
  readonly defaultValue: string
  readonly error: string | undefined
}

export const TextField = ({ name, label, type = "text", defaultValue, error }: TextFieldProps) => {
  const errorId = `${name}-error`
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={name} className="text-sm font-medium">
        {label}
      </label>
      <Input
        id={name}
        name={name}
        type={type}
        defaultValue={defaultValue}
        autoComplete="off"
        aria-invalid={error !== undefined}
        aria-describedby={errorId}
      />
      <FieldMessage id={errorId}>{error}</FieldMessage>
    </div>
  )
}
