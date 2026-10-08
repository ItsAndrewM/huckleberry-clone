import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    projects: [
      "packages/*/vitest.config.ts",
      {
        extends: "./packages/domain/vitest.config.ts",
        root: "./packages/domain",
        test: { name: "domain-west", env: { TZ: "America/Adak" }, provide: { hostZone: "America/Adak" } },
      },
      "apps/worker/vitest.config.ts",
      { test: { name: "scripts", include: ["scripts/**/*.test.ts"], environment: "node" } },
    ],
    coverage: {
      provider: "v8",
      include: ["packages/domain/src/**/*.ts"],
      thresholds: { 100: true },
    },
  },
})
