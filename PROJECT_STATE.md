# Taiwan MLB Tracker — Project OS State

## Status
- Project: Taiwan Baseball Tracker
- Project OS status: 🟡 YELLOW — isolated KBO / critical-MLB delta in validation
- Canonical repository: `jonwang329/taiwan-mlb-tracker-`
- Golden baseline: current production MLB/MiLB + Asia page
- Current delta version: `2026-08-31 — KBO refresh + critical MLB comparison`

## Protected MLB Stable Core
These paths are protected and must not be redesigned for this delta:
- MLB / MiLB Today view and Quick Scoreboard
- `app.js` refresh / data collection core
- Observation list / Manage flow
- Cloudflare-backed observation state
- LINE production schedule and notification flow
- Existing league benchmark generation and same-league Quick Scoreboard comparison
- Mobile / tablet / desktop product baseline

## Approved Delta — 2026-08-31
This delta must remain small, isolated and easy to roll back.

### Asia / KBO
- Keep one `Asia` page. Do not add a separate Korea tab.
- Japan remains six tracked players and keeps the existing NPB presentation.
- Korea currently contains 王彥程 only.
- 王彥程 official identity: 韓華鷹 Hanwha Eagles, KBO first team, No.19.
- Official KBO 2026 snapshot as of 2026-08-31: 23 G, 10-5, ERA 3.52, 120 1/3 IP, 95 K, WHIP 1.45, 7 QS.
- KBO official page also lists ERA rank No.4 at this snapshot.
- Latest official game shown: 08/18 vs KIA, 5 IP, 7 H, 3 ER, 2 BB, 3 K.
- KBO remains a curated official snapshot in `npb-update.js`. Do not add a browser scraper or couple it to MLB refresh logic in this delta.

### Critical MLB comparison
Only two MLB players receive the extra `MLB 全聯盟比較` block:
1. 李灝宇 Hao-Yu Lee — MLB hitter
2. 鄧愷威 Kai-Wei Teng — MLB pitcher

The comparison reads the existing daily MLB league benchmark cache and combines AL + NL into a simple MLB-wide reference. It does not create a new data pipeline.

Lee metrics:
- AVG
- K%
- BB%
- BB/K

Teng metrics:
- ERA
- WHIP
- K%
- BB%

The signed percentage is a relative gap versus MLB-wide average, not a percentile or ranking. Better/worse direction is metric-aware.

### Refresh status consistency
- Do not change `app.js` or the refresh engine in this delta.
- Keep the last-good player data visible during confirmation.
- `refresh-status-consistency.js` only clarifies the status line after schedule confirmation: schedule confirmation is not the same as every player stat changing.
- Never clear or partially repaint the dashboard just to show a checking state.

## Project OS guardrail
For this delta:
- No new Korea page
- No new KBO browser scraper
- No modification to MLB core data collection
- No modification to Cloudflare / LINE / watchlist logic
- New behavior lives in isolated assets and can be removed without touching stable core

## Acceptance checks
- MLB/MiLB remains the default page
- Asia page still shows Japan and Korea in one view
- 王彥程 shows Hanwha No.19 and the 2026-08-31 KBO snapshot
- Japan cards remain unchanged in structure
- 李灝宇 card shows MLB-wide AVG / K% / BB% / BB-K comparison
- 鄧愷威 card shows MLB-wide ERA / WHIP / K% / BB% comparison
- No other player card gets the critical MLB comparison block
- Refresh confirmation wording does not imply that unchanged player data is newly refreshed
- Existing Today, Manage, observation list, league benchmarks, Cloudflare and LINE behavior still passes production smoke
- Production site must be verified before READY TO TEST

## Next safe action
Run CI, review the isolated diff, merge only after validation succeeds, then wait for GitHub Pages and production smoke. Do not announce READY TO TEST until the deployed public site passes.
