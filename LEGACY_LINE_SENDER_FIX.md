# Legacy LINE sender fix — 2026-08-17

Root cause: `taiwan-mlb-observation-list` historically owned the 07:00/08:00/09:00/12:00 cron and still contains the old plain-text LINE sender. A later dedicated Flex notifier was added, but the observation Worker could still receive the legacy scheduled event. This produced the old `今日出賽：0 位` plain-text message even while the dashboard had active players.

Fix:
- deploy `observation-worker-safe.js`, whose scheduled handler is a no-op;
- explicitly set the observation Worker's cron list to `[]`;
- keep scheduled delivery only on `taiwan-mlb-line-notifier`, which uses the Flex notifier.
