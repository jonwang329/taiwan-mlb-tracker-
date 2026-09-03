# LINE-only fix — 2026-08-17

This branch intentionally does not modify the web dashboard.

## Data path

MLB/MiLB official data -> canonical dashboard snapshot -> LINE notifier.

The LINE notifier must not independently rediscover teams, schedules, games, or player appearances.

## Failure behavior

If the canonical snapshot is not fresh, LINE shows STALE / WAITING FOR MLB and preserves the last verified MLB state rather than claiming that nobody played.

## Sender behavior

The scheduled notifier remains the single `taiwan-mlb-line-notifier` Worker with Taiwan slots at 07:00, 08:00, 09:00, and 12:00.
