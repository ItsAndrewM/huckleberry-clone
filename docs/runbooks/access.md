# Runbook: production, Access and deploys

How the baby tracker runs in production, how it gets there, and what to do when something goes wrong. M1.16 set it up on 10 October 2026, and M5.7 made every green push to `main` deploy itself. The Step 0 spike (`docs/spike-results.md`) proved each piece first.

## What runs where

| Piece | Production value |
|---|---|
| App | https://baby.andamonium.dev, the Worker `baby-tracker` on a Custom Domain in the `andamonium.dev` zone. `workers_dev` and `preview_urls` are off, so this hostname is the only way in |
| Account | The personal Cloudflare account, pinned as `account_id` in `apps/worker/wrangler.jsonc` |
| Zero Trust team | `https://misty-wildflower-0505.cloudflareaccess.com`, the Worker's `ACCESS_TEAM_DOMAIN`. Global session 730 h |
| Access app | "Baby tracker", self-hosted on `baby.andamonium.dev` (the hostname, not a Worker-level policy, which refuses WebSockets). App id `c3b64064-49a5-45b8-bf25-d7e3cee20f9d`. Its AUD tag is the Worker's `ACCESS_AUD` |
| Sign-in | Google only, with instant redirect: no choice screen. Session 730 h, the most Access allows |
| Cookie | `SameSite=Lax` and `HttpOnly`, with no binding cookie. Lax stops other sites from using the session. The other `andamonium.dev` apps count as the same site, so the Worker stops them itself: a `/api/ws` upgrade must come from the app's exact origin, and every write must be `application/json`, which no page can send to another origin without a CORS preflight the Worker never answers |
| Policies | "BT caregivers" (Allow): the two parents' Google emails. "BT admin service token" (Service Auth): the `baby-tracker-admin` token |
| Admin token | Service token `baby-tracker-admin`. Its Client ID is the Worker's `ADMIN_SERVICE_TOKEN_CN`. The secret lives only in `.admin-token.env` on Andrew's Mac |
| Deploys | `.github/workflows/deploy.yml` runs `pnpm release` once CI passes on a push to `main` (M5.7). See "Deploys" below |
| Deploy token | An account-owned Cloudflare API token, "baby-tracker deploy (GitHub Actions)", with the Individual Workers Editor role on the `baby-tracker` Worker alone, kept as the GitHub repo secret `CLOUDFLARE_API_TOKEN`. See "The deploy token" below |
| Google side | Project "BT Access" (`bt-access-510920`) in Andrew's Google account. OAuth consent screen "Baby tracker" is External and in **Testing**, with both parents listed as test users. The web client "Cloudflare Access" has the team domain as its JavaScript origin and `<team domain>/cdn-cgi/access/callback` as its redirect URI |
| Logs | Workers Logs keeps the app's own lines only. Cloudflare's per-request records (`invocation_logs`) are off, because they would store the Access JWT and the email |

`scripts/release-checks.ts` refuses to deploy a config where any of the Worker's values above has drifted.

## The admin token file

`pnpm admin` reads `.admin-token.env` at the root of the checkout it runs in. Git ignores it. Deploys don't use it.

```
BT_URL=https://baby.andamonium.dev
CF_ACCESS_CLIENT_ID=<the token's Client ID, ending in .access>
CF_ACCESS_CLIENT_SECRET=<the token's Client Secret>
```

Never paste the secret into a chat, an issue or a commit. The Client ID isn't secret: it's in `wrangler.jsonc`.

## The deploy token

