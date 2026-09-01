# Taiwan MLB Tracker 🇹🇼⚾

A mobile-friendly tracker for Taiwanese baseball players using MLB / MiLB Stats API data, with LINE notifications and a shared Cloudflare KV observation list.

## Project OS — mandatory version control gate

This rule is mandatory before every user test and applies to every release, hotfix, data refresh, and UI change.

- Every testable release must expose or record **Version + Date + exact Time + commit SHA**.
- Keep one explicit **LOCKED STABLE BASELINE**. Never silently replace it with an older, alternate, or partially refreshed UI.
- Before any change, identify the current production version and compare it with the locked baseline.
- After any change, run regression checks for previously fixed critical behavior, not only the new delta.
- Data/snapshot refresh jobs must not alter UI structure, navigation, or stable product behavior unless the change explicitly requires it.
- If production differs from source, first determine whether the cause is an old deployment, alternate UI path, cache, branch mismatch, snapshot overwrite, or mixed assets. Do not ask the user to diagnose this.
- **READY TO TEST is forbidden** until production itself has been opened and verified against the expected version and locked baseline.
- If any prior fixed behavior regresses, status is **FAIL / NOT READY TO TEST**.
- When returning to the project in a later session, start from the latest locked stable baseline, never from a guessed or merely recent commit.

## Production status

2026-08-31 08:59 JST Japan-switch UI refinement:

- MLB / MiLB remains the dominant default experience; the prior equal-weight MLB / Asia pills are removed.
- The MLB page now shows only a small secondary `🇯🇵 Japan →` switch.
- The Asia page shows a small `← MLB / MiLB` return control in the same location.
- This is UI-only. `npb-update.js`, MLB/MiLB data collection, refresh logic, Cloudflare, LINE, watchlist and Asia player data are unchanged.

## Stability guardrails

### Locked today-status authority
- `app.js` owns the dashboard model and rendering; `gameday-universe-hotfix.js` is the only live Today Resolver loaded by production.
- The resolver matches every tracked player by immutable MLB person ID. It must not contain player-name exceptions or a fixed priority roster.
- One daily MLB/MiLB schedule scan is shared across all tracked IDs. Published MLB lineups are authoritative even while the game is still `Preview`.
- Refresh runs the same resolver immediately; profile, season, and history refreshes continue in the background and may not erase a confirmed scheduled/live state.
- Production must load `app.js` before the Today Resolver so the resolver always writes into the active dashboard model; an empty model falls back to the central snapshot.
- Legacy Today writers (`official-today-hotfix.js`, `live-refresh.js`, `gameday-presence-hotfix.js`, `single-source-status-hotfix.js`) remain in source history but must not be loaded by `index.html`.

- Production must have exactly one dominant MLB / MiLB entry point. Do not render two equal-weight MLB / Japan (or MLB / Asia) circles, pills, cards, or primary buttons.
- A player row/card must never simultaneously show a pending/confirmation state and already-updated game results for the same game. Rendering must resolve to one authoritative state only.
- Data refresh/snapshot jobs may update data artifacts only; they must not rewrite UI hierarchy or restore superseded navigation.
- Before `READY TO TEST`, verify production itself (not only source code) for: current release identity, MLB/Japan hierarchy, and status/result consistency.
- Any production mismatch against these guardrails is a release FAIL and must not be sent to the user for testing.

2026-08-31 KBO refresh + critical MLB comparison:

- Project OS guardrail: this is an isolated delta. `app.js`, MLB/MiLB collection, Cloudflare, LINE and observation-list logic are not redesigned.
- Asia remains one page with Japan + Korea. No separate Korea tab.
- 王彥程 is shown as 韓華鷹 Hanwha Eagles No.19 using the official KBO snapshot: 23 G, 10-5, ERA 3.52, 120 1/3 IP, 95 K, WHIP 1.45, 7 QS; KBO official summary currently lists ERA rank No.4.
- Latest official game shown on his card: 08/18 vs KIA — 5 IP, 7 H, 3 ER, 2 BB, 3 K.
- Korea remains a curated official KBO snapshot in the isolated Asia module. No browser-side KBO scraper is added in this change.
- Only 李灝宇 (701678) and 鄧愷威 (678906) receive a new `MLB 全聯盟比較` section in their Player Cards.
- 李灝宇 comparison: AVG / K% / BB% / BB-K. 鄧愷威 comparison: ERA / WHIP / K% / BB%.
- The MLB-wide reference is derived from the existing AL + NL daily benchmark cache; it is not a new data pipeline and does not affect other players.
- `refresh-status-consistency.js` clarifies that official schedule confirmation can coexist with the current last-good player snapshot. It does not repaint the dashboard or alter the refresh engine.

