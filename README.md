# Taiwan MLB Tracker 🇹🇼⚾

A mobile-friendly tracker for Taiwanese baseball players using MLB / MiLB Stats API data, with LINE notifications and a shared Cloudflare KV observation list.

## Production status

2026-08-29 stability recovery:

- Keep the last-good dashboard visible while background reconciliation runs; the UI must not become an all-page indefinite "checking" state.
- The browser-wide `gameday-universe-hotfix.js` scan is disabled from production startup because it can create excessive client-side work. Authoritative scheduled snapshot refresh remains the primary full-roster data path.
- LINE production schedules are explicitly enabled at 07:00, 08:00, 09:00 and 12:00 Asia/Taipei. Do not remove the `schedule:` trigger when preserving manual test support.
- Required workflow after changes: CHECK → FIX → DEPLOY → TESTING → README verification → READY TO TEST.

## Shared observation list

The production source of truth is the Cloudflare Workers KV namespace `taiwan-mlb-observation-list`.

A small Cloudflare Worker (`cloudflare/observation-worker.js`) exposes a public read-only `/players` endpoint. Add/remove mutations require the Worker `ADMIN_TOKEN`; the token is never exposed in browser JavaScript. The dashboard and LINE workflow both read the same `/players` endpoint once `OBSERVATION_API_URL` is configured.

During initial setup only, `tracked-players.json` remains as a safe fallback and as the seed list used when the KV namespace has no `players` entry yet.

The website's **Manage** control searches MLB / MiLB players and prepares an Add/Remove GitHub approval request. Only requests opened by the repository owner are accepted by the `Observation list manager` workflow. That workflow validates the MLB player ID and calls the protected Cloudflare Worker API. Friends can view the site and search players, but cannot change the production list through the automation.

## Cloudflare deployment

The workflow **Deploy observation Worker** deploys the Worker, connects it to the existing KV namespace named `taiwan-mlb-observation-list`, installs the admin secret, verifies the API, discovers the workers.dev URL, and commits that URL into `observation-config.js` for the dashboard.

Required GitHub Actions secrets:

- `CLOUDFLARE_API_TOKEN` — Cloudflare API token with Workers Scripts edit and Workers KV Storage edit/read permissions for the account.
- `CLOUDFLARE_ACCOUNT_ID` — Cloudflare account ID.
- `OBSERVATION_ADMIN_TOKEN` — a long random private token used only between GitHub Actions and the Worker.
- `OBSERVATION_API_URL` — after deployment, copy the Worker URL reported by the deploy workflow into this secret so LINE and the owner-only watchlist workflow use the same API.

No Cloudflare token, LINE token, or observation admin token is stored in the repository or browser.

## LINE notifications

The **LINE daily tracker updates** workflow is the only LINE sender. It runs in production at these Taiwan times:

- 07:00 Asia/Taipei → `0 23 * * *` UTC (previous UTC day)
- 08:00 Asia/Taipei → `0 0 * * *` UTC
- 09:00 Asia/Taipei → `0 1 * * *` UTC
- 12:00 Asia/Taipei → `0 4 * * *` UTC

The 07:00 run sends a morning summary. The 08:00 and 09:00 runs send only when tracked data changes. The noon run sends the final daily summary.

Manual troubleshooting is available from **Actions → LINE daily tracker updates → Run workflow**. Manual runs use the same production sender and data path, but every manual message begins with `🧪 TEST — Taiwan MLB Tracker`, has no cron schedule, and does not overwrite the production comparison snapshot.

LINE credentials remain in GitHub Actions secrets (`LINE_CHANNEL_ACCESS_TOKEN` and `LINE_DESTINATION_ID`, with legacy `LINE_USER_ID` support). They are never stored in the repository or browser.

## Report content

LINE reports include game state (`FINAL`, `LIVE / IN PROGRESS`, `NOT STARTED`, or `NO GAME`), appearance/performance, season statistics, player/roster status, recent transaction information, and a short observation.
