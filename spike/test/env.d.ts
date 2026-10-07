type SpikeEnv = import("../src/index.ts").Env

declare namespace Cloudflare {
  interface Env extends SpikeEnv {}
}
