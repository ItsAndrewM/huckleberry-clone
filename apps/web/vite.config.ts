import { fileURLToPath } from "node:url"
import { cloudflare } from "@cloudflare/vite-plugin"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"
import { previewSignOut } from "./preview-sign-out.ts"

export default defineConfig({
  plugins: [previewSignOut(), react(), tailwindcss(), cloudflare({ configPath: "../worker/wrangler.jsonc" })],
  resolve: { alias: { "@": fileURLToPath(new URL("src", import.meta.url)) } },
})
