# GH-60 WebKit E2E Flakes Under Load Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (native, chosen by Andrew on 15 Oct 2026) to implement this plan task by task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** the known WebKit E2E flakes stop (issue #60), so the local gates pass on this Mac while GitHub Actions is out of minutes. Each has a cause shown by a probe:
- **live.spec's reconnect tests** (76, 108, 151):
  - Inside a timer set with a fractional delay, Playwright's fake `Date.now()` returns a fraction. The app's jittered reconnect delay is such a timer.
  - Effect's tracer starts each request's span with `BigInt(Date.now())`. If the reconnected socket opens inside that window, every refetch throws "RangeError: Not an integer" before `fetch`.
- **deleted.spec:388:** an answer the test plays can land after `setOffline(true)`. The app counts any answer as the household being reachable, so No connection and the reason go away for good.
- **live.spec's heartbeat test** (33): each poll runs the clock 30 s. If the household is slow, the second beat drops the socket before its pong arrives.

**Architecture:**
- **`e2e/test.ts`:**
  - **The clock:** after a spec's first call on the clock (any of its seven methods), a context init script floors `Date.now()` to a whole millisecond, as a phone's always is. An evaluate does the same in pages already open.
  - **Offline:** the context fixture follows `setOffline` for every test, the real household's too. Going offline marks the context, closes the played sockets and refuses new ones. Coming back online clears the mark.
  - **Played answers:** every `page.route` handler gets a route whose `fulfill` and `continue` abort with "internetdisconnected" while the context is offline, so the page sees a dropped request. `abort`, `fallback`, `fetch` and `request` pass through. Pages are covered through the `page` fixture and `context.on("page")`.
- **`e2e/deleted.spec.ts`:** the offline test waits for Restore to be enabled before going offline.
- **`e2e/live.spec.ts`:** the heartbeat test runs the clock only until the ping has gone out, then waits up to 10 s for the pong.
- **No app code changes.** The reconnect delay stays jittered and fractional, and on a phone `Date.now()` is always whole.

**Tech Stack:** Playwright 1.64.0 (`Clock`, `page.route`, `Route`, `addInitScript`, `routeWebSocket`), oxlint 1.87.0, oxfmt 0.72.0, TypeScript 5.9.3 and Node 24.21.0. Effect 4.0.1 is only read: `wallTimeNanos` and `HttpClient.make`'s `useSpan`. No package added.

**Spec:** issue #60: its body, and the comments on the release's flakes, the measurements, the traces, the cause and the proof. Also CLAUDE.md's E2E rules and the E2E row of the plan's §6.

Andrew decided these on 15–16 Oct 2026, in the grill before this plan:
- **Execution:** native.
- **Scope:** the known flakes.
  - A WebKit stall before a test starts is the machine under load: the one retry absorbs it, and each one gets noted on #60.
  - A new flake seen in the proof runs gets noted on #60, not chased.
- **deleted.spec:** fix the spec and the fixture: played answers are refused while offline.
- **The reconnect flakes:**
  - First an app connect limit, chosen on an overstated premise. It was corrected and asked again.
  - Then probe first. The probe found the clock.
  - The fix lives in the fixture, over rounding the app's reconnect delay and over doing both.
- **Proof:**
  - Each fix gets a test that forces its race and fails on `main` first.
  - Every changed spec passes 50 repeats in WebKit under parallel load.
  - The whole suite passes twice in both engines with no flake, as the PR's local gates.

## Global Constraints

