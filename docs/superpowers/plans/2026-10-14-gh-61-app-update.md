# GH-61 The App Picks Up a Deploy by Itself Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (native, chosen by Andrew on 13 Oct 2026) or superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A phone left open picks up a deploy by itself. It saves the new version the next time it's online, and opens it the next time the app comes back from the background with nothing open. Until then, Settings › Offline copy says a newer version is saved and offers **Open it now** (issue #61).

**Architecture:**
- **The watcher** (`apps/web/src/service-worker/updates.ts`, Node tests): `watchUpdates(source)` counts each time a new service worker takes over the open page (`controllerchange`), tells its subscribers, and asks the registration to look for a new version (`check()`). A check is `"unavailable"` without a worker, a registration, or a network that answers.
- **The offline copy** (`apps/web/src/features/settings/offline-copy.ts`, Node tests): a fourth state, `"newer"`. Once a new worker has taken over the open page, the copy saved last is the one it serves (`caches.keys()` lists copies in the order they were made), so another build's copy is newer, even while the old copy is still being cleared.
- **The rule** (`apps/web/src/shell/new-version.ts`, Node tests): `isIdle(sheets, page)` says nothing is open, being sent, kept, undoable or typed in. `returnToApp(steps)` opens a newer saved version on a return only then, and otherwise looks for one.
- **The wiring** (`main.tsx`, `app-context.ts`, `shell/shell.tsx`, `shell/new-version-on-return.tsx`, `features/settings/offline-copy-section.tsx`): the watcher lives in the app context. The app checks on every reconnect of the live connection (`onStale`) and on every return, which arrives through TanStack Query's `focusManager` rather than a page-lifecycle handler. Settings shows the newer line with **Open it now**.
- **The stand-in deploy** (`apps/web/preview-next-build.ts`, a preview-only Vite plugin, Node tests): with the cookie `bt-preview-next-build=1`, the preview serves the same build stamped `<version>-next` in `sw.js` and every page, so `e2e/new-version.spec.ts` can deploy without a second build.

**Tech Stack:** React 19.3.0 (`useEffectEvent`, `useSyncExternalStore`), TanStack Query 5.104.1 (`focusManager`, `keepPreviousData`), Vite 8.3.3 (a preview plugin), the Service Worker and Cache Storage APIs, TypeScript 5.9.3, Vitest 4.1.11, Playwright 1.64.0, oxlint 1.87.0 and oxfmt 0.72.0, Node 24.21.0. GH-61 adds no package.

