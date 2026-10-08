import { defineConfig } from "oxlint"

const datesThroughDomain = {
  group: ["date-fns", "date-fns/**", "@date-fns/**"],
  message: "Dates and time zones go through @bt/domain only (D12).",
}

export default defineConfig({
  plugins: ["eslint", "import", "jsx-a11y", "oxc", "promise", "react", "typescript", "unicorn", "vitest"],
  categories: { correctness: "error" },
  options: { denyWarnings: true, reportUnusedDisableDirectives: "error" },
  ignorePatterns: [
    ".agent/**",
    ".agents/**",
    ".claude/**",
    ".codex/**",
    ".continue/**",
    ".cursor/**",
    ".gemini/**",
    ".opencode/**",
    ".pi/**",
    ".roo/**",
    ".superpowers/**",
    ".windsurf/**",
    "tools/oxlint/anti-slop/**",
  ],
  jsPlugins: [
    { name: "anti-slop", specifier: "./tools/oxlint/anti-slop/index.ts" },
    { name: "gamesheet", specifier: "@gamesheet-inc/oxlint-plugin" },
  ],
  rules: {
    complexity: ["error", { max: 10, variant: "classic" }],
    "no-restricted-imports": ["error", { patterns: [datesThroughDomain] }],
    "gamesheet/no-comments": "error",
    "anti-slop/no-chained-type-assertions": "error",
    "anti-slop/no-conditional-empty-object-spread": "error",
    "anti-slop/no-known-value-widening": "error",
    "anti-slop/no-module-mocking": "error",
    "anti-slop/no-object-parameters": "error",
    "anti-slop/no-reflect-apply": "error",
    "anti-slop/no-reflect-get": "error",
    "anti-slop/no-runtime-typeof": "error",
    "anti-slop/no-shape-in-symbol-names": "error",
    "anti-slop/no-unknown-parameters": "error",
    "anti-slop/no-unknown-returns": "error",
    "anti-slop/no-unknown-type-aliases": "error",
    "anti-slop/no-unsafe-dictionary-type": "error",
    "anti-slop/no-widen-then-assert": "error",
    "anti-slop/require-safety-comment-for-type-assertion": "error",
  },
  overrides: [
    {
      files: ["packages/domain/**"],
      rules: {
        "no-restricted-imports": [
          "error",
          {
            patterns: [
              {
                group: ["@bt/**", "../**/contracts", "../**/contracts/**", "../**/apps/**"],
                message: "@bt/domain imports nothing else from the workspace (plan §1).",
              },
              {
                group: [
                  "effect",
                  "effect/**",
                  "@effect/**",
                  "react",
                  "react/**",
                  "react-dom",
                  "react-dom/**",
                  "cloudflare:*",
                  "node:*",
                ],
                message: "@bt/domain is pure TypeScript: no framework or runtime imports (plan §3.1).",
              },
            ],
          },
        ],
      },
    },
    {
      files: ["packages/contracts/**"],
      rules: {
        "no-restricted-imports": [
          "error",
          {
            patterns: [
              datesThroughDomain,
              {
                group: ["@bt/web", "@bt/worker", "../**/apps/**"],
                message: "@bt/contracts may import @bt/domain only (plan §1).",
              },
            ],
          },
        ],
      },
    },
    {
      files: ["apps/web/**"],
      rules: {
        "no-restricted-imports": [
          "error",
          {
            patterns: [
              datesThroughDomain,
              {
                group: ["@bt/worker", "@bt/worker/**", "../**/worker", "../**/worker/**"],
                message: "The client never imports Worker code.",
              },
            ],
          },
        ],
      },
    },
    {
      files: ["apps/worker/**"],
      rules: {
        "no-restricted-imports": [
          "error",
          {
            patterns: [
              datesThroughDomain,
              {
                group: ["@bt/web", "@bt/web/**", "../**/web", "../**/web/**"],
                message: "The Worker never imports client code.",
              },
            ],
          },
        ],
      },
    },
  ],
})
