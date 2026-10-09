export type Connectivity = "online" | "offline" | "auth-required"

export type Signal = "reached" | "unreachable" | "signed-out" | "online" | "offline"

interface State {
  readonly network: "online" | "offline"
  readonly session: "valid" | "expired"
}

const NEXT = {
  reached: () => ({ network: "online", session: "valid" }),
  unreachable: (state) => ({ ...state, network: "offline" }),
  "signed-out": () => ({ network: "online", session: "expired" }),
  online: (state) => ({ ...state, network: "online" }),
  offline: (state) => ({ ...state, network: "offline" }),
} satisfies Record<Signal, (state: State) => State>

const connectivityOf = ({ network, session }: State): Connectivity => {
  if (network === "offline") return "offline"
  return session === "expired" ? "auth-required" : "online"
}

export interface ConnectivityStore {
  readonly current: () => Connectivity
  readonly subscribe: (listener: () => void) => () => void
  readonly report: (signal: Signal) => void
}

export const createConnectivity = (online: boolean): ConnectivityStore => {
  let state: State = { network: online ? "online" : "offline", session: "valid" }
  const listeners = new Set<() => void>()
  return {
    current: () => connectivityOf(state),
    subscribe: (listener) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    report: (signal) => {
      const before = connectivityOf(state)
      state = NEXT[signal](state)
      if (connectivityOf(state) === before) return
      for (const listener of listeners) listener()
    },
  }
}

export const followBrowser = (store: ConnectivityStore, target: EventTarget) => {
  target.addEventListener("online", () => store.report("online"))
  target.addEventListener("offline", () => store.report("offline"))
}
