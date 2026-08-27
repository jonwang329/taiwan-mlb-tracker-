# Taiwan MLB Tracker — Offseason / Player Radar Roadmap

## Product idea
Taiwan MLB Tracker should not go dark when the MLB/MiLB season ends. The product changes mode rather than becoming inactive.

### In-season mode: Game Tracker
Primary jobs:
- today appearances and live/final results
- season stats and recent games
- roster/team/level identity
- LINE daily game updates
- rankings and performance trends

### Offseason mode: Player Radar
Primary jobs:
- player transactions, signings, releases, assignments, promotions/demotions
- injury / rehab / return-to-play status
- winter league / fall league / instructional league appearances
- team prospect updates and roster protection decisions
- interviews, training updates and notable public comments
- credible team / MLB / MiLB news mentioning tracked players
- season review and year-over-year development

## Product behavior
The homepage should detect season context and change emphasis automatically:

IN_SEASON
→ Today scoreboard is primary
→ News/Radar is secondary

OFFSEASON
→ Player Radar is primary
→ Last season summary and rankings remain available
→ Today scoreboard becomes a quiet "No scheduled games" secondary module

The app must never pretend that "no game" means "nothing is happening".

## Data-source boundaries
### Baseball facts
MLB/MiLB official APIs remain the authority for:
- roster/team/level
- transactions when available
- official stats
- official schedules and game results

### News / public updates
News is a separate evidence layer. It must never overwrite official baseball facts.
Each item should store:
- player_id
- published_at
- source_name
- source_url
- headline
- short_summary
- category
- confidence / source tier

Preferred source order:
1. MLB / MiLB / team official sites
2. reputable baseball reporting
3. player / team verified social accounts
4. other sources only when clearly labelled

## Proposed modules
- `features/player-radar.js` — normalized news/update model, no game refresh ownership
- `features/season-review.js` — year-end summaries derived from player-store
- `features/ranking.js` — season and historical ranking
- `data/news-client.js` — retrieves external news only; cannot mutate official stats

## Notification behavior
In season:
- existing 07:00 / 08:00 / 09:00 / 12:00 game-oriented notifications

Offseason:
- no noisy empty daily game notifications
- digest only when there is meaningful player news
- optional weekly Taiwan-player roundup

## First offseason UI
Add a `Player Radar` section/card with:
- Latest Updates
- Transactions
- Injury / Rehab
- Winter Ball
- Interviews / Training
- Prospect / Organization News

Each tracked player card can show a small `Latest update` line even when there are no games.

## Architecture rule
Player Radar is a feature consumer. It must not become a second refresh controller and must not write to the game/player statistics truth store. It may attach evidence-linked update records to a player ID.

## Implementation order
1. Stabilize V2 refresh architecture.
2. Add Ranking UI from the existing network-free ranking engine.
3. Add season-context detector (`IN_SEASON` / `OFFSEASON`).
4. Add Player Radar data model and read-only UI using fixture data first.
5. Add source-backed news ingestion separately.
6. Replace offseason daily game notification noise with meaningful-change digest.
