// Spike harness for the device checks (S1-S4). Results are copied into docs/spike-results.md.
const log = (label, value) => {
  const line = `[${new Date().toISOString()}] ${label}: ${typeof value === "string" ? value : JSON.stringify(value)}`
  document.getElementById("log").textContent = line + "\n" + document.getElementById("log").textContent
}

document.getElementById("loaded").textContent = new Date().toISOString()
document.getElementById("source").textContent =
  (navigator.standalone || matchMedia("(display-mode: standalone)").matches ? "standalone" : "browser") +
  (navigator.serviceWorker?.controller ? ", SW-controlled" : ", no SW")

if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch((e) => log("sw register", String(e)))

// S3: the three outcomes must be distinguishable.
const probe = async (path) => {
  try {
    const res = await fetch(path, { redirect: "manual", credentials: "same-origin" })
    const body = res.type === "opaqueredirect" ? null : await res.text()
    log(path, { type: res.type, status: res.status, redirected: res.redirected, body })
  } catch (e) {
    log(path, { error: e.name, message: e.message })
  }
}

const actions = {
  me: () => probe("/api/me"),
  identity: () => probe("/api/spike/identity"),
  login: () => { location.href = "/api/login?return=" + encodeURIComponent(location.pathname) },
  ws: () => {
    const ws = new WebSocket(`${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/api/ws`)
    ws.onopen = () => { log("ws", "open"); ws.send("hello") }
    ws.onmessage = (e) => log("ws message", e.data)
    ws.onclose = (e) => log("ws close", { code: e.code, reason: e.reason })
    ws.onerror = () => log("ws", "error")
  },
}
for (const b of document.querySelectorAll("button[data-check]")) b.onclick = () => actions[b.dataset.check]()
