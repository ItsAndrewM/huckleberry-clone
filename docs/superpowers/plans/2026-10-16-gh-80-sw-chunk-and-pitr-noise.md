# GH-80 and GH-77: sw.js Can't Import a Chunk, and `pnpm test` Prints Clean, Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (native, chosen by Andrew on 16 Oct 2026) to implement this plan task by task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** two gate fixes in one PR.
- **#80:** `pnpm build` fails when `sw.js` imports a chunk, and names the chunk and the modules in it. Today, a module that both page code and `sw.ts` import moves into a shared chunk, and `sw.js` imports it. A phone's service worker then never installs, so there's no offline copy and no #61 update. Only the three E2E specs that allow service workers would notice.
- **#77:** a full `pnpm test` prints no uncaught exception. Today `pitr.test.ts` prints four on every run, so a real one is easy to miss.

**Architecture:**
- **#80:** a pure `workerImportProblem(bundle, root)` in `apps/web/service-worker-build.ts` reads `sw.js`'s `imports` and `dynamicImports`, and returns the build's error, or `undefined`. The plugin's `generateBundle` calls it and stops with `this.error`. Nothing builds differently: every built file stays byte-identical to `main`'s.
- **#77:** every test in `apps/worker/test/pitr.test.ts` calls the household from inside the object with `runInDurableObject`, and handles the outcome outside. workerd prints a rejection that crosses an RPC method call as an uncaught exception, even though the test handles it. Inside the object, neither the refused restore nor the restart's abort prints anything, and the restart is still a real reset.
- **No app code changes.**

