# Runbook: restores and the restore drill

How to rewind the household's data, and how the drill that proves it went. Restores use Durable Objects point-in-time recovery: Cloudflare keeps the last 30 days of the household's storage, and `pnpm admin` asks the Worker to rewind it. M1.16 built the commands, and M5.3's drill ran on deploy day, 10 October 2026 (AC 15).

## What a restore does

- It rewinds everything in the household to one moment: entries, settings, the child, the caregivers and the migration ledger. A caregiver the restore disables is refused from then on.
- It restarts the household. Every phone's live connection drops and reconnects, and the app then shows the restored data.
- It answers with an `undo` bookmark, which holds the household as it was just before the restore. Restoring `undo` reverses the restore.
- Anything written after the moment you restore to is gone, unless you restore `undo`. Ask the other parent not to log anything until you're done.
- If a deploy also broke the code, roll the code back first, as "When a deploy goes wrong" in `docs/runbooks/access.md` says.

## Pick the moment

- **Before a deploy:** each deploy's message holds its restore point, the UTC second just before it went live, like `20390a3 restore point 2026-10-12T15:49:59Z ci:18233456789`. `pnpm --filter @bt/web exec wrangler deployments list --config ../worker/wrangler.jsonc` shows the last 10 deploys. An older deploy's restore point is in its Deploy run's summary and log on GitHub (`gh run list --workflow deploy.yml`), kept 90 days. Restore with `--at` and that time. Deploys before M5.7 are in `deploys.log` in the main checkout, each with the bookmark `pnpm release` took then; they work until PITR ages them out, from about 10 November 2026.
- **Before anything risky:** take a bookmark with `pnpm admin pitr:bookmark`. It answers `200 {"bookmark":"…"}`.
- **A time instead:** `--at` takes an ISO time with its zone, such as `2026-10-10T18:00:00Z` or `2026-10-10T20:00:00+02:00`. The time must fall within the last 30 days and not in the future, or the Worker answers `400` naming `at`.
- **Older than 30 days:** PITR can't reach it, and only an export reaches that far back. `pnpm admin export <file>` takes one at any time (M3.11); deploys don't (M5.7), and the releases before M5.7 saved theirs to `exports/` in the main checkout. An export holds every row, deleted ones included, but nothing loads one back into the household yet, so rebuilding from it is manual.

## Restore

Run these from the main checkout, which holds `.admin-token.env`.

1. Run `pnpm admin pitr:restore <bookmark>`, or `pnpm admin pitr:restore --at <time>`.
2. Expect `200 {"restoredTo":"<bookmark>","undo":"<undo>"}`. Keep the `undo` until you're sure.
3. Check on a phone that the data is back as it was at that moment.
4. If it's the wrong moment, run `pnpm admin pitr:restore <undo>`. That answers with an `undo` of its own.

## When a restore answers 503

- **With `{"scheduled":"…","undo":"…"}`:** the restore is scheduled, but the household didn't confirm a restart, so it may apply at the next restart instead. Keep that `undo`: it's the state from before the restore. Check in the app whether the data is back. If it isn't, run the same `pitr:restore` command again to restart the household now. Keep the first `undo`, not the one the retry answers: if the first restore applied before the retry, the retry's `undo` points at the restored state.
- **With `{"_tag":"ServiceUnavailable"}` only:** the restore failed, for any reason: the household couldn't be reached, or the restore call itself failed. It may still have been scheduled. Before you run the same command again, check in the app whether the data is already back, and read the `household-unavailable` log line, whose `cause` says what failed (see "Logs" in `docs/runbooks/access.md`). If the data is back, don't run it again: the new `undo` would point at the restored state.

## The drill

Run it again before trusting a restore to something new, such as before merging a new migration, since the merge deploys it. It takes a few minutes and one phone.

1. Ask the other parent not to log anything until you're done.
2. Run `pnpm admin pitr:bookmark`, and note the bookmark as B1.
3. On a phone, in Settings, switch the volume unit.
4. Run `pnpm admin pitr:restore <B1>`. Expect `200` with an `undo`. Settings shows the old unit again.
5. Run `pnpm admin pitr:restore <undo>`. Settings shows the unit from step 3 again. Then set the unit you want.

A setting stands in for any entry: a restore rewinds the household's whole storage, so a setting that comes back proves what a feed that comes back would.

## The first drill: deploy day, 10 October 2026

It ran a few minutes after the seed and before anything was logged, so the production household had nothing to lose. It stood in for the separate environment M5.3 asked for (Andrew's choice, 10 October 2026). Andrew's iPhone took part. The times are UTC, where it was already 11 October.

| Step | Time (UTC) | Result |
|---|---|---|
| Seed | 03:43:58 | `201`, then `200` when run again |
| Bookmark B1 | 03:44:13 | `200`, B1 `00000001-00000002-…-fb8062a9…` |
| Volume unit to fl oz, on the phone | 03:48 | Settings showed fl oz |
| `pitr:restore <B1>` | 03:49:39 | `200` in about a second, with `undo` `00000001-ffffffff-…-6a6157e7…`. The phone showed mL again |
| `pitr:restore <undo>` | 04:25:42 | `200` in about a second. The phone showed fl oz at once |
