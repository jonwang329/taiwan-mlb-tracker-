# Taiwan MLB Tracker — Project OS State

## Status
- Project: Taiwan MLB Tracker
- Project OS status: 🟡 YELLOW — NPB section committed; production verification pending
- Canonical repository: `jonwang329/taiwan-mlb-tracker-`
- Golden baseline: existing MLB/MiLB production behavior prior to NPB addition
- Current delta: lightweight NPB section on the same site

## Protected MLB Stable Core
- Existing MLB / MiLB Today view and Quick Scoreboard
- Observation list / Manage flow
- Cloudflare-backed observation state
- MLB/MiLB refresh logic and freshness protections
- LINE production schedule and notification flow
- League comparison / benchmark behavior
- Mobile / tablet / desktop shared product baseline

## NPB Delta — 2026-08-30
Purpose: add a simple Japan-baseball update without duplicating the full MLB product.

### Tracked players
1. 古林睿煬 — 北海道日本火腿鬥士 — pitcher
2. 孫易磊 — 北海道日本火腿鬥士 — pitcher
3. 林安可 — 埼玉西武獅 — outfielder
4. 張峻瑋 — 福岡軟銀鷹 — pitcher
5. 陳睦衡 — 歐力士猛牛 — pitcher
6. 徐若熙 — 福岡軟銀鷹 — pitcher

### V1 behavior
- Same website as Taiwan MLB Tracker
- One lightweight `NPB UPDATE` section
- Six player cards only
- Show team, level/status, four key season numbers, and one short trend note
- Official NPB sources only for the initial snapshot
- NPB section must not modify MLB refresh, LINE, observation-list, or data-source logic
- No separate NPB website
- No complex dashboard, charts, or player-management flow in V1

### Data strategy
Initial V1 uses a manually curated NPB official snapshot rather than introducing an unverified scraping/API dependency into the stable MLB production path.

Future automation may be added only after validating:
- official source reliability
- one-gun / farm coverage
- update timing
- stable identifiers
- no regression risk to MLB data paths

## Cross-device requirement
NPB is part of the same product baseline across iPhone, iPad/tablet, and desktop. Layout may respond to screen size; data/content/meaning must remain consistent.

## Acceptance checks
- Existing MLB sections remain present and unchanged in intent
- NPB section renders six players
- NPB assets are isolated (`npb-update.css`, `npb-update.js`)
- Mobile view stacks cards cleanly
- Desktop/tablet use responsive grid without separate product logic
- Footer identifies NPB official source
- Production site must be verified before READY TO TEST

## Next safe action
Verify the deployed public site and confirm both MLB regression and NPB rendering. Do not announce READY TO TEST until production verification passes.
