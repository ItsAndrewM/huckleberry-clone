import type { Sex } from "@bt/contracts"

const SEXES = [
  { value: "female", label: "Girl" },
  { value: "male", label: "Boy" },
] as const satisfies ReadonlyArray<{ value: Sex; label: string }>

export const SexChoice = ({ defaultValue }: { readonly defaultValue: Sex }) => (
  <fieldset className="flex flex-col gap-2">
    <legend className="mb-2 text-sm font-medium">Sex</legend>
    <div className="grid grid-cols-2 gap-1">
      {SEXES.map(({ value, label }) => (
        <label
          key={value}
          className="flex h-11 cursor-pointer items-center justify-center rounded-lg border border-field text-base font-medium transition-all has-checked:border-primary/40 has-checked:bg-secondary has-checked:text-secondary-foreground has-focus-visible:border-ring has-focus-visible:ring-3 has-focus-visible:ring-ring"
        >
          <input type="radio" name="sex" value={value} defaultChecked={defaultValue === value} className="sr-only" />
          {label}
        </label>
      ))}
    </div>
  </fieldset>
)
