import { cloudflareTest } from "@cloudflare/vitest-plugin"
import { defineConfig } from "vitest/config"

export default defineConfig({
  plugins: [cloudflareTest({ wrangler: { configPath: "./wrangler.jsonc" } })],
  test: { name: "worker-bench", include: ["test/**/*.bench.ts"], silent: false, reporters: ["verbose"] },
})
