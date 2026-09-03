# Taiwan MLB Tracker — Project OS State

## Status
- Project: Taiwan Baseball Tracker
- Project OS status: 🟢 GREEN — Today status fix deployed and production-verified
- Release: `MLB-2026-09-03-TODAY-V2` · verified 2026-09-03 09:41 Asia/Taipei
- Production code commit: `f3a207fe761d06d1eae52c951aa4ae246f36ea20`
- Canonical repository: `jonwang329/taiwan-mlb-tracker-`
- Locked stable baseline: `MLB-STABLE-2026-08-31-A`
- Baseline rule: production must match this file before READY TO TEST.

## Locked stable baseline — MLB-STABLE-2026-08-31-A

### Navigation / UI
- MLB / MiLB is always the default page.
- There is exactly **one** league navigation control in the DOM.
- On MLB / MiLB, that single control displays `🇯🇵 Japan →`.
- On Asia, the same control changes to `← MLB / MiLB`.
- Never render two equal-weight MLB / Japan or MLB / Asia buttons, circles, pills, cards, or overlapping controls.
- Do not rely on CSS to hide a second navigation control; the second control must not exist.

### Today / status authority
- One authoritative render path owns Today game status and results.
- `today-stat-line.js` is the one formatter for every Today row/card repaint path.
- Live hitter output is result-first and preserves K and other events: `H-AB · PA · BB · K · HBP · HR · RBI · SB · CS · LIVE` (zero-value events omitted).
- A player must never simultaneously show a pending/confirmation message and already-updated game results for the same game.
- If game results are available, show the results as the authoritative state.
- Global refresh/status text may show a neutral last-update timestamp only; it must not duplicate per-player confirmation messaging.
- Do not clear or partially repaint the dashboard just to show checking/confirmation state.

### Version control
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
