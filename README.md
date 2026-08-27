# Taiwan MLB Tracker 🇹🇼⚾

A mobile-friendly tracker for Taiwanese baseball players using MLB / MiLB official Stats API data, with LINE notifications and a shared Cloudflare KV observation list.

## Before changing this project

Read this section and `ARCHITECTURE_V2.md` before modifying production behavior. These rules are the lessons learned from the first month of building the tracker.

1. **MLB / MiLB official APIs are the only baseball-stat truth.** Cloudflare, GitHub snapshots, browser cache, LINE state, and UI helpers must never become competing sources of baseball results.
2. **Visible first, refresh second.** On startup, immediately render the newest valid last-good data. Refresh happens in the background and must never replace real rows with a full-screen or row-level “checking” state.
3. **Snapshot is fallback only.** It may seed a cold browser or replace an older cache. It must never overwrite newer last-good data already confirmed by that browser.
4. **One refresh owner.** Only one controller may decide when official data is fetched and committed to the player store. Do not add another hotfix that independently changes today/game state. Fix or replace the owner instead.
5. **Targeted lookup before universe scan.** Start from current player/team identity, today’s relevant schedule, and known gamePk. Broader MLB/MiLB scans are fallback recovery only when identity/team data is missing or inconsistent.
6. **Render atomically.** Summary counts, player rows, details, highlights, and downstream consumers must all use the same committed player-store version.
7. **Protect main.** Architecture changes belong in a branch and Draft PR. Main receives only small, understood production repairs until validation and mobile smoke tests are green.
8. **Tests are architecture contracts.** When behavior intentionally changes, update the contract deliberately; never weaken tests just to make a build green.
9. **Features read data; they do not own data.** Ranking, insights, highlights, LINE formatting, and future modules consume normalized player data. They do not fetch MLB independently or mutate refresh state.
10. **Keep documentation synchronized with production.** When the owner of a responsibility moves (for example GitHub → Cloudflare), update this README in the same change.

### Target V2 flow

`MLB/MiLB official APIs → normalized player store → refresh controller → dashboard`

Snapshot is a display fallback into the store. Cloudflare owns observation/shared delivery state. Ranking, insights, highlights, and LINE formatting are downstream readers.

## Shared observation list

Cloudflare Workers KV namespace `taiwan-mlb-observation-list` is the production source of truth **for the observation list only**. It is not a source of baseball statistics.

A small Cloudflare Worker (`cloudflare/observation-worker.js`) exposes a public read-only `/players` endpoint. Add/remove mutations require the Worker `ADMIN_TOKEN`; the token is never exposed in browser JavaScript. The dashboard and LINE production path read the same observation list once `OBSERVATION_API_URL` is configured.

`tracked-players.json` remains a safe repository fallback for player identity/list recovery when the observation API is unavailable.

The website's **Manage** control searches MLB / MiLB players and prepares an Add/Remove GitHub approval request. Only requests opened by the repository owner are accepted by the `Observation list manager` workflow. That workflow validates the MLB player ID and calls the protected Cloudflare Worker API. Visitors can view the site and search players but cannot change the production list through the automation.

## Dashboard data and snapshot

Fresh baseball results come from MLB / MiLB official Stats APIs. The central dashboard snapshot is a **last-good display fallback**, generated from the same official source. It exists so the page can show useful data immediately while a live refresh runs.

A snapshot may seed a browser with no valid cache, or replace an older browser cache. A snapshot must not overwrite newer official data already confirmed in that browser.

## LINE notifications

Cloudflare is the production LINE scheduler. It owns the four Taiwan delivery slots and delivery de-duplication state. The GitHub workflow **LINE daily tracker updates** is manual troubleshooting/fallback only; it does not run the production schedule.

Production Taiwan slots:

- 07:00 Asia/Taipei
- 08:00 Asia/Taipei
- 09:00 Asia/Taipei
- 12:00 Asia/Taipei

The Cloudflare wrapper maps these Taiwan hours to the appropriate UTC cron semantics and keeps delivery state in KV. Manual GitHub runs use the selected slot for troubleshooting and are explicitly marked as tests.

LINE content must be derived from the same official-data model as the dashboard. Notification formatting may reorganize or summarize player data, but it must not invent a separate baseball truth path.

## Cloudflare deployment

The workflow **Deploy observation Worker** deploys the observation Worker, connects it to the existing KV namespace named `taiwan-mlb-observation-list`, installs the admin secret, verifies the API, discovers the workers.dev URL, and commits that URL into `observation-config.js` for the dashboard.

Required GitHub Actions secrets include Cloudflare deployment credentials, the observation admin token, and LINE credentials. No Cloudflare token, LINE token, or observation admin token is stored in repository browser JavaScript.

## Future features

Ranking is a downstream view over the normalized player store. Initial ranking dimensions can include hitter AVG, OBP, OPS, HR, RBI, BB%, K%, and pitcher ERA, WHIP, K/9, BB/9. Future ranking or analysis features should reuse the same committed player model rather than add new network paths.
