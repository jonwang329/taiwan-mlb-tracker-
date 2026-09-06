# Taiwan MLB Tracker — Project OS State

## Status
- Project: Taiwan Baseball Tracker
- Project OS status: 🟢 GREEN — USER TESTED GOOD / FIXED / CLOSED
- Release: `MLB-STABLE-2026-09-06-A` · locked 2026-09-06 10:48 Asia/Taipei
- Stable source commit before lock record: `b2d25de43183e970b0e5177dc5cbe3a590ed9c34`
- Canonical repository: `jonwang329/taiwan-mlb-tracker-`
- Locked stable baseline: `MLB-STABLE-2026-09-06-A`
- User verification: re-test confirmed the intermittent horizontal-line issue was no longer visible.
- Close rule: this version is now the rollback baseline. Do not replace or redesign it during routine data/snapshot refreshes.

## 2026-09-06 Stable lock — MUST PRESERVE
- Lim Chang-yong (`林昌勇` / `林昶勇`) must not appear in MLB/KBO/snapshot rosters.
- 李灝宇 Today/update rendering must use one authoritative writer/refresh path; no competing repaint path may reintroduce intermittent blank/horizontal-line state.
- Startup refresh and manual refresh must route through the same dashboard model.
- Data/snapshot refresh jobs may update data only; they must not alter protected UI/status behavior.
- If a future change regresses this behavior, roll back to `MLB-STABLE-2026-09-06-A` before further work.

## Navigation / UI
- MLB / MiLB is always the default page.
- There is exactly **one** league navigation control in the DOM.
- On MLB / MiLB, that single control displays `🇯🇵 Japan →`.
- On Asia, the same control changes to `← MLB / MiLB`.
- Never render two equal-weight MLB / Japan or MLB / Asia buttons, circles, pills, cards, or overlapping controls.
- Do not rely on CSS to hide a second navigation control; the second control must not exist.

## Today / status authority
- One authoritative render path owns Today game status and results.
- `today-stat-line.js` is the one formatter for every Today row/card repaint path.
- Live hitter output is result-first and preserves K and other events: `H-AB · PA · BB · K · HBP · HR · RBI · SB · CS · LIVE` (zero-value events omitted).
- A player must never simultaneously show a pending/confirmation message and already-updated game results for the same game.
- If game results are available, show the results as the authoritative state.
- Global refresh/status text may show a neutral last-update timestamp only; it must not duplicate per-player confirmation messaging.
- Do not clear or partially repaint the dashboard just to show checking/confirmation state.

## Version control
- Every testable production release must identify Version + Date + exact Time + commit SHA.
- Before every user test, verify the deployed production version against this locked baseline.
- Data/snapshot refresh jobs may update data only and must not alter this UI baseline.
- If production differs from source, determine whether the cause is deployment lag, alternate UI path, cache, branch mismatch, mixed assets, or snapshot overwrite before asking the user to test.
- READY TO TEST is forbidden until production itself is verified against the locked baseline.

## Protected MLB Stable Core
These paths/behaviors remain protected unless an explicit change requires otherwise:
- MLB / MiLB Today view and Quick Scoreboard
- `app.js` MLB/MiLB data collection core
- Observation list / Manage flow
- Cloudflare-backed observation state
- LINE production schedule and notification flow
- League benchmark generation and same-league Quick Scoreboard comparison
- Mobile / tablet / desktop product baseline

## Asia / KBO isolated module
- Keep one Asia page. Do not add a separate Korea tab.
- Japan remains six tracked players and keeps the existing NPB presentation.
- Korea currently contains 王彥程 only.
- 王彥程 official identity: 韓華鷹 Hanwha Eagles, KBO first team, No.19.
- KBO remains isolated in `npb-update.js`; do not couple it to MLB refresh logic.

## Critical MLB comparison
Only two MLB players receive the extra `MLB 全聯盟比較` block:
1. 李灝宇 Hao-Yu Lee — MLB hitter
2. 鄧愷威 Kai-Wei Teng — MLB pitcher

Lee metrics: AVG / K% / BB% / BB-K.
Teng metrics: ERA / WHIP / K% / BB%.

## Mandatory regression checks before READY TO TEST
- Production version/commit matches the intended release.
- MLB / MiLB opens by default.
- Exactly one league toggle exists in the DOM.
- MLB view shows only `🇯🇵 Japan →`.
- Asia view uses the same control as `← MLB / MiLB`.
- 李灝宇 Today row/card does not show confirmation/pending text together with updated results.
- No player shows duplicate status and result authority for the same game.
- Today, Manage, observation list, league benchmarks, Cloudflare, LINE, and snapshot refresh remain functional.
- Data refresh does not change protected UI files.
- Public production site is verified after deployment, not just source/CI.

## Release gate
CHECK BASELINE → CHECK PRODUCTION VERSION → APPLY MINIMAL DELTA → REGRESSION TEST → DEPLOY → VERIFY PRODUCTION DOM/DATA → VERIFY VERSION/TIME/SHA → READY TO TEST.

## 2026-09-07 Today monotonic state root-cause fix
- Root cause: `app.js collectResults()` only protected a confirmed Today state when the fresh result had `today == null`; a later non-null but weaker scheduled/partial state could overwrite a confirmed appearance.
- Fix: Today precedence now lives in the single authoritative `app.js` model. Same-day state cannot regress from appearance to scheduled/partial, and lower-progress appearance data cannot replace higher-progress data. Equal-progress fresh data may advance LIVE to final.
- No player-name or player-ID exceptions are used. `gameday-universe-hotfix.js` is compatibility-only.
