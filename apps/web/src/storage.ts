export type BrowserStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">

export const attempt = <A>(run: () => A, otherwise: A): A => {
  try {
    return run()
  } catch {
    return otherwise
  }
}
