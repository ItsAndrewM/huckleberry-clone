import { fileURLToPath } from "node:url"
import { cloudflare } from "@cloudflare/vite-plugin"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"
import { previewNextBuild } from "./preview-next-build.ts"
import { previewSignOut } from "./preview-sign-out.ts"
import { previewSlowPages } from "./preview-slow-pages.ts"
import { serviceWorker } from "./service-worker-build.ts"

export default defineConfig({
  plugins: [
    previewSignOut(),
    previewSlowPages(),
    previewNextBuild(),
    serviceWorker(),
    react(),
    tailwindcss(),
    cloudflare({ configPath: "../worker/wrangler.jsonc" }),
  ],
  resolve: { alias: { "@": fileURLToPath(new URL("src", import.meta.url)) } },
})
