# Runbook: production, Access and deploys

How the baby tracker runs in production, how it gets there, and what to do when something goes wrong. M1.16 set it up on 10 October 2026. The Step 0 spike (`docs/spike-results.md`) proved each piece first.

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
| Google side | Project "BT Access" (`bt-access-510920`) in Andrew's Google account. OAuth consent screen "Baby tracker" is External and in **Testing**, with both parents listed as test users. The web client "Cloudflare Access" has the team domain as its JavaScript origin and `<team domain>/cdn-cgi/access/callback` as its redirect URI |
| Logs | Workers Logs keeps the app's own lines only. Cloudflare's per-request records (`invocation_logs`) are off, because they would store the Access JWT and the email |

`scripts/release-checks.ts` refuses to deploy a config where any of the Worker's values above has drifted.

## The admin token file

`pnpm admin` and `pnpm release` read `.admin-token.env` at the root of the checkout they run in. Git ignores it.

```
BT_URL=https://baby.andamonium.dev
CF_ACCESS_CLIENT_ID=<the token's Client ID, ending in .access>
CF_ACCESS_CLIENT_SECRET=<the token's Client Secret>
```

Never paste the secret into a chat, an issue or a commit. The Client ID isn't secret: it's in `wrangler.jsonc`.

## First deploy

Do this once, right after the M1.16 prep PR merges. It needs about 45 minutes, the Cloudflare dashboard, and both phones.

1. **Check the machine:** in the main checkout, on an up-to-date `main` whose CI is green, run `pnpm --filter @bt/web exec wrangler whoami --config ../worker/wrangler.jsonc`. It should list the account in `wrangler.jsonc`. Check that `.admin-token.env` holds the three values above.
2. **Deploy:** run `pnpm release --first`. It creates the Worker and attaches `baby.andamonium.dev`. It takes no bookmark, because there's no household yet.
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

## Every later deploy

1. Merge to `main`, wait for CI, then pull the main checkout.
2. Run `pnpm release`. It runs these steps and refuses at the first that fails:
   1. the checkout is a clean `main` that matches `origin/main`
   2. CI passed on that commit
   3. a fresh build, without `CLOUDFLARE_ENV`, whose config passes the checks
   4. a PITR bookmark of the household
   5. `wrangler deploy`

   It then appends the time, the commit and the bookmark to `deploys.log`, which git ignores.
3. Open the app online on each phone once, so its offline copy moves to the new build.

## When a deploy goes wrong

- **Code only** (the app misbehaves, but the data is right): roll back to the previous version with `pnpm --filter @bt/web exec wrangler rollback --config ../worker/wrangler.jsonc`. That config pins the account and names the Worker. Older code runs against a newer schema, because migrations only add.
- **Data too:** find the bookmark taken before that deploy in `deploys.log`, and restore it as `docs/runbooks/restore.md` says. That runbook also covers a restore to a time and a restore that answers 503.
- **Both:** roll back the code first, then restore the data. The order matters: a restore restarts the household under whatever code is deployed, and the household applies the code's missing migrations at every start. Restoring under the bad code would run its migration again over the restored data. After the rollback, the older code starts on the newer schema (it skips ledger entries it doesn't know), and the restore then takes the data and the migration ledger back to before that deploy.

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
2. Copy the new app's AUD tag into `ACCESS_AUD` in `apps/worker/wrangler.jsonc`. Merge that, then run `pnpm release`. Until it ships, every request is refused with `wrong-audience`.

## Rotating the admin token

The token never expires (Andrew's choice, 10 Oct 2026), so nothing needs renewing. The only reason to change it is a secret that might have leaked.

If the secret leaks, replace the token; don't rotate it. Rotating keeps the Client ID, and the Worker admits any Access JWT that carries it, including ones already issued against the leaked secret, for up to 730 hours. Replace it in this order, so `pnpm release` can still take its bookmark:

1. Create a new token.
2. Add it to the "BT admin service token" policy, beside the old one.
3. Put its Client ID in `ADMIN_SERVICE_TOKEN_CN`, merge, and run `pnpm release` while `.admin-token.env` still holds the old token. The deployed Worker still admits that one for the bookmark. From this release on, the Worker refuses every JWT that carries the old Client ID.
4. Put the new token in `.admin-token.env`, and check that `pnpm admin pitr:bookmark` answers 200.
5. Delete the old token, which also takes it out of the policy.
