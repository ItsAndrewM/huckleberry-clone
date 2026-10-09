export const signInUrl = ({ pathname, search }: Pick<Location, "pathname" | "search">) =>
  `/api/login?${new URLSearchParams({ return: `${pathname}${search}` })}`