CI deploys with a Cloudflare API token that can edit the `baby-tracker` Worker and nothing else. It never expires (Andrew's choice, 12 October 2026). GitHub keeps it as the repo secret `CLOUDFLARE_API_TOKEN`. Only the deploy job's last step gets it, and inside `pnpm release` only Wrangler's processes do. The install, the build, git and gh run without it in their environment. The checkout keeps no GitHub credential in git's config either (`persist-credentials: false`). The whole job is the real boundary, since code that runs earlier in the job could still reach that step. That's why the job pins its one third-party action to a commit.

To create it, or replace one that might have leaked:

1. In the Cloudflare dashboard, open Manage account › Account API tokens and choose Create Token. Create it there, not under My Profile: Wrangler honours a per-Worker scope only on an account-owned token. Start from scratch, set the scope to Specified Workers › `baby-tracker`, and tick Editor on Individual Workers. Keep No expiration, and leave the IP filter empty, since GitHub's runners change address. The review should read "Workers › baby-tracker" with "Individual Workers Editor". The dashboard shows the token only once, so copy it before you leave the page.
2. In your own terminal, not through Claude, run `gh secret set CLOUDFLARE_API_TOKEN` and paste the token when it asks.
3. Re-run the last deploy from its run's page, or wait for the next push. Check that the run's Deploy step ran and that its summary says "Released …". A run that only notes "main moved on" never used the token.
4. If it's a replacement, delete the old token in the dashboard.

A deploy uploads a version and then puts it live (`wrangler versions upload`, then `wrangler versions deploy`). Neither step touches the Custom Domain, which a token for one Worker can't change, so the token needs nothing more.

**The accepted risk:** the repo is private on GitHub Free, which has no deployment environments or branch protection, so a workflow on any branch could read a repo secret. Only Andrew and his Claude sessions push branches here, so the token stays a repo secret.

## First deploy

Done on 10 October 2026. Run it again only to rebuild production from nothing. It needs about 45 minutes, the Cloudflare dashboard, and both phones.

1. **Check the machine:** in the main checkout, on an up-to-date `main` whose CI is green, run `pnpm --filter @bt/web exec wrangler whoami --config ../worker/wrangler.jsonc`. It should list the account in `wrangler.jsonc`. Check that `.admin-token.env` holds the three values above.
2. **Deploy:** from your Mac, with no `CLOUDFLARE_ENV` set, run `pnpm build`, then `pnpm --filter @bt/web exec wrangler deploy --config dist/baby_tracker/wrangler.json`. That creates the Worker and attaches `baby.andamonium.dev`, on your Wrangler login. `pnpm release` can't do it, since it uploads a version of a Worker that already exists. Then create a new deploy token for the new Worker, as "The deploy token" says.
3. **Check that Access is in front:** run `curl -sI https://baby.andamonium.dev/` and `curl -sI https://baby.andamonium.dev/sw.js`. Each should answer `302` with a `location` on `misty-wildflower-0505.cloudflareaccess.com`.
4. **Check the admin gate:** run `pnpm admin pitr:bookmark`. Expect `200 {"bookmark":"…"}`. A `302` means Access refused the token: check the "BT admin service token" policy and `.admin-token.env`.
5. **Seed:** run the command below with the real values as arguments only. Never put them in a file in the repo.

   ```
   pnpm admin household:seed --name "<household name>" --time-zone <IANA zone> \
     --caregiver "<Andrew's Google email>=Andrew" --caregiver "<Emily's Google email>=Emily" \
     --child-name "<child's name>" --birth-date <YYYY-MM-DD> --sex female --gestational-age-days 281
   ```

   - **Expect:** `201`, then `200` when run again.
   - **Emails:** use exactly the ones in the "BT caregivers" policy. A mistyped one is fixed with `caregiver:set-email` (see Caregivers below).
   - **Units:** the seed takes none, so the household starts at mL, kg and cm. Set them once in Settings.
6. **Run the restore drill**, while the household holds nothing worth losing:
   1. Run `pnpm admin pitr:bookmark`, and note the bookmark as B1.
   2. On a phone, in Settings, switch the volume unit to fl oz.
   3. Run `pnpm admin pitr:restore <B1>`. Expect `200 {"restoredTo":"<B1>","undo":"…"}`. Both phones lose their live connection for a moment and reconnect.
   4. Settings on both phones shows mL again. That proves the restore.
   5. Run `pnpm admin pitr:restore <undo>`. Settings shows fl oz again, which proves the undo. Set the unit you want.

   `docs/runbooks/restore.md` records how the first drill went, and how to run it again.
7. **Run the phone checks** below on both phones, and record the results in the PR or issue for the deploy.

## Phone checks

Run these on each iPhone:

- [ ] iOS 16.4 or later. The built CSS needs it.
- [ ] **Sign in:** in Safari, open https://baby.andamonium.dev. It goes straight to Google, then back to the app signed in.
- [ ] **Install:** Share, then Add to Home Screen. On iOS 26, Share may sit under ⋯; from M5.1 the app's own card in a Safari tab says so. The installed app opens standalone, with the moon icon and "Baby tracker" under it. Once M5.1 is released, Settings' Home Screen line reads "Installed." there. Check the status bar in light and dark.
- [ ] **Offline:** open the installed app online once, so the service worker saves this build. Then cold-start it in airplane mode: the app opens with "No connection".
- [ ] **Session expiry:** in Zero Trust (My Team, then Users), revoke that parent's sessions. Reopen the app, tap "Sign in to continue", sign in with Google, and land back in the app.
- [ ] **Switching Google accounts:** sign out of Access first, at https://baby.andamonium.dev/cdn-cgi/access/logout.
- [ ] **Live updates:** change a setting on one phone. The other shows it within a few seconds.
- [ ] **Disabling a caregiver:** run `pnpm admin caregiver:disable <email>`. Expect a 200, and that phone shows it's signed out. Then run `pnpm admin caregiver:enable <email>`, expect a 200, and sign in again.
- [ ] **Time zone:** Settings' picker lists the household's zone.
- [ ] **Socket idle timeout:** in desktop Chrome, open the app and watch the `/api/ws` socket in DevTools (Network, then WS). It pings every 30 s. Note whether Cloudflare ever closes it (1006) while the tab stays in front, and after how long.

## Deploys

Every push to `main` deploys itself once CI passes (M5.7):

1. CI runs `check` and `e2e` on the push.
2. When CI finishes green, `.github/workflows/deploy.yml` checks out the commit CI tested. If `main` has moved on since, it notes "main moved on to …" and ends green, and the newer commit deploys after its own CI.
3. Otherwise it runs `pnpm release`, which refuses at the first of these that fails:
   1. the checkout is clean and at `origin/main`
   2. CI passed on that commit, or, with `--gates-local`, CI's own commands pass on this checkout (see "Deploying by hand")
   3. a fresh build, without `CLOUDFLARE_ENV`, whose config passes the checks

   It then uploads the build as a new version, tagged with the commit (`wrangler versions upload`). Nothing is live yet. Next it notes the restore point, the current UTC second, and puts that version live (`wrangler versions deploy <version>@100%`). The deployment's message reads like `20390a3 restore point 2026-10-12T15:49:59Z ci:18233456789`.
4. The run's summary gives the restore point and the command that rewinds the household to it, before the version goes live. It then says "Released …" once the version is live.
5. Nothing to do on the phones (#61). Every deploy drops the household's live connection, and the app checks for a new version whenever it reconnects or comes back from the background, so each phone saves the new build the next time it's online. It opens it the next time the app comes back online with nothing open: no sheet, nothing on its way to the household or kept on the phone, no Undo, no unsaved change in Settings and no field being typed in. Offline, the app keeps the page it has, so Today and logging stay. Settings › Offline copy says when a newer version is waiting, and **Open it now** switches at once. After a deploy whose PR says "device checklist after deploy", run the device checklist in `docs/implementation-plan.md` §6.

- **The record:** `pnpm --filter @bt/web exec wrangler deployments list --config ../worker/wrangler.jsonc` shows the 10 most recent deploys with their messages, whether CI or your Mac ran them. CI's deploys show no author, because the token belongs to the account rather than a person. Their message's `ci:<run id>` names the run instead, and a deploy from your Mac ends in `local`, or `local gates` when it ran CI's commands itself. For an older deploy, open its Deploy run (`gh run list --workflow deploy.yml`). Its summary and its log (`gh run view <run id> --log`) hold the restore point, and GitHub keeps them 90 days. `deploys.log` in the main checkout stopped growing with M5.7. Its bookmarks still restore until PITR ages them out, from about 10 November 2026.
- **A failed deploy:** GitHub emails a failed run to the person it's attributed to, normally whoever merged.
  - A failed upload leaves production on the previous version.
  - A failed `versions deploy` usually does too, but one that timed out may have gone through. So before you re-run the job, deploy by hand or roll back, check what's live with `pnpm --filter @bt/web exec wrangler deployments status --config ../worker/wrangler.jsonc`.
  - Re-run the failed job from the run's page, or deploy by hand.
- **Re-running CI:** on `main`, re-run only the newest commit's CI. CI runs on `main` share one queue that cancels a run still going, so re-running an older commit's CI can cancel the newest one's, and then nothing deploys main's head. If main's head shows a cancelled CI, re-run it, or deploy by hand.
- **What CI can't deploy:** a commit that adds, renames or deletes a Durable Object class (a new `migrations` entry in `apps/worker/wrangler.jsonc`). For that, `wrangler versions upload` refuses with "pending Durable Object migration". Deploy such a commit by hand:
  1. Pause deploys (below), and merge it.
  2. From an up-to-date `main`, with no `CLOUDFLARE_ENV` set, run `pnpm build`. Note the current UTC second as its restore point, like `2026-10-12T15:49:59Z`.
  3. Run `pnpm --filter @bt/web exec wrangler deploy --config dist/baby_tracker/wrangler.json --tag <full commit> --message "<first 7 of the commit> restore point <that second> local"`. Deployment history then holds its restore point like any other deploy's.
  4. Enable deploys again.

  Its PR should say so.
- **Exports:** a deploy saves none. Before merging a migration, run `pnpm admin export`, then `pnpm migrations:dry-run` on that file (see Exports).

## Deploying by hand

From the main checkout, run `git switch main`, `git pull --ff-only`, `pnpm install --frozen-lockfile`, then `pnpm release`. Use it when CI's deploy failed or deploys are paused. It runs the same checks and steps as CI, on your Wrangler login, and its messages end in `local` instead of the run. It still needs CI to have passed on the commit.

When GitHub Actions can't run CI (an outage, or the month's minutes are spent, as on 15 October 2026), run `pnpm release --gates-local` instead, on Andrew's word (#96):
- **What it changes:** it skips the question to GitHub and runs CI's own commands on the checkout, in ci.yml's order: `pnpm install --frozen-lockfile`, `pins:check`, `lint`, `typecheck`, `test`, `coverage`, `build`, `bundle:check`, then `e2e` in both engines.
- **How they run:** with `CI=1`, as on GitHub, so E2E keeps its one retry and refuses a busy port 4173. A test ties the list to ci.yml's `run:` steps.
- **When one fails:** the release stops at the first command that fails and names it. Otherwise it goes on as usual: the clean checkout at `origin/main`, the build and its checks, the restore point, the upload, the deploy.
- **Its record:** the deployment's message ends in `local gates`.
- **How long:** expect several minutes, most of them E2E. Stop any `vite preview` on port 4173 first.

## Pausing deploys

`gh workflow disable deploy.yml` stops automatic deploys, and `gh workflow enable deploy.yml` starts them again. A push made while they're paused doesn't deploy, even once they're enabled again: run `pnpm release`, or wait for the next push. `pnpm release` works while they're paused.

## When a deploy goes wrong

1. **Pause deploys** with `gh workflow disable deploy.yml`, so the next merge can't deploy the bad code again. That doesn't stop a run that's already going. Check `gh run list --workflow deploy.yml --limit 5`, and cancel any queued or running one with `gh run cancel <run id>`.
2. **Code** (the app misbehaves):
   1. Run `pnpm --filter @bt/web exec wrangler deployments list --config ../worker/wrangler.jsonc`, and find the bad commit's deploy by its message.
   2. Roll back to the version deployed just before it: `pnpm --filter @bt/web exec wrangler rollback <that version's ID> --message "<why>" --config ../worker/wrangler.jsonc`.

   Don't roll back to "the previous version" without looking: a later merge may sit on top of the bad one and still hold its change. That config pins the account and names the Worker. Older code runs against a newer schema, because migrations only add.
3. **Data too:** take the bad deploy's restore point from its message, or from its Deploy run if it's older than the last 10 deploys. Restore to it with `pnpm admin pitr:restore --at <restore point>`, as `docs/runbooks/restore.md` says. For a deploy before M5.7, use its bookmark in `deploys.log`. That runbook also covers a restore that answers 503.
4. **Fix forward:** run `gh workflow enable deploy.yml` before you merge the fix, so its merge deploys it. Or merge it first, then enable deploys and run `pnpm release`.

Roll back the code before you restore the data. The order matters: a restore restarts the household under whatever code is deployed, and the household applies the code's missing migrations at every start. Restoring under the bad code would run its migration again over the restored data. After the rollback, the older code starts on the newer schema (it skips ledger entries it doesn't know), and the restore then takes the data and the migration ledger back to before that deploy.

