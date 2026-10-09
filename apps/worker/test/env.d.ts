declare namespace Cloudflare {
  interface Env {
    readonly HOUSEHOLD: DurableObjectNamespace<import("../src/household.ts").HouseholdDO>
  }
}
