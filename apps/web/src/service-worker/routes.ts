export type Route = "network" | "page" | "asset"

type RoutedRequest = Pick<Request, "method" | "mode" | "url">

export const routeOf = (request: RoutedRequest, origin: string): Route => {
  const url = new URL(request.url)
  if (request.method !== "GET" || url.origin !== origin || url.pathname.startsWith("/api/")) return "network"
  return request.mode === "navigate" ? "page" : "asset"
}