## Exports

- **From your Mac:** `pnpm admin export <file>` saves the household's JSON export to a new file. It never writes over a file that's already there, and it prints only how many tables and rows the export holds. Deploys don't save one (M5.7), so take one before merging a migration, or whenever you want a copy older than PITR's 30 days. The releases before M5.7 saved theirs to `exports/`. Each holds every row, her name and birth date included, so keep the folder on this Mac.
- **Before merging a migration:** `pnpm migrations:dry-run <file>` (a leading `~` is your home folder, quoted or not) rebuilds the tables a fresh export was taken under in Node's in-memory SQLite, checks the export's tables, and the columns of each table with rows, against them, loads every row, and applies each migration the export hasn't seen in its own transaction with foreign keys on, as the household's Durable Object does. It writes nothing (M3.1). It fails, naming the migration, table or reference, when:
  - a migration fails
  - a table's row count changes: a migration that adds rows to a table the export holds fails too
  - a reference points at a row that isn't there, whether a migration broke it or the export already had it broken
  - the export's tables, or the columns of a table with rows, don't match the ones its migrations build, or it holds no rows
- **What it can't see:** it runs Node's SQLite, not workerd's, so it can pass what only the Durable Object's SQLite refuses. An export holds no `receipts` rows, which expire after a day, so a migration that touches `receipts` meets none.
- **Nothing to apply:** "The export already has every migration, so there was nothing to apply." exits 1. The export already lists every migration on disk, so something deployed the migration already, or you gave it the wrong file.
- **Where it may go:** outside the checkout, like `~/baby-tracker.json` (a leading `~` is your home folder, quoted or not), or under the checkout's `exports/`. It refuses anywhere else in the checkout, where git would see the file, even by way of a symlink.
- **From a phone:** Settings › Export shares the CSV or the JSON through the share sheet. A browser that can't share files downloads them instead.
- **What's in them:** the JSON keeps every table as stored: every row and column, deleted rows and audit columns included, with the migrations applied. It leaves out the receipts, which expire after a day. The CSV has a row per live feed, diaper, sleep and measurement, at the household's local time.

