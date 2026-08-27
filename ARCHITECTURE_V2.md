# Taiwan MLB Tracker — Architecture V2

## Goal
Keep the app fast, simple, and extensible while preserving one authoritative baseball truth.

## Non-negotiable principles
1. MLB / MiLB official APIs are the only authority for baseball facts: schedule, game status, box score, season stats, roster/team identity.
2. Cloudflare is not a baseball-data authority. It may store the observation list, notification state, or shared configuration only.
3. Snapshot is last-good display data only. It is never allowed to overrule fresh official MLB / MiLB data.
4. Refresh never blanks the screen. Existing last-good data remains visible until fresh official data is ready.
5. One refresh owner only. No independent hotfix script may repaint game status or own refresh lifecycle.
6. New features (Ranking, Insights, Notifications) consume the normalized player model and must not fetch/reconcile official game truth independently.

## Data flow

Browser open
→ render last-good snapshot immediately
→ load observation list
→ background official refresh
→ normalize official MLB/MiLB response
→ atomically replace in-memory player model
→ repaint UI
→ save last-good cache

Manual Refresh
→ keep current UI visible
→ query official MLB/MiLB truth immediately
→ replace model only after usable result is available
→ show success/failure timestamp

Cloudflare
→ observation list / shared config / notification state only
→ never sits between the browser and baseball truth for game statistics

## Modules

### core/player-store
Owns one normalized model for each tracked player.

### data/mlb-client
Only code allowed to fetch MLB/MiLB baseball data.
Responsibilities: current team, schedule, box score/live feed, season stats, recent games.

### data/observation-client
Loads tracked player IDs/names from Cloudflare with repository fallback.
No stats logic.

### core/refresh-controller
Single refresh state machine:
IDLE → REFRESHING → SUCCESS | PARTIAL | FAILED
It does not blank the UI.

### ui/dashboard
Pure renderer. Reads player-store only.

### features/ranking
Pure computation from player-store. No network calls.
Examples: AVG, OPS, HR, K%, BB%, ERA, WHIP, K/9, strike rate when source fields exist.

### features/insights
Pure computation from player-store.

## Refresh strategy for speed
1. Render last-good immediately.
2. Resolve tracked players/current team cheaply.
3. Check today schedule by known/current team first.
4. Fetch boxscore/live feed only for games relevant to tracked players.
5. Refresh season/recent-game data separately and less aggressively than live game state.
6. Use broader discovery only as fallback when player/team identity is uncertain.

## Ranking contract
Ranking must receive an array of normalized player objects and return sorted rows. It may not know about Cloudflare, snapshot files, DOM, or refresh state.

## Migration rule
Do not add another hotfix layer. Any bug in refresh must be fixed in the owning V2 module and covered by tests before merging to main.

## Merge gate
- Main remains untouched during V2 work.
- All existing applicable tests updated to the V2 contract.
- New tests cover: visible-first startup, refresh failure keeps last-good, Cloudflare cannot override stats, one refresh owner, ranking is network-free.
- Merge only after green validation and manual mobile smoke test.