2026-08-31 Asia-page update:

- Replaces the Japan-only tab with a single `Asia` tab. No separate Korea tab is added.
- MLB / MiLB remains the default page.
- The Asia page contains two sections in one clean view: Japan (NPB / Farm) and Korea (KBO).
- Japan and Korea both use UTC+9, so the Asia page uses a shared UTC+9 clock label while preserving the correct official source per country.
- Japan tracking remains six players: 古林睿煬、孫易磊、林安可、張峻瑋、陳睦衡、徐若熙.
- 王彥程 moves out of Japan and into Korea. KBO official data identifies him as 韓華鷹 Hanwha Eagles No.19, not KIA Tigers.
- The Korea section is intentionally source-isolated from the MLB/MiLB stable core.

2026-08-31 Japan-page + Today-event update (historical baseline, superseded by the Asia-page structure above):

- Version marker: `2026-08-31 08:28 JST`.
- MLB / MiLB remains the default page.
- Hitter `今日戰況` exposes BB and K in addition to H/AB, HR and RBI. A 2+ K day with no stronger positive event can appear as a restrained amber Today warning highlight.
- The Today ticker also includes hitter strikeouts.
- Asia/Japan presentation remains isolated from MLB/MiLB refresh, observation-list, league-benchmark, Cloudflare state, and LINE production paths.

2026-08-30 refresh-hang fix:

- Fixed a mobile freeze caused by `refresh-terminal-state-fix.js`: its `MutationObserver` watched `#last-update`, called `finish()`, then `finish()` repainted the dashboard via `paint()`, which wrote `#last-update` again and retriggered the observer indefinitely.
- Observer-driven completion now resets button state without repainting. Normal refresh events may still repaint the last-good dashboard once.
- The refresh helper asset is cache-busted in `index.html` so iPhone/Safari does not keep the looping version.

2026-08-30 league-context update:

- Quick Scoreboard keeps Today + season snapshot compact: hitters show AVG / OPS / K% / BB%; pitchers show ERA / WHIP / K% / BB%.
- League comparison appears only under the primary AVG/ERA number. The group header explains `LG% = VS LEAGUE` once; each player row then shows only a compact signed percentage such as `+12%`, `-44%`, or `—`.
- Positive means better performance versus the player's same-league environment; negative means worse. For ERA, lower is better, so the sign is performance-aware rather than raw numeric direction.
- `data/league-benchmarks.js` is generated by the `Update league benchmarks` GitHub Action from official MLB/MiLB Stats API team-season aggregates. It runs once daily and is cached; the browser never recalculates the whole league on page load.

2026-08-29 stability recovery:

- Keep the last-good dashboard visible while background reconciliation runs; the UI must not become an all-page indefinite "checking" state.
- Cloudflare is the only production LINE scheduler. One Cloudflare cron covers 07:00, 08:00, 09:00 and 12:00 Asia/Taipei. GitHub `LINE daily tracker updates` is manual fallback/testing only and must not have a `schedule:` trigger.
- Required workflow after changes: UNDERSTAND → CHECK → FIX → TEST → DEPLOY → TEST AGAIN → README / AGENTS verification → traffic-light status → READY TO TEST.

## Shared observation list

The production source of truth is the Cloudflare Workers KV namespace `taiwan-mlb-observation-list`.

A small Cloudflare Worker (`cloudflare/observation-worker.js`) exposes a public read-only `/players` endpoint. Add/remove mutations require the Worker `ADMIN_TOKEN`; the token is never exposed in browser JavaScript. The dashboard and LINE production worker both read the same KV-backed observation list.

During initial setup only, `tracked-players.json` remains as a safe fallback and as the seed list used when the KV namespace has no `players` entry yet.

## LINE notifications

**Cloudflare is the sole production LINE scheduler.** Production notification times are:

- 07:00 Asia/Taipei
- 08:00 Asia/Taipei
- 09:00 Asia/Taipei
- 12:00 Asia/Taipei

GitHub Actions **LINE daily tracker updates** is manual fallback/testing only.
