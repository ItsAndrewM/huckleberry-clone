const unauthorized = () =>
  Response.json({ _tag: "Unauthorized" }, { status: 401, headers: { "cache-control": "no-store" } })

export default {
  fetch(request) {
    const { pathname } = new URL(request.url)
    if (pathname.startsWith("/api/")) return unauthorized()
    return new Response("Not found", { status: 404 })
  },
} satisfies ExportedHandler
