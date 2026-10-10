import { saveFailure } from "./messages.ts"

export const SaveFailure = ({ error }: { readonly error: Error | null }) => {
  const message = saveFailure(error)
  if (message === undefined) return null
  return (
    <p role="alert" className="text-sm text-destructive">
      {message}
    </p>
  )
}
