import { defineProject } from "vitest/config"

export default defineProject({
  test: { name: "domain", environment: "node", env: { TZ: "Australia/Lord_Howe" } },
})