## Caregivers

- **Disable or enable:** `pnpm admin caregiver:disable <email>` and `caregiver:enable <email>` (D6). Disabling closes that parent's sockets at once.
- **Fix or change an email:** `pnpm admin caregiver:set-email <current email> <new email>`. The caregiver keeps their id and entries, and their open sockets are closed. Then:
  1. In Zero Trust (Access controls, then Policies), edit "BT caregivers" to the new email.
  2. In Google Cloud (project "BT Access", OAuth consent screen, Test users), add the new Google account. While the app is in Testing, Google refuses anyone not on that list.
- **A `400` on `newEmail`:** another caregiver already has that email.

## Sign-in problems

- **Normal:** sessions last 730 hours, about a month. After that, each phone signs in with Google again from "Sign in to continue". Google's "unverified app" notice at sign-in is expected while the consent screen is in Testing.
- **If Google sign-in fails inside the installed app:** in Zero Trust (Access controls, Applications, "Baby tracker", Login methods), add One-time PIN and turn off Instant Auth (the instant redirect). That's the spike's S1 fallback: the same allowlist, with a code sent by email.

## Logs

Workers Logs lives in the dashboard: Workers & Pages, then `baby-tracker`, then Logs. For a live view, run `pnpm --filter @bt/web exec wrangler tail --config ../worker/wrangler.jsonc`. Each line is one JSON object, and none holds a token or an email:

