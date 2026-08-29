# Taiwan MLB Tracker 🇹🇼⚾

A mobile-friendly tracker for Taiwanese baseball players using MLB / MiLB Stats API data, with LINE notifications and a shared Cloudflare KV observation list.

## Production status

2026-08-29 stability recovery:

- Keep the last-good dashboard visible while background reconciliation runs; the UI must not become an all-page indefinite "checking" state.
- The browser-wide `gameday-universe-hotfix.js` scan is disabled from production startup because it can create excessive client-side work. Authoritative scheduled snapshot refresh remains the primary full-roster data path.
- Cloudflare is the only production LINE scheduler. One Cloudflare cron covers 07:00, 08:00, 09:00 and 12:00 Asia/Taipei. GitHub `LINE daily tracker updates` is manual fallback/testing only and must not have a `schedule:` trigger.
- Required workflow after changes: UNDERSTAND → CHECK → FIX → TEST → DEPLOY → TEST AGAIN → README / AGENTS verification → traffic-light status → READY TO TEST.

## Shared observation list

The production source of truth is the Cloudflare Workers KV namespace `taiwan-mlb-observation-list`.

A small Cloudflare Worker (`cloudflare/observation-worker.js`) exposes a public read-only `/players` endpoint. Add/remove mutations require the Worker `ADMIN_TOKEN`; the token is never exposed in browser JavaScript. The dashboard and LINE production worker both read the same KV-backed observation list.

During initial setup only, `tracked-players.json` remains as a safe fallback and as the seed list used when the KV namespace has no `players` entry yet.

The website's **Manage** control searches MLB / MiLB players and prepares an Add/Remove GitHub approval request. Only requests opened by the repository owner are accepted by the `Observation list manager` workflow. That workflow validates the MLB player ID and calls the protected Cloudflare Worker API. Friends can view the site and search players, but cannot change the production list through the automation.

## Cloudflare deployment

The workflow **Deploy observation Worker** deploys the observation Worker and the LINE notifier, connects them to the existing KV namespace named `taiwan-mlb-observation-list`, installs required secrets, verifies worker health, and configures the dashboard API URL.

The production LINE notifier is `cloudflare/line-worker-single-cron.js`, which wraps the Flex notifier and owns one Cloudflare Free-plan cron:

`0 0,1,4,23 * * *` UTC

The wrapper maps that cron to the four Taiwan notification slots and keeps delivery de-duplication state in KV.

Required GitHub Actions secrets include Cloudflare credentials and LINE credentials. No Cloudflare token, LINE token, or observation admin token is stored in the repository or browser.

## LINE notifications

**Cloudflare is the sole production LINE scheduler.** Production notification times are:

- 07:00 Asia/Taipei → `0 23 * * *` UTC (previous UTC day)
- 08:00 Asia/Taipei → `0 0 * * *` UTC
- 09:00 Asia/Taipei → `0 1 * * *` UTC
- 12:00 Asia/Taipei → `0 4 * * *` UTC

The 07:00 run sends a morning summary. The 08:00 and 09:00 slots report the current MLB-visible state through the Cloudflare notifier. The noon run sends the final daily summary.

GitHub Actions **LINE daily tracker updates** is **manual fallback/testing only**. It has `workflow_dispatch` but no production cron. Manual troubleshooting is available from **Actions → LINE daily tracker updates → Run workflow**. Every manual message begins with `🧪 TEST — Taiwan MLB Tracker` and does not overwrite the production comparison snapshot.

This separation is intentional: do not enable production schedules in both GitHub and Cloudflare, because two schedulers can create duplicate or conflicting notifications.

## Report content

LINE reports include game state (`FINAL`, `LIVE / IN PROGRESS`, `NOT STARTED`, or `NO GAME`), appearance/performance, season statistics, player/roster status, recent transaction information, and a short observation.