- **Where to work:** the worktree `.claude/worktrees/gh-72-e2e-socket`, on `fix/webkit-e2e-flakes-under-the-full-parallel-run-live-spec-tss-heartbeat-and-connectivity-spec-tss-offline-banner.GH-60`, cut from `main` at `5926ce3` (#98). Never the main checkout.
- **Tracking:**
  - Post plan approval and progress on #60.
  - The PR's description says `Closes #60`.
  - It also says it changes no app code, and that while Actions is out a merge deploys only by `pnpm release --gates-local` on Andrew's word.
- **Peers:**
  - d5's M5.2 (#47) changes CLAUDE.md, the plan doc and many specs, but not `e2e/test.ts`.
  - b5's #99 (#92, #91) adds held-failures.spec and changes first-tap, failed-control, discard-entry, edit-diaper and nursing. It also leaves `e2e/test.ts` alone. b5 checked its specs against the offline rule: none lets a played answer land while offline.
  - Whoever merges second rebases. Tell both peers the rule when the PR opens.
- **Running commands:** Node 24.21.0. Spell PATH out (`env PATH=/Users/andamonium/.nvm/versions/node/v24.21.0/bin:… pnpm …`), since this worktree session refuses compound shell commands that name git.
- **Taking each task's files:** each task is a commit on `scratch/gh-60-replay`, which starts from `5926ce3` as this branch does. Take its files with `git show <sha>:<path> > <path>`, since auto mode refuses `git checkout <sha> -- <path>`, and compare with `git diff -- <path>`.
- **E2E:** run `pnpm exec playwright test --config .superpowers/e2e.config.ts …`. That config serves this worktree's build on port 4226, never reuses a server, has no retries, and git ignores it.
- **Gates:** CI can't run, so the PR carries a table of ci.yml's steps run on this checkout: `pins:check`, `lint`, `typecheck`, `test`, `coverage`, `build`, `bundle:check` and `e2e` in both engines.
- **Lint:** no comments of any kind, and no `Reflect`, runtime `typeof` checks or type assertions (anti-slop). Complexity at most 10.
- **Out of scope:**
  - app changes
  - WebKit page-setup stalls under load
  - first-tap.spec's Growth case (see P6)
  - reports to Playwright and Effect (see Unresolved questions)

## Decisions this plan makes (veto in review)

- **P1: The floor applies to `Date.now()` only.**
  - `new Date()` already stores whole milliseconds.
  - `performance.now()` is fractional on a phone too, and Effect rounds it (`monotonicNowNanos`).
  - It is installed after the first call on the clock, because Playwright replaces `Date` in that call and the init scripts run in the order they were added.
- **P2: Played answers are refused at `fulfill` and `continue`.** A handler that answers after the test went offline gets an abort. One the browser received before going offline, which the app handles just after, can't be refused, which is why P4 exists. `context.route` isn't wrapped, because no spec uses it.
- **P3: The offline handling covers the real household too.** Played HTTP answers aren't tied to the socket, so the context fixture marks offline for every test and closes played sockets only when it plays them.
- **P4: deleted.spec waits for Restore to be enabled before going offline.** That proves its own answers landed. The fixture covers a later handler; the wait covers an answer the app handles late. CLAUDE.md says every spec that goes offline should wait the same way.
- **P5: The heartbeat test stops running the clock once the ping is out**, and waits up to 10 s for the pong. It still uses the real household.
- **P6: first-tap.spec's Growth case is left alone.**
  - It already waits for No connection after going offline.
  - The fixture refuses any played send after that.
  - It passed both whole-suite runs.
  - #99 is editing that spec.
- **P7: The app is unchanged.** Andrew chose the fixture over rounding the reconnect delay.

## The probes (Finish's proofs; not committed)

- **The reconnect probe:**
  - `.superpowers/probes/reconnect.spec.ts` copies live.spec's three reconnect tests. An init script wraps the page's `WebSocket` and `fetch` and logs `wsN created / open / close` and `fetchN /path / status`. A failure prints the log.
  - `probe-fixed.sh <batches>` runs it in WebKit in batches of 300 (`--repeat-each=100 --workers=10`), counting failures and logs in which `ws2 open` has no `fetch4` after it.
- **The slow household:** `.superpowers/probes/slow-household.spec.ts` pauses this worktree's preview server for 2 s just before the ping, so the real household answers late. It runs serially on one worker:

```ts
import { execSync } from "node:child_process"
import type { Page } from "@playwright/test"
import { expect, test } from "../../e2e/test.ts"

const HEARTBEAT_MS = 30_000
const HOUSEHOLD_SLOW_FOR_MS = 2000

const serverPids = () =>
  execSync("lsof -nP -iTCP:4226 -sTCP:LISTEN -t").toString().trim().split("\n").map(Number)

const slowTheHouseholdFor = (ms: number) => {
  const pids = serverPids()
  for (const pid of pids) process.kill(pid, "SIGSTOP")
  setTimeout(() => {
    for (const pid of pids) process.kill(pid, "SIGCONT")
  }, ms)
}

const openWatchingFrames = async (page: Page) => {
  await page.clock.install()
  const opened = page.waitForEvent("websocket", (socket) => new URL(socket.url()).pathname === "/api/ws")
  await page.goto("/")
  const socket = await opened
  const frames: string[] = []
  socket.on("framesent", ({ payload }) => frames.push(`sent ${String(payload)}`))
  socket.on("framereceived", ({ payload }) => frames.push(`received ${String(payload)}`))
  await expect(page.getByText("Loading…")).toBeHidden()
  await page.waitForTimeout(500)
  return frames
}

test.describe.configure({ mode: "serial" })

test.describe("with the household's real socket, the household paused for 2 s before the ping", () => {
  test.use({ household: "real" })

  test("main's version: runs the clock a beat on every poll", async ({ page }) => {
    const frames = await openWatchingFrames(page)
    slowTheHouseholdFor(HOUSEHOLD_SLOW_FOR_MS)
    await expect
      .poll(async () => {
        await page.clock.runFor(HEARTBEAT_MS)
        return frames
      })
      .toEqual(expect.arrayContaining(["sent ping", "received pong"]))
  })

  test("the fix: runs the clock only until the ping is sent", async ({ page }) => {
    const frames = await openWatchingFrames(page)
    slowTheHouseholdFor(HOUSEHOLD_SLOW_FOR_MS)
    await expect
      .poll(
        async () => {
          if (!frames.includes("sent ping")) await page.clock.runFor(HEARTBEAT_MS)
          return frames
        },
        { timeout: 10_000 },
      )
      .toEqual(expect.arrayContaining(["sent ping", "received pong"]))
  })
})
```

## Figures so far (re-measure in Finish)

On `main` at `5926ce3`:
- **The 15 Oct gates:**
  - b5's gates run used its private config, with no retry. live.spec:108 and :151 each failed once, at load 10–20.
  - The release's E2E gate had `CI` set, so one retry. deleted.spec:388 and nursing.spec:248 each failed once and passed on retry. nursing.spec's failure was a page-setup stall.
- **Not reproduced on demand:** live.spec 15 times over in WebKit (180 runs, load up to 42), the whole suite once in WebKit (405 passed) and twice in both engines (812 passed each time).
- **The reconnect probe:**
  - 13 failures in about 2,280 runs, all with 108's shape. Every logged one was "RangeError: Not an integer" from each refetch.
  - At 10 workers it failed about 1 run in 120.
  - With a real `setImmediate` in the page it still failed 4 of 300. That rules out Effect's dispatch through the fake `setTimeout`.
- **A fractional `Date.now()`:**
  - Inside a 736.8 ms timer under `page.clock.install()`, `Date.now()` read `…823.8`, and `BigInt` threw in both engines.
  - Outside such a timer, none of 240,000 samples was fractional.
- **deleted.spec:** in a WebKit probe, No connection went 8 ms after a held `/api/deleted` answer was released after `setOffline(true)`.
- **The heartbeat:** with the household paused for 2 s, the heartbeat test failed 4 of 4.

On the prototype (`baf8566`, the same tree as the replay's last commit):
- **The forced tests:** fake-clock.spec passes 4 of 4 and played-socket.spec's new test 2 of 2. Each failed on its task's parent.
- **The reconnect probe:** 1,500 of 1,500 passed, at load 6–172.
- **The heartbeat:** with the household paused for 2 s, the heartbeat test passed 6 of 6.
- **50 repeats** of the four changed specs in WebKit on 8 workers, at load 127–146:
  - 1,397 of 1,400 passed.
  - The 3 failures were WebKit stalls before a test started, two while setting up the page or the context, one whose `context` fixture never got its context.
- **The whole suite twice** in both engines: 818 passed and 2 skipped each time, in 3.1 and 3.3 min.

---

### Task 1: The fake clock's `Date.now()` stays a whole millisecond

Replay commit `9efb8e4`. Files: `e2e/fake-clock.spec.ts` (new) and `e2e/test.ts`.

- [ ] **Step 1: the test.** `git show 9efb8e4:e2e/fake-clock.spec.ts > e2e/fake-clock.spec.ts`

```ts
import { expect, test } from "./test.ts"

const NOW_INSIDE_A_FRACTIONAL_TIMER = "new Promise((resolve) => setTimeout(() => resolve(Date.now()), 736.8))"

test("keeps Date.now() a whole millisecond under the fake clock, as a phone's always is, inside a timer set with a fractional delay", async ({
  page,
}) => {
  await page.clock.install()
  await page.goto("/")
  const seen = page.evaluate<number>(NOW_INSIDE_A_FRACTIONAL_TIMER)
  await page.clock.runFor(1000)
  expect(Number.isInteger(await seen)).toBe(true)
})

test("keeps Date.now() a whole millisecond when the fake clock is installed after the page has loaded", async ({
  page,
}) => {
  await page.goto("/")
  await page.clock.install()
  const seen = page.evaluate<number>(NOW_INSIDE_A_FRACTIONAL_TIMER)
  await page.clock.runFor(1000)
  expect(Number.isInteger(await seen)).toBe(true)
})
```

- [ ] **Step 2: watch it fail.** `pnpm exec playwright test --config .superpowers/e2e.config.ts fake-clock.spec.ts`. Expected: 4 failed, each "Expected: true, Received: false", because `Date.now()` read inside the 736.8 ms timer is a fraction.
- [ ] **Step 3: the fixture.** `git show 9efb8e4:e2e/test.ts > e2e/test.ts`

```diff
diff --git a/e2e/test.ts b/e2e/test.ts
index c506f3c..372380c 100644
--- a/e2e/test.ts
+++ b/e2e/test.ts
@@ -36,6 +36,37 @@ const playTheHousehold = async (context: BrowserContext) => {
   }
 }
 
+const keepDateNowWhole = () => {
+  const now = Date.now
+  if (Object.hasOwn(now, "whole")) return
+  Date.now = Object.assign(() => Math.floor(now()), { whole: true })
+}
+
+const keepTheFakeClockWhole = (context: BrowserContext) => {
+  let kept: Promise<void> | undefined
+  const keep = () => {
+    kept ??= context
+      .addInitScript(keepDateNowWhole)
+      .then(() => Promise.all(context.pages().map((page) => page.evaluate(keepDateNowWhole))))
+      .then(() => undefined)
+    return kept
+  }
+  const thenKeep =
+    <Args extends ReadonlyArray<unknown>>(call: (...args: Args) => Promise<void>) =>
+    async (...args: Args) => {
+      await call(...args)
+      await keep()
+    }
+  const { clock } = context
+  clock.install = thenKeep(clock.install.bind(clock))
+  clock.fastForward = thenKeep(clock.fastForward.bind(clock))
+  clock.pauseAt = thenKeep(clock.pauseAt.bind(clock))
+  clock.resume = thenKeep(clock.resume.bind(clock))
+  clock.runFor = thenKeep(clock.runFor.bind(clock))
+  clock.setFixedTime = thenKeep(clock.setFixedTime.bind(clock))
+  clock.setSystemTime = thenKeep(clock.setSystemTime.bind(clock))
+}
+
 const sendChanged = async (context: BrowserContext, keys: ReadonlyArray<QueryKey>) => {
   const open = openSocketsOf.get(context)
   if (open === undefined)
@@ -49,6 +80,7 @@ export const test = base.extend<{ household: Household; socket: PlayedSocket }>(
   household: ["played", { option: true }],
   context: async ({ context, household }, use) => {
     if (household === "played") await playTheHousehold(context)
+    keepTheFakeClockWhole(context)
     await use(context)
   },
   socket: async ({ context }, use) => {
```

- [ ] **Step 4: watch it pass.** The same command: 4 passed.
- [ ] **Step 5: lint and typecheck,** then commit: "The fixture floors the fake clock's Date.now() to a whole millisecond, as a phone's always is, so Effect's tracer can't throw RangeError at a request's start inside a timer set with a fractional delay, which is what failed live.spec's reconnect tests".

### Task 2: Going offline refuses the answers a test plays

Replay commit `f285076`. Files: `e2e/played-socket.spec.ts` and `e2e/test.ts`.

- [ ] **Step 1: the test.** `git show f285076:e2e/played-socket.spec.ts > e2e/played-socket.spec.ts`

```diff
diff --git a/e2e/played-socket.spec.ts b/e2e/played-socket.spec.ts
index 4c69ce2..fb5c9d1 100644
--- a/e2e/played-socket.spec.ts
+++ b/e2e/played-socket.spec.ts
@@ -31,6 +31,10 @@ const keepAnOpenSocket = `new Promise((resolve) => {
   socket.onopen = () => resolve()
 })`
 
+const PLAYED = "/api/played-answer"
+
+const howARequestEnds = `fetch("${PLAYED}").then(() => "answered", () => "refused")`
+
 test("answers the household's heartbeat on a page's played socket", async ({ page }) => {
   await page.goto("/")
   expect(await page.evaluate<string>(answerToPing)).toBe("pong")
@@ -48,3 +52,27 @@ test("closes a page's played socket as the test goes offline, and refuses anothe
   await context.setOffline(false)
   expect(await page.evaluate<string>(howANewSocketEnds)).toBe("opened")
 })
+
+test("refuses an answer the test plays once it has gone offline, as a phone's network would, and answers again once it's back", async ({
+  page,
+  context,
+}) => {
+  let release = () => {}
+  const held = new Promise<void>((resolve) => {
+    release = resolve
+  })
+  let asked = 0
+  await page.route(`**${PLAYED}`, async (route) => {
+    asked += 1
+    if (asked === 1) await held
+    await route.fulfill({ json: {} })
+  })
+  await page.goto("/")
+  const first = page.evaluate<string>(howARequestEnds)
+  await expect.poll(() => asked).toBe(1)
+  await context.setOffline(true)
+  release()
+  expect(await first).toBe("refused")
+  await context.setOffline(false)
+  expect(await page.evaluate<string>(howARequestEnds)).toBe("answered")
+})
```

- [ ] **Step 2: watch it fail.** `pnpm exec playwright test --config .superpowers/e2e.config.ts played-socket.spec.ts`. Expected: 2 failed, both 'Expected: "refused", Received: "answered"'. The other 4 pass.
- [ ] **Step 3: the fixture.** `git show f285076:e2e/test.ts > e2e/test.ts`

```diff
diff --git a/e2e/test.ts b/e2e/test.ts
index 372380c..4d74f16 100644
--- a/e2e/test.ts
+++ b/e2e/test.ts
@@ -1,9 +1,10 @@
-import { type BrowserContext, test as base, expect, type WebSocketRoute } from "@playwright/test"
+import { type BrowserContext, test as base, expect, type Page, type Route, type WebSocketRoute } from "@playwright/test"
 
 export { expect }
 
 type Household = "played" | "real"
 type QueryKey = ReadonlyArray<string | number>
+type RouteArguments = Parameters<Page["route"]>
 
 export interface PlayedSocket {
   readonly changed: (...keys: ReadonlyArray<QueryKey>) => Promise<void>
@@ -12,6 +13,8 @@ export interface PlayedSocket {
 const HOUSEHOLD_SOCKET = /\/api\/ws$/u
 const OFFLINE = { code: 1011, reason: "offline" }
 const openSocketsOf = new WeakMap<BrowserContext, Set<WebSocketRoute>>()
+const offline = new WeakSet<BrowserContext>()
+const answeringOnlyOnline = new WeakSet<Page>()
 
 const answerTheHeartbeat = (socket: WebSocketRoute) =>
   socket.onMessage((message) => {
@@ -20,18 +23,46 @@ const answerTheHeartbeat = (socket: WebSocketRoute) =>
 
 const playTheHousehold = async (context: BrowserContext) => {
   const open = new Set<WebSocketRoute>()
-  let offline = false
   openSocketsOf.set(context, open)
   await context.routeWebSocket(HOUSEHOLD_SOCKET, async (socket) => {
-    if (offline) return socket.close(OFFLINE)
+    if (offline.has(context)) return socket.close(OFFLINE)
     open.add(socket)
     answerTheHeartbeat(socket)
     socket.onClose(() => open.delete(socket))
   })
+  return open
+}
+
+const refusedWhileOffline = (played: Route, context: BrowserContext): Route => {
+  const refuse = () => played.abort("internetdisconnected")
+  return {
+    abort: (errorCode) => played.abort(errorCode),
+    continue: (options) => (offline.has(context) ? refuse() : played.continue(options)),
+    fallback: (options) => played.fallback(options),
+    fetch: (options) => played.fetch(options),
+    fulfill: (options) => (offline.has(context) ? refuse() : played.fulfill(options)),
+    request: () => played.request(),
+  }
+}
+
+const answerOnlyOnline = (page: Page, context: BrowserContext) => {
+  if (answeringOnlyOnline.has(page)) return
+  answeringOnlyOnline.add(page)
+  const route = page.route.bind(page)
+  page.route = (url: RouteArguments[0], handler: RouteArguments[1], options?: RouteArguments[2]) =>
+    route(url, (played, request) => handler(refusedWhileOffline(played, context), request), options)
+}
+
+const followOffline = (context: BrowserContext, open: ReadonlySet<WebSocketRoute>) => {
+  context.on("page", (page) => answerOnlyOnline(page, context))
   const setOffline = context.setOffline.bind(context)
   context.setOffline = async (goingOffline) => {
-    offline = goingOffline
-    if (goingOffline) await Promise.all([...open].map((socket) => socket.close(OFFLINE)))
+    if (goingOffline) {
+      offline.add(context)
+      await Promise.all([...open].map((socket) => socket.close(OFFLINE)))
+    } else {
+      offline.delete(context)
+    }
     await setOffline(goingOffline)
   }
 }
@@ -79,10 +110,14 @@ const sendChanged = async (context: BrowserContext, keys: ReadonlyArray<QueryKey
 export const test = base.extend<{ household: Household; socket: PlayedSocket }>({
   household: ["played", { option: true }],
   context: async ({ context, household }, use) => {
-    if (household === "played") await playTheHousehold(context)
+    followOffline(context, household === "played" ? await playTheHousehold(context) : new Set())
     keepTheFakeClockWhole(context)
     await use(context)
   },
+  page: async ({ page, context }, use) => {
+    answerOnlyOnline(page, context)
+    await use(page)
+  },
   socket: async ({ context }, use) => {
     await use({ changed: (...keys) => sendChanged(context, keys) })
   },
```

- [ ] **Step 4: watch it pass.** The same command: 6 passed.
- [ ] **Step 5: lint and typecheck,** then commit: "Going offline refuses every answer a test plays until it's back online, as a phone's network would, so a played answer can't land after setOffline and put the app back online".

### Task 3: deleted.spec waits for its list before going offline

Replay commit `bfe1173`.

```diff
diff --git a/e2e/deleted.spec.ts b/e2e/deleted.spec.ts
index 6fb874f..9790d83 100644
--- a/e2e/deleted.spec.ts
+++ b/e2e/deleted.spec.ts
@@ -388,6 +388,7 @@ for (const { written, name, given } of LONGEST) {
 test("waits with a reason while there's no connection", async ({ page, context }) => {
   await playDeleted(page, (andrew) => ({ ...NOTHING, diapers: [diaper(deletedBy(andrew, NOW - 5 * MINUTE))] }))
   await openDeleted(page)
+  await expect(page.getByRole("button", { name: /^Restore Diaper/u })).toBeEnabled()
   await context.setOffline(true)
   await expect(page.getByText("Restoring needs a connection.")).toBeVisible()
   await expect(page.getByRole("button", { name: /^Restore Diaper/u })).toBeDisabled()
```

- [ ] **Step 1:** `git show bfe1173:e2e/deleted.spec.ts > e2e/deleted.spec.ts`
- [ ] **Step 2:** `pnpm exec playwright test --config .superpowers/e2e.config.ts deleted.spec.ts`: all pass.
- [ ] **Step 3:** commit: "deleted.spec's offline test waits for Restore to be enabled before going offline, so none of its own answers is still on the way".

### Task 4: The heartbeat test stops running the clock once the ping is out

Replay commit `2400664`.

```diff
diff --git a/e2e/live.spec.ts b/e2e/live.spec.ts
index 1dee754..7448ff6 100644
--- a/e2e/live.spec.ts
+++ b/e2e/live.spec.ts
@@ -41,10 +41,13 @@ test.describe("with the household's real socket", () => {
     socket.on("framesent", ({ payload }) => frames.push(`sent ${String(payload)}`))
     socket.on("framereceived", ({ payload }) => frames.push(`received ${String(payload)}`))
     await expect
-      .poll(async () => {
-        await page.clock.runFor(HEARTBEAT_MS)
-        return frames
-      })
+      .poll(
+        async () => {
+          if (!frames.includes("sent ping")) await page.clock.runFor(HEARTBEAT_MS)
+          return frames
+        },
+        { timeout: 10_000 },
+      )
       .toEqual(expect.arrayContaining(["sent ping", "received pong"]))
   })
 })
```

- [ ] **Step 1:** `git show 2400664:e2e/live.spec.ts > e2e/live.spec.ts`
- [ ] **Step 2:** `pnpm exec playwright test --config .superpowers/e2e.config.ts live.spec.ts`: all pass. The race is forced in Finish by the slow-household probe: `main`'s version fails, this one passes.
- [ ] **Step 3:** commit: "live.spec's heartbeat test runs the clock only until the ping is out, then waits for the pong, so a slow household's pong can't come after a second beat dropped the socket".

### Task 5: Docs

Replay commit `aa80a61`: CLAUDE.md's E2E rules and the plan's §6 E2E row.

```diff
diff --git a/CLAUDE.md b/CLAUDE.md
index 35af355..6482d18 100644
--- a/CLAUDE.md
+++ b/CLAUDE.md
@@ -28,4 +28,6 @@ Work is tracked in GitHub issues. The Baby Tracker Roadmap artifact was frozen o
   - `context.setOffline(true)` closes it and refuses new ones until the test is back online. Neither engine's own `setOffline` reaches a played socket, and WebKit's still lets a real one reconnect, which the app reads as online.
   - A spec's own `page.routeWebSocket` takes that page's socket instead, as live.spec's and new-version.spec's do. `socket.changed` and `setOffline`'s closing then leave that socket to the spec.
   - A test that needs the real household's socket says `test.use({ household: "real" })`. A context from `browser.newContext()` hears the real one too.
+- **Going offline in E2E:** `context.setOffline(true)` also refuses every answer a test plays (`route.fulfill` or `route.continue`) until it's back online, so the page sees a dropped request, as a phone would (#60). A spec that goes offline first waits for what its page loads, since an answer that lands just before the offline event can still put the app back online.
+- **Playwright's clock in E2E:** once a spec calls `page.clock`, `e2e/test.ts` floors its `Date.now()` to a whole millisecond, as a phone's always is. Inside a timer set with a fractional delay, such as the reconnect's jitter, Playwright's `Date.now()` returns a fraction, and Effect's tracer throws "RangeError: Not an integer" at every request's start (#60).
 - **Local E2E state:** settings changes made in `pnpm dev` land in `apps/web/.wrangler/state`, which `pnpm e2e` shares, so a renamed child or changed units fails specs such as `shell.spec.ts`'s `/api/me` check. Delete that folder to start over; CI always starts empty.
```

```diff
diff --git a/docs/implementation-plan.md b/docs/implementation-plan.md
index 309d0a0..49dfd54 100644
--- a/docs/implementation-plan.md
+++ b/docs/implementation-plan.md
@@ -254,7 +254,7 @@ Two simultaneous switches: the DO runs them one after the other. The second carr
 | DO core | `@cloudflare/vitest-plugin` with a real DO SQLite and a pinned clock | Invariants, 409s, idempotency (AC 14) including a retry after commit but before broadcast that rebroadcasts the stored keys, and a same-`actionId` retry with edited values that returns `ACTION_REPLAY_MISMATCH`, concurrency by running requests in parallel against one stub (AC 13), soft delete and restore (AC 19), clock-skew tolerance (AC 21), timezone change (D8) |
 | Worker | Same pool | 401 without identity, header stripping, unknown email gets no data, disabled caregiver blocked and socket closed (AC 1, 10) |
 | Bench, by hand | `pnpm bench`: the same pool under its own config (`apps/worker/vitest.bench.config.ts`), never in CI | How long each read and a feed write take over two years of heavy logging (M5.5). Run it when a period read or a migration changes |
-| E2E | Playwright, iPhone viewport, WebKit + Chromium, `vite preview` with `access.dev` | Tap budgets (AC 2), two contexts for live updates (AC 6, 16), offline and auth-expiry flows using `context.setOffline` (which closes and refuses `e2e/test.ts`'s played socket, since no engine's own `setOffline` reaches a played socket and WebKit's still lets a real one reconnect, and with service workers blocked except in `offline.spec.ts` and `sheets-offline.spec.ts`; M1.14, M1.12, #72) and a `vite preview` middleware that, while a test cookie is set, answers `/api/*` with a 302 to a foreign origin as Access does for an expired session (AC 10, 11; M1.10, since WebKit can't fulfil a redirect through `page.route`). The auth-expiry case (M1.12) saves an entry after the session expired, follows Sign in → `/api/login` → back to the same route, and checks that the draft is restored and saved exactly once with the same `actionId`. A second case checks that a draft older than 12 h asks for confirmation instead of auto-saving, timer lifecycle (AC 20) using page reload and clock control. Every spec starts on a phone that has dismissed M5.1's install card, so none depends on how an engine reports an iPhone's signals (Playwright's WebKit on a Mac has `navigator.standalone` but no touch points; Chromium has touch points but no flag); `install.spec.ts` clears that and stubs both (M5.1). Trends' specs run the phone in America/Vancouver (`test.use({ timezoneId })`): CI runs in UTC, where reading the wrong zone can't fail, and under Playwright's clock date-fns on a `TZDate` reads the page's zone, which only shows outside UTC (M3.10). Every spec takes `test` from `e2e/test.ts`, as lint enforces. Its pages hear a played household socket, so another spec's write to the one local household can't make a page reload its played answers mid-test. A test that needs the real socket opts in with `test.use({ household: "real" })` (#72) |
+| E2E | Playwright, iPhone viewport, WebKit + Chromium, `vite preview` with `access.dev` | Tap budgets (AC 2), two contexts for live updates (AC 6, 16), offline and auth-expiry flows using `context.setOffline` (which closes and refuses `e2e/test.ts`'s played socket, since no engine's own `setOffline` reaches a played socket and WebKit's still lets a real one reconnect, and refuses every answer the test plays until it's back online, as a phone's network would (#60), with service workers blocked except in `offline.spec.ts` and `sheets-offline.spec.ts`; M1.14, M1.12, #72) and a `vite preview` middleware that, while a test cookie is set, answers `/api/*` with a 302 to a foreign origin as Access does for an expired session (AC 10, 11; M1.10, since WebKit can't fulfil a redirect through `page.route`). The auth-expiry case (M1.12) saves an entry after the session expired, follows Sign in → `/api/login` → back to the same route, and checks that the draft is restored and saved exactly once with the same `actionId`. A second case checks that a draft older than 12 h asks for confirmation instead of auto-saving, timer lifecycle (AC 20) using page reload and clock control. Every spec starts on a phone that has dismissed M5.1's install card, so none depends on how an engine reports an iPhone's signals (Playwright's WebKit on a Mac has `navigator.standalone` but no touch points; Chromium has touch points but no flag); `install.spec.ts` clears that and stubs both (M5.1). Trends' specs run the phone in America/Vancouver (`test.use({ timezoneId })`): CI runs in UTC, where reading the wrong zone can't fail, and under Playwright's clock date-fns on a `TZDate` reads the page's zone, which only shows outside UTC (M3.10). Every spec takes `test` from `e2e/test.ts`, as lint enforces. Its pages hear a played household socket, so another spec's write to the one local household can't make a page reload its played answers mid-test. A test that needs the real socket opts in with `test.use({ household: "real" })` (#72). Once a spec calls `page.clock`, the fixture floors its `Date.now()` to a whole millisecond, as a real one always is: inside a timer set with a fractional delay Playwright's returns a fraction, which Effect's tracer can't make a `BigInt` of, so every request then failed before `fetch` (#60) |
 | Device checklist | Manual, on both iPhones, after a deploy whose change needs it: sign-in or Access, the service worker, the manifest or install flow, or iOS-specific behaviour. That PR says "device checklist after deploy" in its body (decided 12 Oct 2026, M5.7) | S1/S2 re-run, lock-screen timer survival, airplane mode, VoiceOver spot check (AC 25) |
 
 Spec scenarios that become named fixtures: the 15+15 min / 50+50 mL feed (AC 4), 40+20 mL bottle (AC 3), 23:30–01:00 sleep (AC 12), 50 → 70 mL edit and month move (AC 17), 23- and 25-hour days (AC 23).
```

- [ ] **Step 1:** `git show aa80a61:CLAUDE.md > CLAUDE.md` and `git show aa80a61:docs/implementation-plan.md > docs/implementation-plan.md`, then `pnpm lint`.
- [ ] **Step 2:** commit: "Say in CLAUDE.md and the plan that going offline refuses played answers, and that the fixture floors the fake clock's Date.now()".

### Finish

- [ ] **Merge `main`** if it moved, and rerun the changed specs. If #99 or M5.2 merged first, run their specs on this branch too.
- [ ] **Gates:** ci.yml's steps on this checkout, the E2E step twice in both engines. Record each in the PR's table.
- [ ] **Proof:**
  - 50 repeats of each changed spec in WebKit on 8 workers.
  - The reconnect probe for 5 batches: no failures.
  - The slow-household probe: `main`'s heartbeat test fails, this branch's passes.
  - Re-measure the figures above.
- [ ] **Final review:** one fresh Opus review of the whole branch. Brief it with P1–P7 and the questions:
  - Can any spec now see a refused answer it relied on?
  - Can a page escape the route wrapper?
  - Does flooring `Date.now()` change what any spec asserts about times?
- [ ] **The PR:**
  - Push, and open it with `Closes #60`, the gates table and the proof.
  - Comment on #60, and message d5 and b5 the two rules.
  - Iterate on CodeRabbit until it approves.

## Unresolved questions

1. **Report upstream?** Both would be public issues, so it's Andrew's call.
   - **Playwright:** the fake clock's `Date.now()` returns a fraction inside a timer set with a fractional delay, which a real one never does.
   - **Effect:** `wallTimeNanos` does `BigInt(Date.now())` and throws on a fraction, where `monotonicNowNanos` rounds `performance.now()`.