| `event` | Fields | Means |
|---|---|---|
| `refused` | `reason`, `route` | The Worker or the household answered 401 |
| `refused` with `reason: "foreign-origin"` | `route` | A `/api/ws` upgrade came from another origin, or with none, and got 403. The `Origin` isn't logged, because the caller writes it |
| `refused` with `reason: "not-json"` | `route` | A write wasn't `application/json`, and got 415. The app always sends JSON, so this is another page trying to write |
| `keys-unavailable` | `route`, `cause` | Cloudflare's Access signing keys were out of reach. The app got 503 and retries |
| `household-unavailable` | `route`, `cause` | The household couldn't be reached, an admin command failed, or a restore didn't restart it. The app or `pnpm admin` got 503 |
| `defect` | `route`, `caregiverId`, `actionId` | The household answered 500. The error and its stack are on the line next to it |

What each `reason` means:

| Reason | Means |
|---|---|
| `no-token` | A request reached the Worker without an Access JWT, so Access isn't in front of the hostname |
| `access-unconfigured` | `ACCESS_TEAM_DOMAIN` or `ACCESS_AUD` is empty or invalid |
| `wrong-audience` | The JWT is for another Access app. If the app was recreated, `ACCESS_AUD` is stale |
| `wrong-issuer`, `bad-signature`, `unknown-key`, `wrong-algorithm`, `malformed`, `invalid-claims` | A JWT that isn't Access's, or was altered |
| `expired` | An expired JWT |
| `no-identity` | A valid JWT with no email and no Client ID |
| `not-admin` | `/api/admin/*` was called by anything but the admin token |
| `service-token` | A service token was used on a caregiver route |
| `not-a-caregiver` | The email isn't an active caregiver: it's disabled or mistyped. Check `caregiver:set-email` |

