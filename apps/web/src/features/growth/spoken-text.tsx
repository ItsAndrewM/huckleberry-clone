export const SpokenAs = ({ shown, said }: { readonly shown: string; readonly said: string }) =>
  shown === said ? (
    shown
  ) : (
    <>
      <span aria-hidden="true">{shown}</span>
      <span className="sr-only">{said}</span>
    </>
  )
