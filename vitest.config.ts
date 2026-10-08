import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    projects: [
      "packages/*/vitest.config.ts",
      "apps/worker/vitest.config.ts",
      { test: { name: "scripts", include: ["scripts/**/*.test.ts"], environment: "node" } },
    ],
  },
})