## Rebuilding the Access app

If the "Baby tracker" app is ever deleted, recreate it before anything else, so the hostname is never open:

1. Recreate it with these settings, through the dashboard or through `POST /accounts/<account_id>/access/apps`:

   ```json
   {
     "name": "Baby tracker",
     "type": "self_hosted",
     "domain": "baby.andamonium.dev",
     "destinations": [{ "type": "public", "uri": "baby.andamonium.dev" }],
     "session_duration": "730h",
     "allowed_idps": ["<the Google login method's id>"],
     "auto_redirect_to_identity": true,
     "app_launcher_visible": false,
     "same_site_cookie_attribute": "lax",
     "http_only_cookie_attribute": true,
     "enable_binding_cookie": false,
     "policies": [
       { "id": "<BT caregivers policy id>", "precedence": 1 },
       { "id": "<BT admin service token policy id>", "precedence": 2 }
     ]
   }
   ```

   Set SameSite explicitly, because it reverts to `None` when left out.
2. Copy the new app's AUD tag into `ACCESS_AUD` in `apps/worker/wrangler.jsonc`, and merge it. It deploys once CI passes. Until it ships, every request is refused with `wrong-audience`.

## Rotating the admin token

The token never expires (Andrew's choice, 10 Oct 2026), so nothing needs renewing. The only reason to change it is a secret that might have leaked.

If the secret leaks, replace the token; don't rotate it. Rotating keeps the Client ID, and the Worker admits any Access JWT that carries it, including ones already issued against the leaked secret, for up to 730 hours. Replace it in this order:

1. Create a new token.
2. Add it to the "BT admin service token" policy, beside the old one.
3. Put its Client ID in `ADMIN_SERVICE_TOKEN_CN`, and merge it. Once that deploys, the Worker refuses every JWT that carries the old Client ID.
4. Put the new token in `.admin-token.env`, and check that `pnpm admin pitr:bookmark` answers 200.
5. Delete the old token, which also takes it out of the policy.