**Spec:** issue #61: its body, and the comments "Taken" and "Grill decisions". Also:
- `docs/implementation-plan.md`, the M1.14 row (the service worker) and the M5.4 row (Settings' offline-copy line).
- M1.14's plan, `docs/superpowers/plans/2026-10-09-m1.14-service-worker.md`: `sw.ts`, its install, activate and fetch, and `registerServiceWorker`.
- M5.4's plan, `docs/superpowers/plans/2026-10-10-m5.4-no-connection.md`: `offline-copy.ts`, `checkOfflineCopy` and the Settings section.
- M5.6's plan, `docs/superpowers/plans/2026-10-11-m5.6-held-entries.md`: what a reload keeps on the phone.
- `docs/runbooks/access.md`, "Deploys".

Andrew decided these on 13 Oct 2026, in the grill before this plan:
- **Execution:** native. He chose #61 over M5.2 (accessibility) by subagents or natively, since M3.2 and M3.3 were rewriting most of the screens M5.2 checks.
- **When the new version takes over:** the next time the app comes back from the background with nothing open: no sheet, nothing being sent and nothing kept on the phone. If something is open, it waits for the next return. No extra UI. He chose it over a Reload card, over both, and over reloading at once when idle with the app on screen.
- **Settings › Offline copy:** "A newer version is saved. It opens when you next come back to the app.", with **Open it now**, which reloads at once. He chose it over the line alone.
- **After a deploy:** nothing to do, once #61 is on both phones. The docs say how to check instead (Settings › Offline copy). #48 becomes the one last open after #61's own deploy. He chose it over checking Settings after each deploy, and over keeping "open the app online once on each phone".

## Global Constraints

- **Where to work:** the worktree `.claude/worktrees/gh-61-app-update`, on `feature/the-app-doesnt-reload-itself-after-a-deploy.GH-61`, cut from `main` at `ca755b1` (M3.1's #74, merged and live). Never the main checkout.
- **Tracking:** issue #61. Post plan approval and progress there as comments. Hand-offs go on their issues: M5.2 #47, Andrew's #48 and #53. The roadmap artifact is frozen: never publish to it. The PR's description says `Closes #61`.
- **Peers building beside this:** 4e's M3.2 (#44, PR #76) and af's M3.3 (#45) change none of this plan's code files. All three edit `CLAUDE.md` and `docs/implementation-plan.md`, on different lines; whoever merges second resolves those line by line.
- **Running commands:** Node 24.21.0. The steps write `pnpm …`. Run each as `env PATH=/Users/andamonium/.nvm/versions/node/v24.21.0/bin:/Users/andamonium/Library/pnpm:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin pnpm …`, one command at a time, or through a scratchpad wrapper run by its literal path. This worktree session refuses compound shell commands, loops, and inline scripts that name git.
- **Taking each task's files:** every file below is a commit on `scratch/gh-61-replay2`, which starts from `ca755b1` as this branch does. Take a file with `git checkout <sha> -- <path>`, tests first, and watch them fail before taking the code. `git checkout <sha> -- <file>` also stages the file, so compare with `git diff HEAD -- <file>`.
- **E2E:** other sessions serve their builds on port 4173, so run specs as `pnpm exec playwright test --config .superpowers/e2e.config.ts <spec>`. That config serves this worktree's build on port 4214, never reuses another server, and git ignores it (Setup). CI keeps `playwright.config.ts`.
- **Imports:** `apps/web` imports React, TanStack, Base UI, `cn`, `lucide-react` and its own files; its root `.ts` files (Vite plugins) import Node's modules, `vite` and `./src/...`. `e2e/` imports `@playwright/test` and its own helpers. Relative imports carry their extension.
- **Style:** no semicolons, double quotes, 2-space indent, 120 columns. `pnpm format` writes and `pnpm lint` checks. The code below is already formatted.
- **Lint:**
  - It bans comments of every kind (`gamesheet/no-comments`). Don't turn one into JSDoc or a `SAFETY:` comment; put the reason in a name or a test title.
  - No type assertions except `as const`, no non-null `!`, complexity at most 10 per function.
  - The anti-slop rules ban `unknown` and `object` parameters and returns, including a function type in an interface (`() => Promise<unknown>` is refused). Type DOM boundaries as `Pick<…>` of the DOM's own types, as `offline-copy.ts` already does.
  - `promise/no-callback-in-promise` refuses `.catch(next)`: the preview plugin answers a failure itself.
  - `scripts/page-lifecycle.test.ts` (M1.12, plan §3.5) fails on the words `pagehide`, `beforeunload` or `visibilitychange` anywhere in `apps/web/src`, a string included. The return comes through TanStack's `focusManager`.
  - E2E files have no DOM types: `page.evaluate` takes a string when it reads `window`, `document`, `caches` or `navigator`.
- **React:** logic lives in `.ts` files that run in Node tests. `new-version-on-return.tsx` holds the plan's one effect, a subscription to `focusManager`, as `use-held-drafts.ts` and `use-resumed-draft.ts` hold theirs. No `style` props. Before writing Task 5's component and Settings change, invoke `frontend-ui-expert` and `react-code-standards` (Andrew's standing instruction). The look is fixed (Export's "Share it" row), so use them to check the work, not to redesign it.
- **Tests:**
  - `apps/web`'s Vitest project runs in Node (`environment: "node"`), with fakes for the service worker container, its registration and the page.
  - `e2e/new-version.spec.ts` allows service workers (`test.use({ serviceWorkers: "allow" })`), as `offline.spec.ts` does, and runs against the real local household, which it never writes to. A return is a `visibilitychange` event dispatched with `bubbles: true` (TanStack listens on `window`), after `document.visibilityState` is overridden.
  - No real names, emails or birth dates. Local runs use the made-up "Robin".
- **Figures:** re-measure any number the docs quote (sizes, counts) before committing, and report any mismatch.
- **Out of scope:** lazy chunks (none exist, M5.5; #61's note stays as it is); a version announced by the server; checking on a timer while the app is open; switching while the app is on screen; a note after a switch; M5.2's VoiceOver pass.

## Decisions this plan makes (veto in review)

- **P1: How it notices.** On every return to the app (TanStack's `focusManager`), and on every reconnect of the live connection (`onStale`), which every deploy forces: it restarts the Durable Object, and Cloudflare's docs say "Code updates disconnect all WebSockets". There's no timer, and nothing changes on the server or in the contracts.
- **P2: What "nothing open" means.** No sheet (`open`), nothing being sent (`busy`), nothing kept on the phone (`held`), no Undo on screen (`toast`), no `[role="dialog"]` or `[role="alertdialog"]` anywhere in the page, and no focused `input`, `textarea`, `select` or `contenteditable`. A running feed or sleep doesn't count: it's on the server, and Today shows it after the reload.
- **P3: The switch is `location.reload()`.** The page comes from the network first (M1.14; M5.4's saved copy after about 3 s on a slow one), which after a deploy is the new build. Offline it's the saved new copy, which the new worker serves.
- **P4: Which copy Settings trusts.** Once a new service worker has taken over the open page (`changes() > 0`), the copy saved last is the one it serves: `caches.keys()` lists copies in the order they were made (MDN). Chromium fires `controllerchange` as the new worker starts activating, while the old copy is still there, so "the page's copy is among them" read "Saved for this version." and the switch never came. The prototype measured it.
- **P5: Settings.** While a newer version waits, "A newer version is saved. It opens when you next come back to the app." sits beside **Open it now** (`Button size="lg"`, as Export's "Share it"). A tap reloads at once, even when something is being sent: M5.6 keeps it on the phone and offers it after the reload. "Saved" and "newer" stop the 5-second re-check; a new worker taking over checks again at once (`changes` is in the query key), and the line stays as it was meanwhile (`keepPreviousData`), so "Checking…" never flashes.
- **P6: The page-lifecycle guard stays.** `scripts/page-lifecycle.test.ts` is unchanged. The return arrives through TanStack's `focusManager`, which the plan already counts on for refetching (§3.5), and sends nothing.
- **P7: A failed check is quiet.** Offline, signed out, no worker, or Playwright's blocked worker: `check()` answers `"unavailable"`, and the next return or reconnect tries again. Nothing is logged.
- **P8: The stand-in deploy.** Preview only. With `bt-preview-next-build=1`, `/sw.js` and every page (`/`, or `Accept: text/html` outside `/api/`) come from `dist/client` stamped `<version>-next`. The files are the same, so the new worker's install accepts them. In preview the client environment's `outDir` reads `dist`, so the path is fixed at `dist/client`. A failure answers 500 with its reason.
- **P9: Size.** +0.58 kB gzip of JS (326.62 to 327.20 of 350 kB by `bundle:check`; 330.18 to 330.77 kB by Vite's report), against `main` at `ca755b1`. The CSS and the Worker are unchanged.
- **P10: The docs.** `CLAUDE.md`'s release rule and its service-workers-in-E2E rule, the runbook's step 5 after a deploy, `pnpm release`'s report, and the plan's M1.14 row and §3.5.

## Review Focus

The five ways this is most likely to fail a parent, each with the test that pins it:

1. **A reload cutting off an entry.**
   - A sheet open (Nursing with its timer running, a bottle being set), a save on its way, an entry kept on the phone, Undo on screen, or a field being typed in (Settings' child form): the app waits for the next return.
   - Pinned by `isIdle`'s tests and "waits for the next return when something opens while it looks for the saved version" (Task 3), and "keeps an open sheet when the app comes back, and opens the new version on the next return once it's closed" (Task 5).
2. **A browser that announces the new worker before the old copy is cleared.**
   - Chromium does. Settings must say a newer version is saved, and the next return must switch.
   - Pinned by `offlineCopyOf`'s row with this build's copy and then another's, a worker taken over, reading `"newer"`, and `checkOfflineCopy`'s "calls another build's copy newer once a service worker has taken over while the page was open" (Task 2), and by every Task 5 spec in Chromium, which fail without P4.
3. **Coming back with no connection.**
   - A version saved earlier still opens, from the offline copy.
   - Pinned by "opens the saved new version when the app comes back without a connection" (Task 5), and the `"unavailable"` checks (Task 1).
4. **A fresh install, or a page loaded from the network after a deploy while the old worker still ran.**
   - "Saved for this version.", and no reload loop.
   - Pinned by `offlineCopyOf`'s rows with only this build's copy, and with another build's copy and then this build's, each reading `"saved"` with a worker taken over (Task 2), and by Task 5's specs reading "Saved for this version." before and after a switch.
5. **A deploy while the app is on screen.**
   - The new version is saved within seconds of the reconnect, and opens on the next return; the screen never reloads under a parent's finger.
   - Pinned by "saves a new version when a deploy drops the household's connection, and opens it when the app comes back" (Task 5), and `returnToApp`, which reloads only on a return (Task 3).

## Post-review notes

- **Execution:** native, as Andrew chose. He approved the plan on 14 Oct 2026 with "Approved: PR + CodeRabbit". Each task's files came from the replay commits, tests first and watched failing, byte-identical to `scratch/gh-61-replay2`: Task 1 `8dbfeae`, Task 2 `d4d5bd7`, Task 3 `542b0e2`, Task 4 `75bc656`, Task 5 `4521c7a`, Task 6 `ddceb3f`.
- **The final review (Opus, the whole branch):** "With fixes": one Critical, one Important, three Minor. It agreed with P4: reverting it failed all four Chromium specs, and `caches.keys()` kept creation order in both engines, with a recreated name going last.
  - **Critical, fixed in `76be44f`:** with a newer version saved, an idle return made offline reloaded into the saved copy. There Today couldn't load, since the query cache lives in memory (M5.4), and logging was disabled. Before #61 that phone kept Today and could log (AC 11). A return now switches only once its check has reached the household within 3 s (`CHECK_LIMIT_MS`), and while the phone says it's online; offline it keeps the page it has.
    - Pinned by "keeps the page it has when the check can't reach the household…", "keeps the page it has when the phone says it's offline…" and "gives up on a check after 3 seconds…" (units).
    - Also by the E2E "keeps Today and logging when the app comes back offline, and opens the new version on the next return online", which replaced "opens the saved new version when the app comes back without a connection".
    - This amends P3 and Review Focus 3, for Andrew's veto.
  - **Important, fixed in `76be44f`:** "nothing open" saw only the sheets, so a Settings save on its way (the child, units, time zone, a restore), or an edited child form whose field had lost focus, was lost on the switch. `isIdle` now takes `queryClient.isMutating()` instead of `sheets.busy`, and the child form marks itself `data-unsaved` while it holds a change.
    - Pinned by "isn't idle while anything is on its way to the household…" and "isn't idle while a form holds a change that isn't saved" (units). Those two rows passed before the fix for the wrong reason, since the old rule read `busy`; breaking each guard on purpose proved them after.
    - Also by the E2E "keeps a Settings change that isn't saved when the app comes back, even once its field has lost focus".
    - This adds to P2.
  - **Found during the fix pass:** importing `NETWORK_GRACE_MS` from `shell-cache.ts` into page code split it into a chunk that `sw.js` then imported. A classic service worker can't load one, so it never installed, and every spec failed. `updates.ts` keeps its own `CHECK_LIMIT_MS`; #80 asks for a build check.
  - **Each offline gate alone:** `navigator.onLine` and an unavailable check each survive alone in E2E, because each engine trips the other one. The spec without either gate failed in both engines, and unit tests pin each gate.
  - **Calls for Andrew, and deferred minors:**
    - Open it now reloads even offline, into a Today that can't load until the phone is back online (P5's deliberate tap). It could hide while offline.
    - After the switch begins, the old page still takes taps for up to about 3 s on a slow network, until the new page arrives. Setting `document.documentElement.inert` just before the reload would stop them.
    - A phone still on the version before #61 needs a real close from the app switcher and an online reopen. The PR's checklist and #48 say so.
- **After the fixes:**
  - `pnpm test`: 3,547 tests in 212 files.
  - The new spec: 10 tests, 5 in each engine.
  - The whole E2E suite: 587 passed and 3 skipped, in both engines.
  - The app grows by 0.84 kB gzip of JS (326.62 to 327.46 of 350 kB by `bundle:check`), against `main` at `ca755b1`. The CSS and the Worker are unchanged.
- **The branch is authoritative.** Stale points in this plan's text:
  - P2 (it also counts every mutation, and an unsaved form), P3 (a return switches only online, once its check has reached the household), P9's sizes, and Review Focus 3.
  - Task 1's `updates.ts` (the 3 s limit and its `wait` parameter) and its test.
  - Task 3's `new-version.ts` (`isIdle` takes the mutation count instead of `busy`; `Return` gains `online`; the check comes first) and its tests.
  - Task 5's component (`useQueryClient`, `navigator.onLine`), `child-form.tsx`'s marker (not in Task 5's files), the spec's offline test, and its new Settings test.
  - Task 6's quoted sentences.

## File map

```
apps/web/
  preview-next-build.ts            Task 4   previewNextBuild, nextWorker, nextPage, nextVersionOf
  vite.config.ts                   Task 4   the preview plugin, after previewSlowPages
  src/
    service-worker/updates.ts      Task 1   watchUpdates, Updates, UpdateSource, Checked
    features/settings/
      offline-copy.ts              Task 2   OfflineCopy "newer", offlineCopyOf and checkOfflineCopy take workerChanged
      offline-copy-section.tsx     Tasks 2, 5   the newer line; then Open it now, and re-checks when a worker takes over
    shell/
      new-version.ts               Task 3   isIdle, returnToApp
      new-version-on-return.tsx    Task 5   NewVersionOnReturn, the focusManager subscription
      shell.tsx                    Task 5   renders NewVersionOnReturn inside SheetsProvider
    app-context.ts                 Task 5   App.updates
    main.tsx                       Task 5   watchUpdates, and a check on every reconnect
  test/
    service-worker-updates.test.ts Task 1
    offline-copy.test.ts           Task 2
    new-version.test.ts            Task 3
    preview-next-build.test.ts     Task 4
e2e/new-version.spec.ts            Task 5
CLAUDE.md, docs/runbooks/access.md, docs/implementation-plan.md,
scripts/release-checks.ts, scripts/release-checks.test.ts   Task 6
```

## Setup

- [ ] **Step 1: Check the branch.** In `.claude/worktrees/gh-61-app-update`, `git log --oneline -1` shows this plan's commit on `ca755b1`. Run `git fetch origin`; if `main` has moved, merge it (`git merge origin/main`), and if Claude Code's classifier refuses, ask Andrew to run it with `! git -C /Users/andamonium/Developer/experimental/huckleberry-clone/.claude/worktrees/gh-61-app-update merge origin/main`.
- [ ] **Step 2: Install.** `pnpm install --frozen-lockfile --prefer-offline`.
- [ ] **Step 3: Check the E2E config.** `.superpowers/e2e.config.ts` should exist; the planning session left it, and git ignores it. If it's missing, create `.superpowers/.gitignore` holding the single line `*`, then `.superpowers/e2e.config.ts` as a copy of `playwright.config.ts` with `PORT = 4214`, `testDir: "../e2e"`, `retries: 0`, `reporter: "list"`, `trace: "retain-on-failure"` and `reuseExistingServer: false`.
- [ ] **Step 4: Take the baseline.** `pnpm test`. On `ca755b1` this was 3,515 tests in 209 files. The tasks add 27 tests and three files.

---

### Task 1: Watch the app's service worker

**Files:**
- Create: `apps/web/src/service-worker/updates.ts`
- Test: create `apps/web/test/service-worker-updates.test.ts`

**Interfaces:**
- Consumes: the DOM's `ServiceWorkerRegistration` type (only `scope`).
- Produces:
  - `type Checked = "checked" | "unavailable"`
  - `interface UpdateSource { getRegistration(): Promise<Registration | undefined>; addEventListener(type: "controllerchange", listener: () => void): void }`, which `navigator.serviceWorker` satisfies
  - `interface Updates { changes(): number; subscribe(listener: () => void): () => void; check(): Promise<Checked> }`
  - `watchUpdates(source: UpdateSource | undefined): Updates`

- [ ] **Step 1: Write the failing test.** `git checkout 3192cda -- apps/web/test/service-worker-updates.test.ts`:

`apps/web/test/service-worker-updates.test.ts`:

```ts
import { describe, expect, it } from "vitest"
import { type UpdateSource, watchUpdates } from "../src/service-worker/updates.ts"

type Registration = NonNullable<Awaited<ReturnType<UpdateSource["getRegistration"]>>>

const workerSource = (registration: () => Promise<Registration | undefined>) => {
  const listened: Array<string> = []
  const listeners: Array<() => void> = []
  return {
    listened,
    takeOver: () => {
      for (const listener of listeners) listener()
    },
    getRegistration: registration,
    addEventListener: (type: "controllerchange", listener: () => void) => {
      listened.push(type)
      listeners.push(listener)
    },
  }
}

const updating = () => {
  const asked: Array<"update"> = []
  const registration: Registration = {
    update: () => {
      asked.push("update")
      return Promise.resolve({ scope: "/" })
    },
  }
  return { asked, registration }
}

describe("watchUpdates", () => {
  it("asks the service worker to look for a new version", async () => {
    const { asked, registration } = updating()
    const updates = watchUpdates(workerSource(() => Promise.resolve(registration)))
    expect(await updates.check()).toBe("checked")
    expect(asked).toEqual(["update"])
  })

  it("says the check was unavailable without a service worker, a registration, or a network that answers", async () => {
    const refused: Registration = { update: () => Promise.reject(new TypeError("Failed to fetch")) }
    expect(await watchUpdates(undefined).check()).toBe("unavailable")
    expect(await watchUpdates(workerSource(() => Promise.resolve(undefined))).check()).toBe("unavailable")
    expect(await watchUpdates(workerSource(() => Promise.reject(new DOMException("blocked")))).check()).toBe(
      "unavailable",
    )
    expect(await watchUpdates(workerSource(() => Promise.resolve(refused))).check()).toBe("unavailable")
  })

  it("counts each time another service worker takes over the page, and tells whoever listens until they stop", () => {
    const source = workerSource(() => Promise.resolve(undefined))
    const updates = watchUpdates(source)
    const heard: Array<number> = []
    const stop = updates.subscribe(() => heard.push(updates.changes()))
    expect(source.listened).toEqual(["controllerchange"])
    expect(updates.changes()).toBe(0)
    source.takeOver()
    stop()
    source.takeOver()
    expect(heard).toEqual([1])
    expect(updates.changes()).toBe(2)
  })
})
```

- [ ] **Step 2: Run it to see it fail.** `pnpm exec vitest run apps/web/test/service-worker-updates.test.ts`. Expected: FAIL, "Cannot find module '../src/service-worker/updates.ts'".
- [ ] **Step 3: Write the watcher.** `git checkout 3192cda -- apps/web/src/service-worker/updates.ts`:

`apps/web/src/service-worker/updates.ts`:

```ts
export type Checked = "checked" | "unavailable"

interface Registration {
  readonly update: () => Promise<Pick<ServiceWorkerRegistration, "scope">>
}

export interface UpdateSource {
  readonly getRegistration: () => Promise<Registration | undefined>
  readonly addEventListener: (type: "controllerchange", listener: () => void) => void
}

export interface Updates {
  readonly changes: () => number
  readonly subscribe: (listener: () => void) => () => void
  readonly check: () => Promise<Checked>
}

const registrationOf = (source: UpdateSource | undefined) =>
  source === undefined ? Promise.resolve(undefined) : source.getRegistration().catch(() => undefined)

export const watchUpdates = (source: UpdateSource | undefined): Updates => {
  let changes = 0
  const listeners = new Set<() => void>()
  source?.addEventListener("controllerchange", () => {
    changes += 1
    for (const listener of listeners) listener()
  })
  return {
    changes: () => changes,
    subscribe: (listener) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    check: async () => {
      const registration = await registrationOf(source)
      if (registration === undefined) return "unavailable"
      return registration.update().then(
        () => "checked" as const,
        () => "unavailable" as const,
      )
    },
  }
}
```

- [ ] **Step 4: Run it to see it pass.** The same command. Expected: PASS, 3 tests. Then `pnpm typecheck`.
- [ ] **Step 5: Commit.** `git add apps/web/src/service-worker/updates.ts apps/web/test/service-worker-updates.test.ts`, then `git commit -m "Watch the app's service worker: count each time a new one takes over the open page, and ask it to look for a new version, unavailable without a worker, a registration or a network that answers"`.

---

### Task 2: Tell a newer offline copy from an older one

**Files:**
- Modify: `apps/web/src/features/settings/offline-copy.ts`
- Modify: `apps/web/src/features/settings/offline-copy-section.tsx` (the newer line, and `false` until Task 5 wires the watcher)
- Test: modify `apps/web/test/offline-copy.test.ts`

**Interfaces:**
- Consumes: `cacheName` (`src/service-worker/shell-cache.ts`), in the test.
- Produces:
  - `type OfflineCopy = "saved" | "older" | "newer" | "none"`
  - `offlineCopyOf(cacheNames: readonly string[], build: string, workerChanged: boolean): OfflineCopy`
  - `checkOfflineCopy(storage: ShellStorage, build: string, workerChanged: boolean): Promise<OfflineCopy>`, where `ShellStorage` is `Pick<CacheStorage, "keys" | "match">`

- [ ] **Step 1: Write the failing test.** `git checkout 48acf48 -- apps/web/test/offline-copy.test.ts`. Its changes:

`apps/web/test/offline-copy.test.ts`:

```diff
diff --git a/apps/web/test/offline-copy.test.ts b/apps/web/test/offline-copy.test.ts
index 579d570..612b7ff 100644
--- a/apps/web/test/offline-copy.test.ts
+++ b/apps/web/test/offline-copy.test.ts
@@ -12,6 +12,7 @@ import { cacheName, SHELL_URL } from "../src/service-worker/shell-cache.ts"
 
 const BUILD = "0123456789abcdef"
 const OLDER = "fedcba9876543210"
+const NEWER = "00112233aabbccdd"
 
 const storage = (held: Record<string, ReadonlyArray<string>>) => {
   const asked: Array<[string, MultiCacheQueryOptions | undefined]> = []
@@ -28,29 +29,51 @@ const storage = (held: Record<string, ReadonlyArray<string>>) => {
 
 describe("checkOfflineCopy", () => {
   it("counts a copy only when its cache holds the shell, so an empty cache isn't a saved copy", async () => {
-    expect(await checkOfflineCopy(storage({ [cacheName(BUILD)]: [] }), BUILD)).toBe("none")
-    expect(await checkOfflineCopy(storage({ [cacheName(BUILD)]: ["/"] }), BUILD)).toBe("saved")
-    expect(await checkOfflineCopy(storage({ [cacheName(BUILD)]: [], [cacheName(OLDER)]: ["/"] }), BUILD)).toBe("older")
-    expect(await checkOfflineCopy(storage({ "another-cache": ["/"] }), BUILD)).toBe("none")
+    expect(await checkOfflineCopy(storage({ [cacheName(BUILD)]: [] }), BUILD, false)).toBe("none")
+    expect(await checkOfflineCopy(storage({ [cacheName(BUILD)]: ["/"] }), BUILD, false)).toBe("saved")
+    expect(await checkOfflineCopy(storage({ [cacheName(BUILD)]: [], [cacheName(OLDER)]: ["/"] }), BUILD, false)).toBe(
+      "older",
+    )
+    expect(await checkOfflineCopy(storage({ "another-cache": ["/"] }), BUILD, false)).toBe("none")
+  })
+
+  it("calls another build's copy newer once a service worker has taken over while the page was open", async () => {
+    expect(await checkOfflineCopy(storage({ [cacheName(NEWER)]: ["/"] }), BUILD, true)).toBe("newer")
+    expect(await checkOfflineCopy(storage({ [cacheName(BUILD)]: ["/"], [cacheName(NEWER)]: ["/"] }), BUILD, true)).toBe(
+      "newer",
+    )
+    expect(await checkOfflineCopy(storage({ [cacheName(BUILD)]: ["/"] }), BUILD, true)).toBe("saved")
+    expect(await checkOfflineCopy(storage({ [cacheName(BUILD)]: ["/"], [cacheName(NEWER)]: [] }), BUILD, true)).toBe(
+      "saved",
+    )
   })
 
   it("looks for the shell as the service worker does: in each copy's own cache, whatever its Vary", async () => {
     const shells = storage({ [cacheName(BUILD)]: ["/"], "another-cache": ["/"] })
-    await checkOfflineCopy(shells, BUILD)
+    await checkOfflineCopy(shells, BUILD, false)
     expect(shells.asked).toEqual([["/", { cacheName: cacheName(BUILD), ignoreVary: true }]])
   })
 })
 
 describe("offlineCopyOf", () => {
   it.each([
-    [[cacheName(BUILD)], "saved"],
-    [[cacheName("fedcba9876543210"), cacheName(BUILD)], "saved"],
-    [[cacheName("fedcba9876543210")], "older"],
-    [[], "none"],
-    [["another-cache"], "none"],
-  ])("with the caches %j, the offline copy is %s", (names, copy) => {
-    expect(offlineCopyOf(names, BUILD)).toBe(copy)
-  })
+    [[cacheName(BUILD)], false, "saved"],
+    [[cacheName(OLDER), cacheName(BUILD)], false, "saved"],
+    [[cacheName(OLDER)], false, "older"],
+    [[], false, "none"],
+    [["another-cache"], false, "none"],
+    [[cacheName(BUILD)], true, "saved"],
+    [[cacheName(NEWER)], true, "newer"],
+    [[cacheName(BUILD), cacheName(NEWER)], true, "newer"],
+    [[cacheName(NEWER), cacheName(BUILD)], true, "saved"],
+    [[], true, "none"],
+    [["another-cache"], true, "none"],
+  ])(
+    "with the caches %j, and a service worker taken over while open %s, the offline copy is %s",
+    (names, changed, copy) => {
+      expect(offlineCopyOf(names, BUILD, changed)).toBe(copy)
+    },
+  )
 })
 
 describe("pageBuild", () => {
```

- [ ] **Step 2: Run it to see it fail.** `pnpm exec vitest run apps/web/test/offline-copy.test.ts`. Expected: FAIL, 3 of 18 tests: "expected 'older' to be 'newer'".
- [ ] **Step 3: Write the newer copy.** `git checkout 48acf48 -- apps/web/src/features/settings/offline-copy.ts apps/web/src/features/settings/offline-copy-section.tsx`:

`apps/web/src/features/settings/offline-copy.ts`:

```diff
diff --git a/apps/web/src/features/settings/offline-copy.ts b/apps/web/src/features/settings/offline-copy.ts
index 219c1b7..4b1c8f5 100644
--- a/apps/web/src/features/settings/offline-copy.ts
+++ b/apps/web/src/features/settings/offline-copy.ts
@@ -1,4 +1,4 @@
-export type OfflineCopy = "saved" | "older" | "none"
+export type OfflineCopy = "saved" | "older" | "newer" | "none"
 
 export const BUILD_META_NAME = "bt-build"
 export const SHELL_CACHE_PREFIX = "bt-shell-"
@@ -13,19 +13,23 @@ interface StampedPage {
 export const pageBuild = (page: StampedPage) =>
   page.querySelector(`meta[name="${BUILD_META_NAME}"]`)?.getAttribute("content") ?? null
 
-export const offlineCopyOf = (cacheNames: readonly string[], build: string): OfflineCopy => {
-  if (cacheNames.includes(`${SHELL_CACHE_PREFIX}${build}`)) return "saved"
-  return cacheNames.some((name) => name.startsWith(SHELL_CACHE_PREFIX)) ? "older" : "none"
+export const offlineCopyOf = (cacheNames: readonly string[], build: string, workerChanged: boolean): OfflineCopy => {
+  const copies = cacheNames.filter((name) => name.startsWith(SHELL_CACHE_PREFIX))
+  const thisBuild = `${SHELL_CACHE_PREFIX}${build}`
+  if (copies.length === 0) return "none"
+  if (workerChanged) return copies.at(-1) === thisBuild ? "saved" : "newer"
+  return copies.includes(thisBuild) ? "saved" : "older"
 }
 
 const holdsShell = async (storage: ShellStorage, cacheName: string) =>
   (await storage.match(SHELL_PATH, { cacheName, ignoreVary: true })) !== undefined
 
-export const checkOfflineCopy = async (storage: ShellStorage, build: string) => {
+export const checkOfflineCopy = async (storage: ShellStorage, build: string, workerChanged: boolean) => {
   const copies = (await storage.keys()).filter((name) => name.startsWith(SHELL_CACHE_PREFIX))
   const held = await Promise.all(copies.map((name) => holdsShell(storage, name)))
   return offlineCopyOf(
     copies.filter((_, index) => held[index]),
     build,
+    workerChanged,
   )
 }
```

`apps/web/src/features/settings/offline-copy-section.tsx` (its `STATUS` must name every `OfflineCopy`, or the typecheck fails):

```diff
diff --git a/apps/web/src/features/settings/offline-copy-section.tsx b/apps/web/src/features/settings/offline-copy-section.tsx
index 3e87b23..913c554 100644
--- a/apps/web/src/features/settings/offline-copy-section.tsx
+++ b/apps/web/src/features/settings/offline-copy-section.tsx
@@ -8,6 +8,7 @@ const BUILD = pageBuild(document)
 const STATUS = {
   saved: "Saved for this version.",
   older: "An older version. It updates while the app is open online.",
+  newer: "A newer version is saved. It opens when you next come back to the app.",
   none: "Not saved yet.",
 } satisfies Record<OfflineCopy, string>
 
@@ -19,7 +20,7 @@ const statusOf = (copy: OfflineCopy | undefined, failed: boolean) => {
 const OfflineCopyStatus = ({ build }: { readonly build: string }) => {
   const { data, isError } = useQuery({
     queryKey: ["offline-copy", build],
-    queryFn: () => checkOfflineCopy(caches, build),
+    queryFn: () => checkOfflineCopy(caches, build, false),
     refetchInterval: ({ state }) => (state.data === "saved" ? false : CHECK_AGAIN_MS),
   })
   return (
```

- [ ] **Step 4: Run it to see it pass.** The same command. Expected: PASS, 18 tests. Then `pnpm typecheck`.
- [ ] **Step 5: Commit.** `git add apps/web/src/features/settings apps/web/test/offline-copy.test.ts`, then `git commit -m "Tell a newer offline copy from an older one: once a new service worker has taken over the open page, the copy saved last is the one it serves, so another build's copy is newer, even while the old copy is still being cleared"`.

---

### Task 3: What a return to the app does

**Files:**
- Create: `apps/web/src/shell/new-version.ts`
- Test: create `apps/web/test/new-version.test.ts`

**Interfaces:**
- Consumes: `Checked` (Task 1); `Sheets` (`src/sheets/sheets-context.ts`). In the test: `DIAPER`, `DIAPER_HELD` (`test/held-fixtures.ts`), `NOW` (`test/today-fixtures.ts`).
- Produces:
  - `isIdle(sheets: Pick<Sheets, "open" | "busy" | "held" | "toast">, page: { querySelector(selectors: string): Pick<Element, "matches"> | null; activeElement: Pick<Element, "matches"> | null }): boolean`, which `document` satisfies as the page
  - `interface Return { idle(): boolean; newerSaved(): Promise<boolean>; reload(): void; check(): Promise<Checked> }`
  - `type Returned = "reloaded" | "waiting" | Checked`
  - `returnToApp(steps: Return): Promise<Returned>`

- [ ] **Step 1: Write the failing test.** `git checkout 4f31955 -- apps/web/test/new-version.test.ts`:

`apps/web/test/new-version.test.ts`:

```ts
import { describe, expect, it } from "vitest"
import type { Checked } from "../src/service-worker/updates.ts"
import { isIdle, type Return, returnToApp } from "../src/shell/new-version.ts"
import { DIAPER, DIAPER_HELD } from "./held-fixtures.ts"
import { NOW } from "./today-fixtures.ts"

const QUIET = { open: null, busy: null, held: [], toast: null }
const ELEMENT = { matches: () => true }

const page = (opened: string | null, focused: string | null) => ({
  querySelector: (selectors: string) => (opened !== null && selectors.includes(opened) ? ELEMENT : null),
  activeElement: focused === null ? null : { matches: (selectors: string) => selectors.includes(focused) },
})

describe("isIdle", () => {
  it("is idle with nothing open, nothing being sent or kept, no Undo on screen and nothing being typed", () => {
    expect(isIdle(QUIET, page(null, null))).toBe(true)
    expect(isIdle(QUIET, page(null, "button"))).toBe(true)
  })

  it.each([
    ["a sheet is open", { ...QUIET, open: "diaper" as const }],
    ["an entry is on its way", { ...QUIET, busy: DIAPER }],
    ["an entry is kept on the phone", { ...QUIET, held: [DIAPER_HELD] }],
    ["Undo is on screen", { ...QUIET, toast: { message: "Saved", undo: DIAPER, until: NOW } }],
  ])("isn't idle while %s", (_case, sheets) => {
    expect(isIdle(sheets, page(null, null))).toBe(false)
  })

  it.each([
    ["a dialog", '[role="dialog"]', null],
    ["a confirmation", '[role="alertdialog"]', null],
    ["a text field has focus", null, "input"],
    ["a text area has focus", null, "textarea"],
    ["a picker has focus", null, "select"],
  ])("isn't idle while %s is open", (_case, opened, focused) => {
    expect(isIdle(QUIET, page(opened, focused))).toBe(false)
  })
})

const steps = (idle: ReadonlyArray<boolean>, newer: boolean) => {
  const done: Array<string> = []
  const answers = [...idle]
  const step: Return = {
    idle: () => answers.shift() ?? false,
    newerSaved: () => {
      done.push("looked")
      return Promise.resolve(newer)
    },
    reload: () => {
      done.push("reloaded")
    },
    check: (): Promise<Checked> => {
      done.push("checked")
      return Promise.resolve("checked")
    },
  }
  return { done, step }
}

describe("returnToApp", () => {
  it("opens a newer saved version when the app comes back idle", async () => {
    const { done, step } = steps([true, true], true)
    expect(await returnToApp(step)).toBe("reloaded")
    expect(done).toEqual(["looked", "reloaded"])
  })

  it("only checks for a new version when the app comes back busy, so nothing open is cut off", async () => {
    const { done, step } = steps([false], true)
    expect(await returnToApp(step)).toBe("checked")
    expect(done).toEqual(["checked"])
  })

  it("checks for a new version when none is saved yet", async () => {
    const { done, step } = steps([true], false)
    expect(await returnToApp(step)).toBe("checked")
    expect(done).toEqual(["looked", "checked"])
  })

  it("waits for the next return when something opens while it looks for the saved version", async () => {
    const { done, step } = steps([true, false], true)
    expect(await returnToApp(step)).toBe("waiting")
    expect(done).toEqual(["looked"])
  })
})
```

- [ ] **Step 2: Run it to see it fail.** `pnpm exec vitest run apps/web/test/new-version.test.ts`. Expected: FAIL, "Cannot find module '../src/shell/new-version.ts'".
- [ ] **Step 3: Write the rule.** `git checkout 4f31955 -- apps/web/src/shell/new-version.ts`:

`apps/web/src/shell/new-version.ts`:

```ts
import type { Checked } from "../service-worker/updates.ts"
import type { Sheets } from "../sheets/sheets-context.ts"

type SheetsNow = Pick<Sheets, "open" | "busy" | "held" | "toast">

interface PageNow {
  readonly querySelector: (selectors: string) => Pick<Element, "matches"> | null
  readonly activeElement: Pick<Element, "matches"> | null
}

const OPEN_DIALOG = '[role="dialog"], [role="alertdialog"]'
const TYPING = 'input, textarea, select, [contenteditable="true"]'

export const isIdle = (sheets: SheetsNow, page: PageNow) =>
  sheets.open === null &&
  sheets.busy === null &&
  sheets.held.length === 0 &&
  sheets.toast === null &&
  page.querySelector(OPEN_DIALOG) === null &&
  !(page.activeElement?.matches(TYPING) ?? false)

export interface Return {
  readonly idle: () => boolean
  readonly newerSaved: () => Promise<boolean>
  readonly reload: () => void
  readonly check: () => Promise<Checked>
}

export type Returned = "reloaded" | "waiting" | Checked

export const returnToApp = async ({ idle, newerSaved, reload, check }: Return): Promise<Returned> => {
  if (!idle()) return check()
  if (!(await newerSaved())) return check()
  if (!idle()) return "waiting"
  reload()
  return "reloaded"
}
```

- [ ] **Step 4: Run it to see it pass.** The same command. Expected: PASS, 14 tests. Then `pnpm typecheck`.
- [ ] **Step 5: Commit.** `git add apps/web/src/shell/new-version.ts apps/web/test/new-version.test.ts`, then `git commit -m "Decide what a return to the app does: open a newer saved version only when nothing is open, being sent, kept, undoable or typed in, and otherwise look for one"`.

---

### Task 4: The preview stands in for a deploy

**Files:**
- Create: `apps/web/preview-next-build.ts`
- Modify: `apps/web/vite.config.ts`
- Test: create `apps/web/test/preview-next-build.test.ts`

**Interfaces:**
- Consumes: `hasCookie` (`apps/web/preview-sign-out.ts`); `pageMark` (`src/service-worker/build-files.ts`). In the test: `markedPage`, `shellOf` (`apps/web/service-worker-build.ts`).
- Produces:
  - `NEXT_BUILD_COOKIE = "bt-preview-next-build"`, set to `1` by Task 5's spec
  - `nextVersionOf(version: string): string`, which is `` `${version}-next` ``
  - `nextWorker(worker: string): string` and `nextPage(page: string): string`
  - `previewNextBuild(): Plugin`

- [ ] **Step 1: Write the failing test.** `git checkout 63b6bce -- apps/web/test/preview-next-build.test.ts`:

`apps/web/test/preview-next-build.test.ts`:

```ts
import { describe, expect, it } from "vitest"
import { nextPage, nextVersionOf, nextWorker } from "../preview-next-build.ts"
import { markedPage, shellOf } from "../service-worker-build.ts"
import { pageMark } from "../src/service-worker/build-files.ts"

const BUILD = ["assets/index-CSxg7yjE.js", "sw.js", "assets/index-DDaxv4bF.css", "index.html"]
const HTML = '<html><head><script type="module" src="/assets/index-CSxg7yjE.js"></script></head><body></body></html>'
const WORKER_CODE = 'self.addEventListener("install", () => {})'

const built = () => {
  const shell = shellOf(BUILD, HTML)
  return {
    shell,
    worker: `const SHELL = ${JSON.stringify(shell)}\n${WORKER_CODE}`,
    page: markedPage(HTML, shell.version),
  }
}

describe("the preview's next build", () => {
  it("stamps the worker the build writes with the next version, and leaves its files and code alone", () => {
    const { shell, worker } = built()
    const next = { ...shell, version: nextVersionOf(shell.version) }
    expect(nextWorker(worker)).toBe(`const SHELL = ${JSON.stringify(next)}\n${WORKER_CODE}`)
  })

  it("stamps the page with the same next version, so the next worker's install takes it as its own", () => {
    const { shell, page } = built()
    expect(nextPage(page)).toBe(markedPage(HTML, nextVersionOf(shell.version)))
    expect(nextPage(page)).toContain(pageMark(`${shell.version}-next`))
  })

  it("refuses a worker or a page without its stamp, rather than serving another build's files", () => {
    expect(() => nextWorker(WORKER_CODE)).toThrow("/sw.js doesn't start with its SHELL")
    expect(() => nextPage(HTML)).toThrow("the page isn't stamped with its build")
  })
})
```

- [ ] **Step 2: Run it to see it fail.** `pnpm exec vitest run apps/web/test/preview-next-build.test.ts`. Expected: FAIL, "Cannot find module '../preview-next-build.ts'".
- [ ] **Step 3: Write the plugin, and add it to the preview.** `git checkout 63b6bce -- apps/web/preview-next-build.ts apps/web/vite.config.ts`:

`apps/web/preview-next-build.ts`:

```ts
import { readFile } from "node:fs/promises"
import type { IncomingMessage, ServerResponse } from "node:http"
import { resolve } from "node:path"
import type { Plugin } from "vite"
import { hasCookie } from "./preview-sign-out.ts"
import { pageMark } from "./src/service-worker/build-files.ts"

export const NEXT_BUILD_COOKIE = "bt-preview-next-build"

const CLIENT_BUILD = "dist/client"
const WORKER_PATH = "/sw.js"
const SHELL_VERSION = /^(const SHELL = \{"version":")([^"]+)"/u
const PAGE_BUILD = /<meta name="bt-build" content="([^"]+)">/u

export const nextVersionOf = (version: string) => `${version}-next`

export const nextWorker = (worker: string) => {
  if (!SHELL_VERSION.test(worker)) throw new Error(`${WORKER_PATH} doesn't start with its SHELL`)
  return worker.replace(SHELL_VERSION, (_line, start: string, version: string) => `${start}${nextVersionOf(version)}"`)
}

export const nextPage = (page: string) => {
  const version = PAGE_BUILD.exec(page)?.[1]
  if (version === undefined) throw new Error("the page isn't stamped with its build")
  return page.replace(pageMark(version), pageMark(nextVersionOf(version)))
}

const pathOf = (request: IncomingMessage) => new URL(request.url ?? "/", "http://preview.test").pathname

const isPage = (request: IncomingMessage) => {
  const path = pathOf(request)
  if (path.startsWith("/api/")) return false
  return path === "/" || (request.headers.accept?.includes("text/html") ?? false)
}

const serve = async (response: ServerResponse, file: string, type: string, stamp: (text: string) => string) => {
  try {
    const text = stamp(await readFile(file, "utf8"))
    response.writeHead(200, { "content-type": type, "cache-control": "no-cache" })
    response.end(text)
  } catch (error) {
    response.writeHead(500, { "content-type": "text/plain; charset=utf-8" })
    response.end(`The preview couldn't serve the next build: ${error instanceof Error ? error.message : String(error)}`)
  }
}

export const previewNextBuild = (): Plugin => ({
  name: "bt:preview-next-build",
  configurePreviewServer(server) {
    const client = resolve(server.config.root, CLIENT_BUILD)
    server.middlewares.use((request, response, next) => {
      if (!hasCookie(request.headers.cookie, NEXT_BUILD_COOKIE)) return next()
      if (pathOf(request) === WORKER_PATH)
        return void serve(response, resolve(client, "sw.js"), "text/javascript", nextWorker)
      if (isPage(request))
        return void serve(response, resolve(client, "index.html"), "text/html; charset=utf-8", nextPage)
      next()
    })
  },
})
```

`apps/web/vite.config.ts`:

```diff
diff --git a/apps/web/vite.config.ts b/apps/web/vite.config.ts
index 6596334..c1d3481 100644
--- a/apps/web/vite.config.ts
+++ b/apps/web/vite.config.ts
@@ -3,6 +3,7 @@ import { cloudflare } from "@cloudflare/vite-plugin"
 import tailwindcss from "@tailwindcss/vite"
 import react from "@vitejs/plugin-react"
 import { defineConfig } from "vite"
+import { previewNextBuild } from "./preview-next-build.ts"
 import { previewSignOut } from "./preview-sign-out.ts"
 import { previewSlowPages } from "./preview-slow-pages.ts"
 import { serviceWorker } from "./service-worker-build.ts"
@@ -11,6 +12,7 @@ export default defineConfig({
   plugins: [
     previewSignOut(),
     previewSlowPages(),
+    previewNextBuild(),
     serviceWorker(),
     react(),
     tailwindcss(),
```

- [ ] **Step 4: Run it to see it pass.** The same command. Expected: PASS, 3 tests. Then `pnpm typecheck` and `pnpm lint`.
- [ ] **Step 5: Commit.** `git add apps/web/preview-next-build.ts apps/web/vite.config.ts apps/web/test/preview-next-build.test.ts`, then `git commit -m "Let the preview stand in for a deploy: with bt-preview-next-build=1 it serves the same build stamped <version>-next in sw.js and every page"`.

---

### Task 5: Pick up a deploy without closing the app

**Files:**
- Create: `apps/web/src/shell/new-version-on-return.tsx`
- Modify: `apps/web/src/main.tsx`, `apps/web/src/app-context.ts`, `apps/web/src/shell/shell.tsx`, `apps/web/src/features/settings/offline-copy-section.tsx`
- Test: create `e2e/new-version.spec.ts`

**Interfaces:**
- Consumes: `watchUpdates`, `Updates` (Task 1); `checkOfflineCopy`, `pageBuild` (Task 2 and M5.4); `isIdle`, `returnToApp` (Task 3); `bt-preview-next-build` (Task 4); `useSheets` (`src/sheets/sheets-context.ts`); `focusManager`, `keepPreviousData` (`@tanstack/react-query`); `Button` (`src/components/ui/button.tsx`). In the spec: `quickAction` (`e2e/played-household.ts`).
- Produces:
  - `App.updates: Updates`, in the app context
  - `NewVersionOnReturn`, rendered once inside `SheetsProvider`
  - Settings' newer line and **Open it now**

- [ ] **Step 1: Write the failing spec.** `git checkout 59b8eb4 -- e2e/new-version.spec.ts`:

`e2e/new-version.spec.ts`:

```ts
import { type BrowserContext, expect, type Page, test, type WebSocketRoute } from "@playwright/test"
import { quickAction } from "./played-household.ts"

test.use({ serviceWorkers: "allow" })

const NEXT_BUILD_COOKIE = "bt-preview-next-build"
const NEWER = "A newer version is saved. It opens when you next come back to the app."
const SAVED = "Saved for this version."
const SAVING_TAKES_MS = 15_000

const openWithSavedCopy = async (page: Page) => {
  await page.goto("/")
  await expect(page.getByText("Robin")).toBeVisible()
  await expect.poll(() => page.evaluate<boolean>("navigator.serviceWorker.controller !== null")).toBe(true)
}

const buildOf = (page: Page) =>
  page.evaluate<string | null>(`document.querySelector('meta[name="bt-build"]')?.getAttribute("content") ?? null`)

const deploy = (context: BrowserContext, baseURL: string | undefined) =>
  context.addCookies([{ name: NEXT_BUILD_COOKIE, value: "1", url: baseURL ?? "" }])

const leaveAndComeBack = (page: Page) =>
  page.evaluate(`(() => {
    const show = (state) => {
      Object.defineProperty(document, "visibilityState", { value: state, configurable: true })
      document.dispatchEvent(new Event("visibilitychange", { bubbles: true }))
    }
    show("hidden")
    show("visible")
  })()`)

const afterItLooksAtItsCopy = (page: Page) => page.evaluate("caches.keys().then(() => undefined)")

const markThisPage = (page: Page) => page.evaluate("window.btSamePage = true")
const isSamePage = (page: Page) => page.evaluate<boolean>("window.btSamePage === true")

const tab = (page: Page, name: string) =>
  page.getByRole("navigation", { name: "Main" }).getByRole("link", { name }).click()

test("saves a new version when a deploy drops the household's connection, and opens it when the app comes back", async ({
  page,
  context,
  baseURL,
}) => {
  const sockets: Array<WebSocketRoute> = []
  await page.routeWebSocket(/\/api\/ws$/u, (socket) => {
    socket.connectToServer()
    sockets.push(socket)
  })
  await openWithSavedCopy(page)
  const build = await buildOf(page)
  await deploy(context, baseURL)
  await Promise.all(sockets.map((socket) => socket.close({ code: 1012, reason: "Deployed" })))
  await tab(page, "Settings")
  await expect(page.getByText(NEWER)).toBeVisible({ timeout: SAVING_TAKES_MS })
  await markThisPage(page)
  const reloaded = page.waitForEvent("load")
  await leaveAndComeBack(page)
  await reloaded
  await expect(page.getByText(SAVED)).toBeVisible()
  expect(await isSamePage(page)).toBe(false)
  expect(await buildOf(page)).toBe(`${build}-next`)
})

test("checks for a new version when the app comes back, and Open it now opens it at once", async ({
  page,
  context,
  baseURL,
}) => {
  await openWithSavedCopy(page)
  const build = await buildOf(page)
  await tab(page, "Settings")
  await expect(page.getByText(SAVED)).toBeVisible()
  await deploy(context, baseURL)
  await leaveAndComeBack(page)
  await expect(page.getByText(NEWER)).toBeVisible({ timeout: SAVING_TAKES_MS })
  const reloaded = page.waitForEvent("load")
  await page.getByRole("button", { name: "Open it now" }).click()
  await reloaded
  await expect(page.getByText(SAVED)).toBeVisible()
  expect(await buildOf(page)).toBe(`${build}-next`)
})

test("opens the saved new version when the app comes back without a connection", async ({ page, context, baseURL }) => {
  await openWithSavedCopy(page)
  const build = await buildOf(page)
  await deploy(context, baseURL)
  await tab(page, "Settings")
  await leaveAndComeBack(page)
  await expect(page.getByText(NEWER)).toBeVisible({ timeout: SAVING_TAKES_MS })
  await page.routeWebSocket(/\/api\/ws$/u, (socket) => socket.close({ code: 1011, reason: "offline" }))
  await context.setOffline(true)
  const reloaded = page.waitForEvent("load")
  await leaveAndComeBack(page)
  await reloaded
  await expect(page.getByText(SAVED)).toBeVisible()
  expect(await buildOf(page)).toBe(`${build}-next`)
})

test("keeps an open sheet when the app comes back, and opens the new version on the next return once it's closed", async ({
  page,
  context,
  baseURL,
}) => {
  await openWithSavedCopy(page)
  const build = await buildOf(page)
  await deploy(context, baseURL)
  await tab(page, "Settings")
  await leaveAndComeBack(page)
  await expect(page.getByText(NEWER)).toBeVisible({ timeout: SAVING_TAKES_MS })
  await tab(page, "Today")
  const sheet = page.getByRole("dialog", { name: "Diaper" })
  await quickAction(page, "Diaper").click()
  await expect(sheet).toBeVisible()
  await markThisPage(page)
  await leaveAndComeBack(page)
  await afterItLooksAtItsCopy(page)
  await expect(sheet).toBeVisible()
  await page.keyboard.press("Escape")
  await expect(sheet).toBeHidden()
  expect(await isSamePage(page)).toBe(true)
  const reloaded = page.waitForEvent("load")
  await leaveAndComeBack(page)
  await reloaded
  expect(await isSamePage(page)).toBe(false)
  expect(await buildOf(page)).toBe(`${build}-next`)
})
```

- [ ] **Step 2: Run it to see it fail.** `pnpm exec playwright test --config .superpowers/e2e.config.ts new-version`. Expected: FAIL, 8 of 8 (4 in each engine): the newer line never shows.
- [ ] **Step 3: Invoke `frontend-ui-expert` and `react-code-standards`**, to check the component and the Settings row below against the codebase's rules (Global Constraints, React).
- [ ] **Step 4: Watch the app's worker, and check on every reconnect.** `git checkout 59b8eb4 -- apps/web/src/main.tsx apps/web/src/app-context.ts`:

`apps/web/src/main.tsx`:

```diff
diff --git a/apps/web/src/main.tsx b/apps/web/src/main.tsx
index b33302c..24070b6 100644
--- a/apps/web/src/main.tsx
+++ b/apps/web/src/main.tsx
@@ -11,6 +11,7 @@ import { createQueryClient } from "./api/query-client.ts"
 import { refreshPeriodsOnZoneChange } from "./api/zone-change.ts"
 import { AppContext } from "./app-context.ts"
 import { registerServiceWorker } from "./service-worker/register.ts"
+import { watchUpdates } from "./service-worker/updates.ts"
 import { takeDraft } from "./sheets/drafts.ts"
 import { keptStorage, readKept } from "./sheets/kept.ts"
 import { restored } from "./sheets/restored.ts"
@@ -26,6 +27,7 @@ const api = connectApi({ report: connectivity.report })
 const queryClient = createQueryClient()
 refreshPeriodsOnZoneChange(queryClient)
 const freshness = trackFreshness(queryClient.getQueryCache(), connectivity)
+const updates = watchUpdates(import.meta.env.PROD ? navigator.serviceWorker : undefined)
 const draft = takeDraft(() => sessionStorage, `${window.location.pathname}${window.location.search}`)
 const kept = restored(draft, readKept(keptStorage), Date.now(), () => crypto.randomUUID())
 const live = startLive({
@@ -33,7 +35,10 @@ const live = startLive({
   onChanged: (keys) => {
     for (const queryKey of keys) void queryClient.invalidateQueries({ queryKey })
   },
-  onStale: () => void queryClient.invalidateQueries(),
+  onStale: () => {
+    void queryClient.invalidateQueries()
+    void updates.check()
+  },
   report: connectivity.report,
 })
 window.addEventListener("online", live.wake)
@@ -41,7 +46,7 @@ if (import.meta.env.PROD) window.addEventListener("load", () => void registerSer
 
 createRoot(root).render(
   <StrictMode>
-    <AppContext value={{ api, connectivity, freshness, restored: kept }}>
+    <AppContext value={{ api, connectivity, freshness, restored: kept, updates }}>
       <QueryClientProvider client={queryClient}>
         <RouterProvider router={router} />
       </QueryClientProvider>
```

`apps/web/src/app-context.ts`:

```diff
diff --git a/apps/web/src/app-context.ts b/apps/web/src/app-context.ts
index b4802b5..b5c4d5c 100644
--- a/apps/web/src/app-context.ts
+++ b/apps/web/src/app-context.ts
@@ -2,6 +2,7 @@ import { createContext, use } from "react"
 import type { HouseholdApi } from "./api/client.ts"
 import type { ConnectivityStore } from "./api/connectivity.ts"
 import type { Freshness } from "./api/freshness.ts"
+import type { Updates } from "./service-worker/updates.ts"
 import type { Restored } from "./sheets/restored.ts"
 
 export interface App {
@@ -9,6 +10,7 @@ export interface App {
   readonly connectivity: ConnectivityStore
   readonly freshness: Freshness
   readonly restored: Restored
+  readonly updates: Updates
 }
 
 export const AppContext = createContext<App | null>(null)
```

- [ ] **Step 5: Switch on a return with nothing open.** `git checkout 59b8eb4 -- apps/web/src/shell/new-version-on-return.tsx apps/web/src/shell/shell.tsx`:

`apps/web/src/shell/new-version-on-return.tsx`:

```tsx
import { focusManager } from "@tanstack/react-query"
import { useEffect, useEffectEvent } from "react"
import { useApp } from "../app-context.ts"
import { checkOfflineCopy, pageBuild } from "../features/settings/offline-copy.ts"
import { useSheets } from "../sheets/sheets-context.ts"
import { isIdle, returnToApp } from "./new-version.ts"

const BUILD = pageBuild(document)

export const NewVersionOnReturn = () => {
  const sheets = useSheets()
  const { updates } = useApp()
  const idle = useEffectEvent(() => isIdle(sheets, document))
  const returned = useEffectEvent((build: string) =>
    returnToApp({
      idle: () => idle(),
      newerSaved: () =>
        checkOfflineCopy(caches, build, updates.changes() > 0).then(
          (copy) => copy === "newer",
          () => false,
        ),
      reload: () => window.location.reload(),
      check: updates.check,
    }),
  )
  useEffect(function switchOnReturn() {
    if (BUILD === null) return
    const build = BUILD
    return focusManager.subscribe((focused) => {
      if (focused) void returned(build)
    })
  }, [])
  return null
}
```

`apps/web/src/shell/shell.tsx`:

```diff
diff --git a/apps/web/src/shell/shell.tsx b/apps/web/src/shell/shell.tsx
index 264ac06..f5072fd 100644
--- a/apps/web/src/shell/shell.tsx
+++ b/apps/web/src/shell/shell.tsx
@@ -6,6 +6,7 @@ import { SheetsProvider } from "../sheets/sheets-provider.tsx"
 import { UndoToast } from "../sheets/undo-toast.tsx"
 import { ConnectionBanner } from "./connection-banner.tsx"
 import { LogSheets } from "./log-sheets.tsx"
+import { NewVersionOnReturn } from "./new-version-on-return.tsx"
 import { TabBar } from "./tab-bar.tsx"
 
 export const Shell = () => {
@@ -25,6 +26,7 @@ export const Shell = () => {
       </div>
       <UndoToast />
       <LogSheets />
+      <NewVersionOnReturn />
     </SheetsProvider>
   )
 }
```

- [ ] **Step 6: Say it in Settings, with Open it now.** `git checkout 59b8eb4 -- apps/web/src/features/settings/offline-copy-section.tsx`:

`apps/web/src/features/settings/offline-copy-section.tsx`:

```diff
diff --git a/apps/web/src/features/settings/offline-copy-section.tsx b/apps/web/src/features/settings/offline-copy-section.tsx
index 913c554..fdae67d 100644
--- a/apps/web/src/features/settings/offline-copy-section.tsx
+++ b/apps/web/src/features/settings/offline-copy-section.tsx
@@ -1,4 +1,7 @@
-import { useQuery } from "@tanstack/react-query"
+import { keepPreviousData, useQuery } from "@tanstack/react-query"
+import { useSyncExternalStore } from "react"
+import { useApp } from "../../app-context.ts"
+import { Button } from "../../components/ui/button.tsx"
 import { checkOfflineCopy, type OfflineCopy, pageBuild } from "./offline-copy.ts"
 import { SettingsSection } from "./settings-section.tsx"
 
@@ -12,16 +15,30 @@ const STATUS = {
   none: "Not saved yet.",
 } satisfies Record<OfflineCopy, string>
 
+const SETTLED = new Set<OfflineCopy | undefined>(["saved", "newer"])
+
 const statusOf = (copy: OfflineCopy | undefined, failed: boolean) => {
   if (failed) return "Couldn't be checked on this phone."
   return copy === undefined ? "Checking…" : STATUS[copy]
 }
 
+const NewerCopy = () => (
+  <div className="flex items-center justify-between gap-3">
+    <p className="text-base">{STATUS.newer}</p>
+    <Button size="lg" onClick={() => window.location.reload()}>
+      Open it now
+    </Button>
+  </div>
+)
+
 const OfflineCopyStatus = ({ build }: { readonly build: string }) => {
+  const { updates } = useApp()
+  const changes = useSyncExternalStore(updates.subscribe, updates.changes)
   const { data, isError } = useQuery({
-    queryKey: ["offline-copy", build],
-    queryFn: () => checkOfflineCopy(caches, build, false),
-    refetchInterval: ({ state }) => (state.data === "saved" ? false : CHECK_AGAIN_MS),
+    queryKey: ["offline-copy", build, changes],
+    queryFn: () => checkOfflineCopy(caches, build, changes > 0),
+    placeholderData: keepPreviousData,
+    refetchInterval: ({ state }) => (SETTLED.has(state.data) ? false : CHECK_AGAIN_MS),
   })
   return (
     <SettingsSection
@@ -29,7 +46,7 @@ const OfflineCopyStatus = ({ build }: { readonly build: string }) => {
       title="Offline copy"
       hint="What the app opens with when there's no connection."
     >
-      <p className="text-base">{statusOf(data, isError)}</p>
+      {data === "newer" && !isError ? <NewerCopy /> : <p className="text-base">{statusOf(data, isError)}</p>}
     </SettingsSection>
   )
 }
```

- [ ] **Step 7: Run the specs.** `pnpm exec playwright test --config .superpowers/e2e.config.ts new-version`. Expected: PASS, 8 tests. Then `pnpm exec playwright test --config .superpowers/e2e.config.ts offline settings sheets-offline` (all pass), `pnpm typecheck`, `pnpm lint` and `pnpm test`, which includes `scripts/page-lifecycle.test.ts`.
- [ ] **Step 8: Commit.** `git add apps/web/src e2e/new-version.spec.ts`, then `git commit -m "Pick up a deploy without closing the app: look for a new version on every return and every reconnect, open the saved one on the next return with nothing open, and say in Settings when a newer one is saved, with Open it now"`.

---

### Task 6: The docs

**Files:**
- Modify: `CLAUDE.md` (the release rule, and the service-workers-in-E2E rule)
- Modify: `docs/runbooks/access.md` (step 5 after a deploy)
- Modify: `docs/implementation-plan.md` (§3.5's client bullet, and the M1.14 row)
- Modify: `scripts/release-checks.ts` (`releasedReport`)
- Test: modify `scripts/release-checks.test.ts`

- [ ] **Step 1: Write the failing test.** `git checkout 817e056 -- scripts/release-checks.test.ts`:

`scripts/release-checks.test.ts`:

```diff
diff --git a/scripts/release-checks.test.ts b/scripts/release-checks.test.ts
index 652c84e..d07b838 100644
--- a/scripts/release-checks.test.ts
+++ b/scripts/release-checks.test.ts
@@ -279,11 +279,11 @@ describe("what a release reports", () => {
     )
   })
 
-  it("names the commit once it's live, and reminds about the phones", () => {
+  it("names the commit once it's live, and says how the phones pick it up", () => {
     expect(releasedReport(COMMIT)).toBe(
       [
         "Released 20390a3 to https://baby.andamonium.dev.",
-        "Open the app online on each phone, so its offline copy updates to this build.",
+        "Each phone opens this build the next time the app comes back with nothing open. Settings › Offline copy says which build a phone has.",
       ].join("\n\n"),
     )
   })
```

- [ ] **Step 2: Run it to see it fail.** `pnpm exec vitest run scripts/release-checks.test.ts`. Expected: FAIL, 1 of 41: the report still asks to open the app on each phone.
- [ ] **Step 3: Write them.** `git checkout 817e056 -- scripts/release-checks.ts CLAUDE.md docs/runbooks/access.md docs/implementation-plan.md`, with the behaviour the build ended with if a review changed it:

`scripts/release-checks.ts`:

```diff
diff --git a/scripts/release-checks.ts b/scripts/release-checks.ts
index fd290d2..65ec129 100644
--- a/scripts/release-checks.ts
+++ b/scripts/release-checks.ts
@@ -153,5 +153,5 @@ export const restorePointReport = (restorePoint: string): string =>
 export const releasedReport = (commit: string): string =>
   [
     `Released ${commit.slice(0, 7)} to https://${PRODUCTION_HOSTNAME}.`,
-    "Open the app online on each phone, so its offline copy updates to this build.",
+    "Each phone opens this build the next time the app comes back with nothing open. Settings › Offline copy says which build a phone has.",
   ].join("\n\n")
```

`CLAUDE.md`:

```diff
diff --git a/CLAUDE.md b/CLAUDE.md
index 105a1b9..0bf3945 100644
--- a/CLAUDE.md
+++ b/CLAUDE.md
@@ -17,11 +17,11 @@ Work is tracked in GitHub issues. The Baby Tracker Roadmap artifact was frozen o
 
 ## Cross-cutting rules
 
-- **Releases:** a merge to `main` deploys once CI passes on it (`deploy.yml`), so say in a PR's description that merging deploys it. `pnpm release` in the main checkout is the fallback, on Andrew's word only, and a Durable Object class change can only deploy by hand. Deploys, pausing them and recovering from a bad one are in `docs/runbooks/access.md`. After each deploy, Andrew opens the app online once on each phone, so its offline copy updates.
+- **Releases:** a merge to `main` deploys once CI passes on it (`deploy.yml`), so say in a PR's description that merging deploys it. `pnpm release` in the main checkout is the fallback, on Andrew's word only, and a Durable Object class change can only deploy by hand. Deploys, pausing them and recovering from a bad one are in `docs/runbooks/access.md`. A phone picks up a deploy by itself (#61): it saves the new build the next time it's online, and opens it the next time the app comes back with nothing open. Settings › Offline copy says which build a phone has.
 - **Migrations:** they're forward-only. Before one merges, run `pnpm migrations:dry-run` on a fresh `pnpm admin export` (it rebuilds the tables from the export's `migrations`, loads its rows, then applies the new migration with foreign keys on, as the Durable Object does), run the restore drill in `docs/runbooks/restore.md`, and run `pnpm bench`. Run `pnpm bench` after any change to a period read, too.
 - **Receipts after a deploy:** every endpoint built on `mutations` (`apps/worker/src/mutations.ts`) stores its response as a receipt, which a retry within a day replays: today `Diaper`, `Feed`, `Measurement`, `Sleep`, `Household` and `Child`. A field that's added, removed or renamed, or a tightened check, must stay decodable for 24 hours, or that retry answers 500. Only `Feed` has a test for it: `apps/worker/test/feeds.test.ts`'s "decode the response and changed keys stored before a deploy…".
 - **Installed apps after a deploy:** an app older than the Worker reads `ChangedMessage`, so add fields to it, but never rename or remove one.
 - **25-hour days in tests:** tzdata 2026c keeps America/Vancouver on UTC−7 after 1 Nov 2026, so it has no 25-hour day that year; use America/Los_Angeles.
-- **Service workers in E2E:** `playwright.config.ts` blocks them, so `page.route` sees every request; only `offline.spec.ts` and `sheets-offline.spec.ts` allow them. Playwright's block resolves `register` rather than refusing it, so no E2E test sees a refused registration.
+- **Service workers in E2E:** `playwright.config.ts` blocks them, so `page.route` sees every request; only `offline.spec.ts`, `sheets-offline.spec.ts` and `new-version.spec.ts` allow them. `new-version.spec.ts` deploys by cookie: with `bt-preview-next-build=1`, the preview serves the same build stamped `<version>-next` (`apps/web/preview-next-build.ts`). Playwright's block resolves `register` rather than refusing it, so no E2E test sees a refused registration.
 - **Offline in WebKit tests:** `setOffline` closes open sockets but still lets a new one connect, and the app counts an open socket as online. An offline test that asserts "No connection" should also refuse `/api/ws`, as `goOfflineLikeAPhone` does.
 - **Local E2E state:** settings changes made in `pnpm dev` land in `apps/web/.wrangler/state`, which `pnpm e2e` shares, so a renamed child or changed units fails specs such as `shell.spec.ts`'s `/api/me` check. Delete that folder to start over; CI always starts empty.
```

`docs/runbooks/access.md`:

```diff
diff --git a/docs/runbooks/access.md b/docs/runbooks/access.md
index 5ad43f4..f7c474d 100644
--- a/docs/runbooks/access.md
+++ b/docs/runbooks/access.md
@@ -105,7 +105,7 @@ Every push to `main` deploys itself once CI passes (M5.7):
 
    It then uploads the build as a new version, tagged with the commit (`wrangler versions upload`). Nothing is live yet. Next it notes the restore point, the current UTC second, and puts that version live (`wrangler versions deploy <version>@100%`). The deployment's message reads like `20390a3 restore point 2026-10-12T15:49:59Z ci:18233456789`.
 4. The run's summary gives the restore point and the command that rewinds the household to it, before the version goes live. It then says "Released …" once the version is live.
-5. Open the app online on each phone once, so its offline copy moves to the new build. After a deploy whose PR says "device checklist after deploy", run the device checklist in `docs/implementation-plan.md` §6 too.
+5. Nothing to do on the phones (#61). Every deploy drops the household's live connection, and the app checks for a new version whenever it reconnects or comes back from the background, so each phone saves the new build the next time it's online. It opens it the next time the app comes back with nothing open: no sheet, nothing being sent or kept on the phone, no Undo and no field being typed in. Settings › Offline copy says which build a phone has, and **Open it now** switches at once. After a deploy whose PR says "device checklist after deploy", run the device checklist in `docs/implementation-plan.md` §6.
 
 - **The record:** `pnpm --filter @bt/web exec wrangler deployments list --config ../worker/wrangler.jsonc` shows the 10 most recent deploys with their messages, whether CI or your Mac ran them. CI's deploys show no author, because the token belongs to the account rather than a person. Their message's `ci:<run id>` names the run instead, and a deploy from your Mac ends in `local`. For an older deploy, open its Deploy run (`gh run list --workflow deploy.yml`). Its summary and its log (`gh run view <run id> --log`) hold the restore point, and GitHub keeps them 90 days. `deploys.log` in the main checkout stopped growing with M5.7. Its bookmarks still restore until PITR ages them out, from about 10 November 2026.
 - **A failed deploy:** GitHub emails a failed run to the person it's attributed to, normally whoever merged.
```

`docs/implementation-plan.md`:

```diff
diff --git a/docs/implementation-plan.md b/docs/implementation-plan.md
index 8f6880a..d49cafd 100644
--- a/docs/implementation-plan.md
+++ b/docs/implementation-plan.md
@@ -135,7 +135,7 @@ Pure functions. Each takes `now` and `tz` as arguments; nothing reads the clock
 ### 3.5 Shared timer engine (web + server)
 
 - **Server:** timer state is rows (D2/D3). A feed's segments and a sleep each have their own store, since a sleep is one row and a segment is part of a feed. They share the domain's `Span`, its validation and `FUTURE_TOLERANCE_MS`, so a running side or sleep reaches 5 minutes past now in every overlap check, and the core's `errorAt` and `invalidUnless` (`core/fields.ts`, M3.1).
-- **Client:** `useNow()` (M1.11) is a clock that ticks as each second begins, read through `useSyncExternalStore`. Elapsed time comes from the server's timestamps through `feedSummary` and `formatElapsed` for a running or paused feed; the time since the last feed counts from its `startedAt`. The clock only redraws. TanStack Query's `refetchOnWindowFocus` refetches on `visibilitychange → visible`; nothing there sends a mutation. `scripts/page-lifecycle.test.ts` (M1.12) fails on any `pagehide`, `beforeunload` or `visibilitychange` handler anywhere in `apps/web/src`.
+- **Client:** `useNow()` (M1.11) is a clock that ticks as each second begins, read through `useSyncExternalStore`. Elapsed time comes from the server's timestamps through `feedSummary` and `formatElapsed` for a running or paused feed; the time since the last feed counts from its `startedAt`. The clock only redraws. TanStack Query's `refetchOnWindowFocus` refetches on `visibilitychange → visible`; nothing there sends a mutation. `scripts/page-lifecycle.test.ts` (M1.12) fails on any `pagehide`, `beforeunload` or `visibilitychange` handler anywhere in `apps/web/src`. Switching to a saved new version when the app comes back (#61) subscribes to TanStack Query's `focusManager` rather than adding a handler, and sends nothing.
 - Shared UI: the Nursing sheet's views (M1.12): start, with the last side tagged; running, with Switch, Pause, Add bottle and Finish; paused, with Resume; and the finish step, which corrects the stop time no earlier than the running side's start, where stopping at the start drops that side and asks "Delete this feed?" if nothing else is left. M1.11's feed card shows a running or paused feed.
 - The shared lifecycle test suite (§6, AC 20) is `apps/worker/test/timer-lifecycle.test.ts` (M3.1). It runs a nursing feed and a sleep through the same cases: a start, Today counting up, a stop, one running at a time, 5 minutes of clock skew (AC 21), two phones' stops (AC 13) and a timer across midnight (AC 4, AC 12).
 
@@ -164,7 +164,7 @@ Goal: both parents use it daily. Covers AC 1–5, 10, 11, 13, 14, 20 (nursing ha
 | M1.11 Today screen: status cards (last feed + "Since last feed started", today's totals, diaper counts), quick-action bar, recent list | M | Designed for a one-glance read after unlock. The feed card counts from the last feed's start, or shows the running or paused feed. The totals switch between today and the last 24 hours, opening on today (decided 10 Oct 2026). The recent list skips kinds the app doesn't know. The quick-action bar waits for M1.12's sheets |
 | M1.12 Sheets: Bottle (steppers ±10 mL / 0.5 oz, prefilled, one-tap save), Diaper (Pee / Poo / Both, 1 tap each = 2 taps from Today), Nursing (start L/R, pause/resume, switch, add bottle, finish with stop-time correction), manual feed entry and backdating | L | Tap-budget E2E tests count interactions (AC 2). AC 11's offline E2E moved here from M1.14 (decided 9 Oct 2026): open offline, show the last Today (kept in memory or Query cache for the session), keep the form, Retry once. A bottle tops up a feed that's running or paused; a past feed is its start, the first side and the minutes on each side; each new entry offers Undo for five seconds; the last side is tagged, not suggested; conflicts get plain messages, and finishing at a side's start asks "Delete this feed?" (decided 10 Oct 2026). The quick actions wait for Today |
 | M1.13 409 UX: "Emily changed this a moment ago" with Reload / Reapply; active-feed conflict prompt (§3 nursing) | S | M1.12 shows a plain message for each conflict and asks "Delete this feed?" in its own finish; M1.13 adds Reload, Reapply, and applying replayed values as an edit. **Decided 11 Oct 2026:** after the other phone's change, the note offers a redo ("Switch anyway", "Pause anyway", "Resume anyway", "Finish anyway" or "Add it anyway") only when the tap still fits the feed as it is now, and otherwise OK; "Save my changes" saves a diaper's or a bottle's new values as an edit, while a nursing or past feed says it was saved as first entered until M3.4's editing; a start that meets a running feed shows it and offers "Switch to {side}" ("Resume on {side}" when it's paused); the buttons use plain verbs |
-| M1.14 Service worker (assets only; precache build output; network-only for `/api/*`), manifest, icons | S | Access gates the shell and `/sw.js` (S4), so the service worker installs and updates only while signed in. It saves `/` and the build's `assets/`, tries the network first for pages, and stays out of `/api/*`, so Sign in and every household call reach the network. An install whose files don't all arrive as this build's fails, so the previous copy stays. It saves `/` only after every other file, so a phone that runs out of space mid-save can't keep a page that Settings would call "Saved for this version." (M5.1, from M5.4's review). Offline E2E: the app and any tab's address open from the saved copy. AC 11's full flow moved to M1.12, which builds the forms (decided 9 Oct 2026) |
+| M1.14 Service worker (assets only; precache build output; network-only for `/api/*`), manifest, icons | S | Access gates the shell and `/sw.js` (S4), so the service worker installs and updates only while signed in. It saves `/` and the build's `assets/`, tries the network first for pages, and stays out of `/api/*`, so Sign in and every household call reach the network. An install whose files don't all arrive as this build's fails, so the previous copy stays. It saves `/` only after every other file, so a phone that runs out of space mid-save can't keep a page that Settings would call "Saved for this version." (M5.1, from M5.4's review). Offline E2E: the app and any tab's address open from the saved copy. AC 11's full flow moved to M1.12, which builds the forms (decided 9 Oct 2026). **Decided 13 Oct 2026 (#61):** a phone left open picks up a deploy by itself. It asks the service worker to check for a new version when the app comes back from the background and when its live connection reconnects, since every deploy restarts the Durable Object and drops it. It reloads into the saved version the next time it comes back with nothing open: no sheet, nothing being sent or kept on the phone, no Undo and no field being typed in. Until then Settings › Offline copy reads "A newer version is saved. It opens when you next come back to the app.", with Open it now. Once a new service worker has taken over the open page, Settings trusts the copy saved last, since `caches.keys()` lists copies in the order they were made and Chromium announces the new worker while the old copy is still there |
 | M1.15 Settings minimum: child profile, household timezone, units, signed-in account | S | Units are one household setting: mL or fl oz, kg, g or lb & oz, and cm or in (decided 9 Oct 2026). `PATCH /api/household` and `PATCH /api/child` edit the two records, each versioned, and `GET /api/me` carries both whole. A birth date can't be after today or after the earliest entry. A save that meets the other phone's newer copy reapplies its own change once. Changing the timezone runs D8 |
 | M1.16 Deploy: production Access app (self-hosted on the app hostname, not worker-level), Google IdP (or OTP per S1), allowlist policy, admin service-token policy, 730 h app and global session, `preview_urls: false`; install on both phones | M | Runbook in `docs/runbooks/access.md`. **Hostname:** production is https://baby.andamonium.dev, a Custom Domain with workers.dev and preview URLs off (decided 10 Oct 2026). **Access:** Claude created the "Baby tracker" Access app through the API (Google only, 730 h, `SameSite=Lax`), and Andrew created the admin service token. **Prep PR, before any deploy:** `pnpm release` (a clean `main` with green CI, a fresh build whose config passes `release-checks`, a PITR bookmark, then the deploy, logged to `deploys.log`), `pnpm admin pitr:restore`, `caregiver:set-email`, an exact-Origin check on `/api/ws`, and logs that say why a request was refused or failed but never hold a token or an email. Workers Logs keeps those, with per-request records off. **Order:** the first deploy follows that PR, with M1.11's Today and ahead of M1.12 and M1.13. Its phone checks and a first restore drill run on the still-empty household. **Deployed** on 10 Oct 2026 (`740a06f`), with the restore drill and the phone checks on Andrew's iPhone; the M1.16 plan's deploy day record holds the results. Emily's phone checks follow when she installs the app |
 
```

- [ ] **Step 4: Run it to see it pass.** The same command. Expected: PASS, 41 tests. Then `pnpm lint`. It doesn't check Markdown (`oxfmt.config.ts` ignores `**/*.md`), so read the changed lines once in a Markdown preview.
- [ ] **Step 5: Commit.** `git add CLAUDE.md docs scripts/release-checks.ts scripts/release-checks.test.ts`, then `git commit -m "Say that a phone picks up a deploy by itself, in CLAUDE.md, the runbook, pnpm release's report and the plan, and name the spec that deploys by cookie"`.

## Finish

- [ ] One fresh final review of the whole branch on Opus, briefed with the Review Focus and these 3 AM questions:
  - Can the app ever reload while a parent is logging something, or holding an entry that wasn't saved?
  - After a deploy, does each phone end up on the new version without anyone closing the app, online or offline, on iOS's WebKit and in Chrome?
  - Does Settings ever say the wrong thing, "Saved for this version." on an old page, or "A newer version" forever?
  - Can a reload loop, or a failed update, leave a phone without a working offline copy?
  - What does a phone still on the version before #61 do with the first deploy after it?
- [ ] Fix its findings in one wave, ruling on any it marks for Andrew.
- [ ] Merge `main` if it moved, then rerun the gates: `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm bundle:check` and the whole E2E suite.
- [ ] Push, and open the PR against `main`. Its description says `Closes #61`, that merging deploys to production once CI passes (M5.7), and "device checklist after deploy":
  - Open the app online once on each phone (#48's last time), since the version before #61 can't pick up a deploy by itself.
  - On the next deploy after that, leave the app open on each phone: Settings › Offline copy reads "A newer version is saved…" within a minute, and leaving the app and coming back opens it ("Saved for this version."). "Open it now" does the same at once.
- [ ] Comment on #61 at each step: plan approved, built, PR open, approved, merged and live.
- [ ] Iterate on CodeRabbit until it approves. Andrew merges, and the change is live only once the Deploy run succeeds.

## Handoffs (not GH-61 work)

Post each as a comment on its issue once the PR is open.
- **M5.2 (#47, accessibility):** Settings › Offline copy's newer line and **Open it now**. Check with VoiceOver that the line is read before the button, and where focus lands after the reload (the top of Settings). Consider naming the button by what it does if VoiceOver reads it alone ("Open the newer version now").
- **#48 (open the app online once on each phone):** once #61 is live, this is the last time; close it after.
- **#53 (Settings › Offline copy reads "Saved for this version."):** still the check; a phone that hasn't come back since a deploy reads "A newer version is saved…" instead, and Open it now switches it.

## Unresolved questions

None block the build. P1–P10 are the plan's own calls, for veto.