**Tech Stack:** Vite 8.3.3 on Rolldown 1.2.13 (`generateBundle`, and `OutputChunk`'s `imports`, `dynamicImports` and `moduleIds`), `@cloudflare/vitest-plugin` 1.3.7 (`runInDurableObject`), Vitest 4.1.11 and Node 24.21.0. No package added.

**Spec:** issues #80 and #77 and their comments: the claim, Andrew's pick, the release, and the grill's decisions and probes.

Andrew decided these on 16 Oct 2026:
- **Execution:** #80 and #77 together, natively.
- **#80:** fail the build, naming the chunk and its modules. He chose that over building `sw.js` on its own.
- **#77:** all five tests call the household from inside the object. He chose that over keeping one restart over RPC.

## Global Constraints

- **Where to work:** the worktree `.claude/worktrees/gh-80-sw-chunk-pitr-noise`, on `chore/the-build-lets-sw-js-import-a-chunk-it-shares-with-the-page-and-the-workers-pitr-tests-print-uncaught-exceptions.GH-80`, cut from `main` at `320c495`. Never the main checkout.
- **Tracking:** plan approval and progress go on #80, and #77's decisions on #77. The PR says `Closes #80` and `Closes #77`.
- **Peers:**
  - 91's M5.2 (#47) changes `apps/web/src/**`, `apps/web/test/**`, `e2e/**`, CLAUDE.md and the plan doc's M5.2 row. It doesn't change `service-worker-build.ts`, its test or `apps/worker`.
  - b5's #100 changes `apps/web/src/sheets/sheets-state.ts`.
  - Whoever merges second rebases. CLAUDE.md and the plan doc can only conflict line by line.
- **Running commands:** Node 24.21.0, through `bash <scratchpad>/pn.sh <command>`, since this worktree session refuses compound commands.
- **Taking each task's files:** each task is a commit on `scratch/gh-80-replay2`, which starts from `320c495`, as this branch does: Task 1 is `e6a7901` and Task 2 is `61c6607`. Take a file with `git show <sha>:<path> > <path>`, and compare with `git diff -- <path>`.
- **E2E:** run `pnpm exec playwright test --config .superpowers/e2e.config.ts …`. That config serves this worktree's build on port 4244, never reuses a server, has no retries, and git ignores it.
- **Lint:** no comments of any kind, and no `Reflect`, runtime `typeof` checks or type assertions (anti-slop). Complexity at most 10.
- **Out of scope:**
  - building `sw.js` on its own
  - failing `pnpm test` on an uncaught exception, which nothing can hook (probe 5)
  - the other tech-debt issues

## Decisions this plan makes (veto in review)

- **P1: The check runs in `generateBundle`,** after the existing "the build has no sw.js or index.html" check and before the shell list. `this.error` fails `pnpm build`, so `pnpm release`, `--gates-local` and E2E's preview build stop too. `pnpm dev` doesn't bundle, so it's unaffected.
- **P2: `import()` counts too.** A service worker can't run it, so a `dynamicImports` entry fails the build as an `imports` entry does.
- **P3: The message** reads `sw.js imports <chunk> (<modules>), which a service worker can't load, so sw.ts needs its own copy of what it shares with the page`.
  - Several chunks are joined with "and", imported ones first, then `import()` ones.
  - Modules are shown relative to `apps/web`.
  - A module that isn't a file, such as Rolldown's runtime (`\0rolldown/runtime.js`), is shown by its id without the NUL. `relative()` would make it a path out of the working directory.
- **P4: `BuiltFiles` is a structural type** that holds only the fields the check reads.
  - The unit test builds a bundle without a type assertion.
  - Typecheck proves that Rolldown's `OutputBundle` fits it, so a Rolldown upgrade that renames a field fails typecheck.
- **P5: The plugin's two new lines have no unit test.** Calling `generateBundle` needs Rolldown's whole plugin context, which a test could only fake with a type assertion. Task 1's build probe proves them, and Finish runs it again.
- **P6: All five PITR tests run inside the object (Andrew's call).** That includes the bookmark test, which never printed, so the file calls the household one way.
- **P7: CLAUDE.md gets one cross-cutting rule,** "Rejections in Worker tests". The plan doc's M1.14 row and §6's DO core row record the two changes.
- **P8: Nothing to deploy.** Every built file is byte-identical to `main`'s, so a release after the merge would ship the same Worker and assets.

## Review Focus

1. **A module shared indirectly:** page code imports a module that imports one `sw.ts` uses, as `build-files.ts` imports `shell-cache.ts`. The check reads the bundle, not the source, so the build still fails. Task 1's probe shares a module directly, so confirm nothing more is needed.
2. **sw.js sharing Rolldown's runtime:** the message shows `rolldown/runtime.js`, not a path out of the working directory. Task 1's "names a module that isn't a file" test pins it.
3. **A Rolldown upgrade that renames `imports`, `dynamicImports` or `moduleIds`:** typecheck fails at the plugin's call, so the check can't pass silently (P4).
4. **A later Worker test that calls a rejecting household method over RPC:** its line comes back, and nothing fails. The CLAUDE.md rule and a clean `pnpm test` are the guard (P7, probe 5).
5. **A restart inside the object that isn't a real reset:** the socket test still expects 1006, then a 401 for the disabled caregiver. Task 2's mutants fail three tests (no abort) and one test (a restore that never asks storage).

## The probes (not committed)

Run on `320c495` in this worktree, 16 Oct 2026:
1. **#80 on `main`:** with `updates.ts` importing `NETWORK_GRACE_MS` from `shell-cache.ts`, `pnpm build` passes. `assets/shell-cache-qMaYirJM.js` appears, and `sw.js` starts with `const SHELL = …`, then `import{…}from"./assets/shell-cache-qMaYirJM.js"`.
2. **#77's lines:** a full `pnpm test` (3,929 tests) printed exactly four, all from `pitr.test.ts`:
   - three of `broken.outputGateBroken; jsg.Error: restarting to apply a point-in-time restore`
   - one `Uncaught (in promise)` of "This Durable Object's storage back-end does not implement point-in-time recovery."

   `api.test.ts` run alone prints none, since its household is a fake.
3. **The restore inside the object:** `runInDurableObject(household, (instance) => instance.pitrScheduleRestore(…))` prints nothing, whether the rejection is handled inside or outside.
4. **A restart inside the object** prints nothing, and it's a real reset:
   - its caller gets exactly `RESTART_REASON`
   - an open socket drops with 1006
   - a caregiver disabled before it gets 401 on reconnecting
   - without the restart, that caregiver's socket stays open

   JS can't catch the abort inside the callback.
5. **No filtering:** the pool's log handler is fixed (`SHARED_MINIFLARE_OPTIONS`), and a project's `miniflare` options reach only its workers. A `process.stderr` wrapper in the worker project's global setup saw no writes at all.

---

### Task 1: The build fails when sw.js imports a chunk (#80)

**Files:**
- Modify: `apps/web/service-worker-build.ts`
- Test: `apps/web/test/service-worker-build.test.ts`
- Modify: `docs/implementation-plan.md` (M1.14's row)

**Interfaces:**
- Produces: `export type BuiltFiles` and `export const workerImportProblem = (bundle: BuiltFiles, root: string): string | undefined`, in `apps/web/service-worker-build.ts`.

- [ ] **Step 1: Write the failing tests.** Take the test file from `e6a7901`:

```diff
diff --git a/apps/web/test/service-worker-build.test.ts b/apps/web/test/service-worker-build.test.ts
index dbda9f9..9259add 100644
--- a/apps/web/test/service-worker-build.test.ts
+++ b/apps/web/test/service-worker-build.test.ts
@@ -1,5 +1,5 @@
 import { describe, expect, it } from "vitest"
-import { markedPage, shellOf } from "../service-worker-build.ts"
+import { type BuiltFiles, markedPage, shellOf, workerImportProblem } from "../service-worker-build.ts"
 
 const BUILD = ["assets/index-CSxg7yjE.js", "sw.js", "assets/index-DDaxv4bF.css", ".assetsignore", "index.html"]
 const HTML = '<script type="module" src="/assets/index-CSxg7yjE.js"></script>'
@@ -32,3 +32,50 @@ describe("markedPage", () => {
     expect(() => markedPage("<p>no head</p>", "1a2b3c")).toThrow("index.html has no </head> to stamp with its build")
   })
 })
+
+describe("workerImportProblem", () => {
+  const ROOT = "/repo/apps/web"
+  const chunk = (moduleIds: string[], imports: string[] = [], dynamicImports: string[] = []): BuiltFiles[string] => ({
+    type: "chunk",
+    imports,
+    dynamicImports,
+    moduleIds,
+  })
+  const SHARED = "assets/shell-cache-qMaYirJM.js"
+
+  it("passes a worker that imports nothing, as every build does today", () => {
+    const bundle: BuiltFiles = { "sw.js": chunk([`${ROOT}/src/service-worker/sw.ts`]), "index.html": { type: "asset" } }
+    expect(workerImportProblem(bundle, ROOT)).toBeUndefined()
+  })
+
+  it("names the chunk sw.js imports and the modules in it, since a service worker can't load one", () => {
+    const bundle: BuiltFiles = {
+      "sw.js": chunk([`${ROOT}/src/service-worker/sw.ts`], [SHARED]),
+      [SHARED]: chunk([`${ROOT}/src/service-worker/shell-cache.ts`, `${ROOT}/src/service-worker/build-files.ts`]),
+    }
+    expect(workerImportProblem(bundle, ROOT)).toBe(
+      "sw.js imports assets/shell-cache-qMaYirJM.js (src/service-worker/shell-cache.ts, src/service-worker/build-files.ts), which a service worker can't load, so sw.ts needs its own copy of what it shares with the page",
+    )
+  })
+
+  it("names a chunk sw.js loads with import() too, after the ones it imports, since a service worker can't run import()", () => {
+    const bundle: BuiltFiles = {
+      "sw.js": chunk([`${ROOT}/src/service-worker/sw.ts`], [SHARED], ["assets/routes-Dq3vLm0x.js"]),
+      [SHARED]: chunk([`${ROOT}/src/service-worker/shell-cache.ts`]),
+      "assets/routes-Dq3vLm0x.js": chunk([`${ROOT}/src/service-worker/routes.ts`]),
+    }
+    expect(workerImportProblem(bundle, ROOT)).toBe(
+      "sw.js imports assets/shell-cache-qMaYirJM.js (src/service-worker/shell-cache.ts) and assets/routes-Dq3vLm0x.js (src/service-worker/routes.ts), which a service worker can't load, so sw.ts needs its own copy of what it shares with the page",
+    )
+  })
+
+  it("names a module that isn't a file, such as Rolldown's runtime, by its id", () => {
+    const bundle: BuiltFiles = {
+      "sw.js": chunk([`${ROOT}/src/service-worker/sw.ts`], ["assets/rolldown-runtime-C4fV2b8s.js"]),
+      "assets/rolldown-runtime-C4fV2b8s.js": chunk(["\0rolldown/runtime.js"]),
+    }
+    expect(workerImportProblem(bundle, ROOT)).toBe(
+      "sw.js imports assets/rolldown-runtime-C4fV2b8s.js (rolldown/runtime.js), which a service worker can't load, so sw.ts needs its own copy of what it shares with the page",
+    )
+  })
+})
```

- [ ] **Step 2: Run them and watch them fail.**
  - Run: `bash <scratchpad>/pn.sh exec vitest run apps/web/test/service-worker-build.test.ts`
  - Expected: `Tests  4 failed | 5 passed (9)`, each with `TypeError: workerImportProblem is not a function`.

- [ ] **Step 3: Implement the check, and call it from `generateBundle`:**

```diff
diff --git a/apps/web/service-worker-build.ts b/apps/web/service-worker-build.ts
index 194992d..96a3222 100644
--- a/apps/web/service-worker-build.ts
+++ b/apps/web/service-worker-build.ts
@@ -1,5 +1,6 @@
 import { Buffer } from "node:buffer"
 import { createHash } from "node:crypto"
+import { isAbsolute, relative } from "node:path"
 import { fileURLToPath } from "node:url"
 import type { Plugin } from "vite"
 import { pageMark, type Shell } from "./src/service-worker/build-files.ts"
@@ -9,6 +10,34 @@ const WORKER_FILE = "sw.js"
 const HTML_FILE = "index.html"
 const HEAD_END = "</head>"
 
+export type BuiltFiles = Readonly<
+  Record<
+    string,
+    | {
+        readonly type: "chunk"
+        readonly imports: readonly string[]
+        readonly dynamicImports: readonly string[]
+        readonly moduleIds: readonly string[]
+      }
+    | { readonly type: "asset" }
+  >
+>
+
+const shownId = (id: string, root: string) => (isAbsolute(id) ? relative(root, id) : id.replace(/^\0/, ""))
+
+const modulesIn = (bundle: BuiltFiles, fileName: string, root: string) => {
+  const file = bundle[fileName]
+  return file?.type === "chunk" ? file.moduleIds.map((id) => shownId(id, root)) : []
+}
+
+export const workerImportProblem = (bundle: BuiltFiles, root: string): string | undefined => {
+  const worker = bundle[WORKER_FILE]
+  const imported = worker?.type === "chunk" ? [...worker.imports, ...worker.dynamicImports] : []
+  if (imported.length === 0) return undefined
+  const named = imported.map((fileName) => `${fileName} (${modulesIn(bundle, fileName, root).join(", ")})`)
+  return `${WORKER_FILE} imports ${named.join(" and ")}, which a service worker can't load, so sw.ts needs its own copy of what it shares with the page`
+}
+
 export const shellOf = (fileNames: readonly string[], html: string | Uint8Array): Shell => {
   const assets = fileNames.filter((name) => name.startsWith("assets/")).map((name) => `/${name}`)
   const urls = ["/", ...assets.toSorted()]
@@ -47,6 +76,8 @@ export const serviceWorker = (): Plugin => ({
       const html = bundle[HTML_FILE]
       if (worker?.type !== "chunk" || html?.type !== "asset")
         this.error(`the build has no ${WORKER_FILE} or ${HTML_FILE}`)
+      const problem = workerImportProblem(bundle, sourcePath("."))
+      if (problem !== undefined) this.error(problem)
       const shell = shellOf(Object.keys(bundle), html.source)
       html.source = markedPage(Buffer.from(html.source).toString("utf8"), shell.version)
       worker.code = `const SHELL = ${JSON.stringify(shell)}\n${worker.code}`
```

- [ ] **Step 4: Run the tests again.** Same command. Expected: `Tests  9 passed (9)`.

- [ ] **Step 5: Prove the plugin's two lines with a real build,** using `bash <scratchpad>/build-probe.sh <worktree>`:
  - With `updates.ts` importing `NETWORK_GRACE_MS` from `./shell-cache.ts`, `pnpm build` exits 1 with `sw.js imports assets/shell-cache-qMaYirJM.js (src/service-worker/shell-cache.ts), which a service worker can't load, so sw.ts needs its own copy of what it shares with the page`.
  - With `updates.ts` restored, the build exits 0, and all 21 built files match `main`'s by sha256.

- [ ] **Step 6: Record it in M1.14's row.** The row ends `… while the old copy is still there |`. After `there`, and before ` |`, insert:

```markdown
. **#80 (16 Oct 2026):** the build fails when `sw.js` imports a chunk, statically or with `import()`, and names the chunk and the modules in it (`workerImportProblem` in `service-worker-build.ts`). A classic service worker can't load one, so it would never install: no offline copy, and no update. A module that the page and `sw.ts` both need gets a copy in each, as `updates.ts`'s `CHECK_LIMIT_MS` and `shell-cache.ts`'s `NETWORK_GRACE_MS` are
```

- [ ] **Step 7: Lint, typecheck and commit.** `pnpm lint` and `pnpm typecheck` exit 0. Commit with `e6a7901`'s message.

### Task 2: The PITR tests call the household from inside the object (#77)

**Files:**
- Modify: `apps/worker/test/pitr.test.ts`
- Modify: `CLAUDE.md` (a cross-cutting rule) and `docs/implementation-plan.md` (§6's DO core row)

**Interfaces:**
- Consumes: `runInDurableObject` from `cloudflare:test`; `HouseholdDO`'s `pitrBookmark`, `pitrScheduleRestore` and `restart`; `RESTART_REASON` from `apps/worker/src/admin.ts`.

- [ ] **Step 1: Watch the current file print.**
  - Run: `bash <scratchpad>/pn.sh exec vitest run --project worker apps/worker/test/pitr.test.ts`
  - Expected: `Tests  5 passed (5)`, with four `uncaught exception` lines: three from restarts and one from the restore.

- [ ] **Step 2: Move every test inside the object:**

```diff
diff --git a/apps/worker/test/pitr.test.ts b/apps/worker/test/pitr.test.ts
index cc95fde..599c938 100644
--- a/apps/worker/test/pitr.test.ts
+++ b/apps/worker/test/pitr.test.ts
@@ -1,6 +1,7 @@
-import { env } from "cloudflare:test"
+import { env, runInDurableObject } from "cloudflare:test"
 import { describe, expect, it, vi } from "vitest"
 import { RESTART_REASON } from "../src/admin.ts"
+import type { HouseholdDO } from "../src/household.ts"
 import { ANDREW, EMILY, SEED } from "./fixtures.ts"
 import { get, type Household, inStorage, ORIGIN } from "./requests.ts"
 
@@ -17,16 +18,23 @@ const connect = async (household: Household, email: string) => {
   return { status: response.status, socket: response.webSocket }
 }
 
+const restarted = (household: Household) =>
+  runInDurableObject(household, (instance: HouseholdDO) => instance.restart()).then(
+    () => "kept running",
+    (error: Error) => error.message,
+  )
+
 describe("the household's point-in-time recovery", () => {
   it("names the current point in its history with a bookmark", async () => {
     const household = await seededAs(crypto.randomUUID())
-    expect(await household.pitrBookmark()).toMatch(BOOKMARK_FORMAT)
+    expect(await runInDurableObject(household, (instance) => instance.pitrBookmark())).toMatch(BOOKMARK_FORMAT)
   })
 
   it("can only schedule a restore on Cloudflare, since the local runtime keeps no history (proven on deploy day)", async () => {
     const household = await seededAs(crypto.randomUUID())
-    const bookmark = await household.pitrBookmark()
-    const outcome = await household.pitrScheduleRestore({ kind: "bookmark", bookmark }).then(
+    const outcome = await runInDurableObject(household, async (instance) =>
+      instance.pitrScheduleRestore({ kind: "bookmark", bookmark: await instance.pitrBookmark() }),
+    ).then(
       () => "scheduled",
       (error: Error) => error.message,
     )
@@ -37,21 +45,12 @@ describe("the household's point-in-time recovery", () => {
 describe("restarting the household", () => {
   it("rejects its caller with the restart's reason, which tells the admin route the restart happened", async () => {
     const household = await seededAs(crypto.randomUUID())
-    const outcome = await household.restart().then(
-      () => "kept running",
-      (error: Error) => error.message,
-    )
-    expect(outcome).toBe(RESTART_REASON)
+    expect(await restarted(household)).toBe(RESTART_REASON)
   })
 
   it("comes back on the next request with its records", async () => {
     const name = crypto.randomUUID()
-    const household = await seededAs(name)
-    const outcome = await household.restart().then(
-      () => "kept running",
-      (error: Error) => error.message,
-    )
-    expect(outcome).toBe(RESTART_REASON)
+    expect(await restarted(await seededAs(name))).toBe(RESTART_REASON)
     const response = await get(env.HOUSEHOLD.getByName(name), "/api/me", ANDREW.email)
     expect(response.status).toBe(200)
   })
@@ -67,7 +66,7 @@ describe("restarting the household", () => {
       socket.addEventListener("close", ({ code }) => resolve(code), { once: true })
     })
     await inStorage(household, (sql) => sql.exec("UPDATE caregivers SET active = 0 WHERE email = ?", EMILY.email))
-    await household.restart().catch(() => undefined)
+    await restarted(household)
     expect(await dropped).toBe(1006)
     expect((await connect(env.HOUSEHOLD.getByName(name), EMILY.email)).status).toBe(401)
     vi.restoreAllMocks()
```

- [ ] **Step 3: Run it again.** Same command. Expected: `Tests  5 passed (5)`, and no `uncaught exception` line.

- [ ] **Step 4: Run two mutants of `apps/worker/src/household.ts`, then restore it:**
  - `restart()` doesn't abort (`this.ctx.abort(RESTART_REASON)` becomes `void RESTART_REASON`): the three restart tests fail.
  - The restore never asks storage (`undo: bookmark`): the restore test fails.

- [ ] **Step 5: Record the rule:**

```diff
diff --git a/CLAUDE.md b/CLAUDE.md
index 94a0820..764af59 100644
--- a/CLAUDE.md
+++ b/CLAUDE.md
@@ -22,6 +22,7 @@ Work is tracked in GitHub issues. The Baby Tracker Roadmap artifact was frozen o
 - **Receipts after a deploy:** every endpoint built on `mutations` (`apps/worker/src/mutations.ts`) stores its response as a receipt, which a retry within a day replays: today `Diaper`, `Feed`, `Measurement`, `Sleep`, `Supplement`, `Dose`, `Household` and `Child`. A field that's added, removed or renamed, or a tightened check, must stay decodable for 24 hours, or that retry answers 500. Only `Feed` has a test for it: `apps/worker/test/feeds.test.ts`'s "decode the response and changed keys stored before a deploy…".
 - **Installed apps after a deploy:** an app older than the Worker reads `ChangedMessage`, so add fields to it, but never rename or remove one.
 - **25-hour days in tests:** tzdata 2026c keeps America/Vancouver on UTC−7 after 1 Nov 2026, so it has no 25-hour day that year; use America/Los_Angeles.
+- **Rejections in Worker tests:** call a household method that rejects, or that restarts the object, from inside it with `runInDurableObject`, and handle the outcome outside. Over RPC (`stub.restart()`), workerd prints the rejection as an uncaught exception, even though the test handles it. A full `pnpm test` prints none, so a new one is a real error (#77).
 - **Service workers in E2E:** `playwright.config.ts` blocks them, so `page.route` sees every request; only `offline.spec.ts`, `sheets-offline.spec.ts` and `new-version.spec.ts` allow them. `new-version.spec.ts` deploys by cookie: with `bt-preview-next-build=1`, the preview serves the same build stamped `<version>-next` (`apps/web/preview-next-build.ts`). Playwright's block resolves `register` rather than refusing it, so no E2E test sees a refused registration.
 - **The live socket in E2E:** specs take `test` from `e2e/test.ts`, as lint enforces, so every page hears a played socket rather than the local household that every spec writes to (#72).
   - It answers the heartbeat, and `socket.changed(…)` sends it the household's `changed` message.
```

  §6's DO core row ends `… timezone change (D8) |`. After `(D8)`, and before ` |`, insert:

```markdown
. A test calls a household method that rejects, or that restarts the object, from inside it with `runInDurableObject`. Over RPC, workerd prints the rejection as an uncaught exception, even though the test handles it, so `pnpm test` printed four such lines on every run until #77
```

- [ ] **Step 6: Run the whole suite.** Run `pnpm test`. Expected: `Test Files  234 passed (234)` and `Tests  3932 passed (3932)`. The output holds only Vitest's header and summary, with no `uncaught exception`.

- [ ] **Step 7: Lint, typecheck and commit.** Commit with `61c6607`'s message.

### Finish

- [ ] Merge `origin/main` if it moved, and rerun whatever its changes touch.
- [ ] Run ci.yml's commands on this checkout: `pins:check`, `lint`, `typecheck`, `test`, `coverage`, `build`, `bundle:check`, and `e2e` in both engines from `.superpowers/e2e.config.ts`. Run Task 1's build probe again.
- [ ] Get one fresh final review on the most capable model, of the whole branch against #80, #77 and this plan, briefed with the Review Focus. Fix any finding in this PR that leaves #80's broken worker possible or `pnpm test` unclean.
- [ ] Push, and open the PR. It says:
  - `Closes #80` and `Closes #77`
  - the gates table
  - merging deploys nothing new, since the build is byte-identical
  - while Actions is out, a merge deploys only by `pnpm release --gates-local`, on Andrew's word
- [ ] Iterate on CodeRabbit until it approves the head. Don't merge.

## Unresolved questions

None.
