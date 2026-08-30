# Taiwan MLB Tracker — Project OS State

## Status
- Project: Taiwan Baseball Tracker
- Project OS status: 🟡 YELLOW — Japan-page / Today-event delta in validation
- Canonical repository: `jonwang329/taiwan-mlb-tracker-`
- Golden baseline: existing MLB/MiLB production behavior prior to Japan-page split
- Current delta version: `2026-08-31 08:28 JST — Japan page + Today event exposure`

## Protected MLB Stable Core
- Existing MLB / MiLB Today view and Quick Scoreboard
- Observation list / Manage flow
- Cloudflare-backed observation state
- MLB/MiLB refresh logic and freshness protections
- LINE production schedule and notification flow
- League comparison / benchmark behavior
- Mobile / tablet / desktop shared product baseline

## Approved Delta — 2026-08-31
Purpose: keep the MLB/MiLB experience clean while giving Japan players a parallel page with the same product language.

### Today Game / Quick Scoreboard
- Hitters must expose meaningful same-day events directly in `今日戰況`.
- Existing H/AB, HR and RBI remain visible.
- Add BB and K when present; do not hide a 2K day behind season-only statistics.
- `2+ K` with no stronger positive event becomes a restrained warning highlight, not a harsh red failure label.
- Positive hitter signals such as HR, multi-hit, multiple walks or steals remain visually stronger but controlled.
- Pitcher Today format remains IP / H / ER / BB / K.

### League-page architecture
- Default page remains `MLB / MiLB`.
- Top switch: `MLB / MiLB | Japan`.
- Japan players do not render inside the MLB Today, Quick Scoreboard, or Player Details sections.
- Japan page uses the same clean white product language with only a subtle Japan accent.
- Japan page uses `Asia/Tokyo` / JST display; MLB/MiLB page uses `Asia/Taipei`.
- The page switch must not modify MLB/MiLB refresh, observation-list, league-benchmark, or LINE logic.

### Japan tracked players
1. 古林睿煬 — 北海道日本火腿鬥士 — pitcher
2. 孫易磊 — 北海道日本火腿鬥士 — pitcher
3. 林安可 — 埼玉西武獅 — outfielder
4. 張峻瑋 — 福岡軟銀鷹 — pitcher
5. 陳睦衡 — 歐力士猛牛 — pitcher
6. 徐若熙 — 福岡軟銀鷹 — pitcher
7. 王彥程 — 東北樂天金鷲 — pitcher, roster No. 017

### Wang Yen-Cheng / 王彥程 rule
- 王彥程 belongs on the Japan page, not the MLB/MiLB page.
- NPB official roster is authoritative for Japan identity/status.
- Do not invent NPB first-team statistics. If the official page shows no NPB first-team experience, display roster/status information instead.

## Data strategy
The Japan page currently uses a curated official NPB snapshot. It remains isolated from the MLB/MiLB Single Source of Truth and does not introduce a browser-side scraping dependency into the stable MLB production path.

Future Japan automation may be added only after validating:
- official source reliability
- first-team / farm coverage
- update timing
- stable identifiers
- no regression risk to MLB data paths

## Cross-device requirement
Both pages are part of the same product baseline across iPhone, iPad/tablet, and desktop. Layout may respond to screen size; data/content/meaning must remain consistent.

## Acceptance checks
- MLB/MiLB is the default page and existing core sections still render
- Japan switch hides MLB sections rather than mixing two formats
- Japan switch shows seven Japan players including 王彥程
- Japan date/time uses JST; MLB date/time uses Taiwan time
- Hitter Today line exposes BB / K when present
- A 2K hitter day can appear as a restrained Today warning highlight
- No regression to refresh, Manage, observation list, league benchmarks, or LINE production flow
- Mobile view keeps the switch and Japan cards readable
- Production site must be verified before READY TO TEST

## Next safe action
Run branch validation, review the diff, merge only after checks pass, then verify the deployed public site. Do not announce READY TO TEST until production verification passes.
