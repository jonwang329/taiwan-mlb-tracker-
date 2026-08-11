# Taiwan MLB Tracker 🇹🇼⚾

A mobile-friendly tracker for Taiwanese baseball players using MLB / MiLB Stats API data, with LINE notifications and a shared observation list.

## Shared observation list

`tracked-players.json` is the single tracked-player source for both the website and LINE reports.

The website's **Manage** control searches MLB players and prepares an Add/Remove approval request on GitHub. Only requests opened by the repository owner are accepted by the `Observation list manager` workflow. The workflow validates the MLB player ID, updates `tracked-players.json`, commits the change to `main`, and closes the request. No GitHub or LINE credential is exposed in browser JavaScript.

## LINE notifications

The **LINE daily tracker updates** workflow is the only LINE sender. It runs in production at these Taiwan times:

- 07:00 Asia/Taipei → `0 23 * * *` UTC (previous UTC day)
- 08:00 Asia/Taipei → `0 0 * * *` UTC
- 09:00 Asia/Taipei → `0 1 * * *` UTC
- 12:00 Asia/Taipei → `0 4 * * *` UTC

The 07:00 run sends a morning summary. The 08:00 and 09:00 runs send only when tracked data changes. The noon run sends the final daily summary.

Manual troubleshooting is available from **Actions → LINE daily tracker updates → Run workflow**. Manual runs use the same production sender and data path, but every manual message begins with `🧪 TEST — Taiwan MLB Tracker`, has no cron schedule, and does not overwrite the production comparison snapshot.

The old standalone test workflow and old primitive LINE test sender were removed.

LINE credentials remain in GitHub Actions secrets (`LINE_CHANNEL_ACCESS_TOKEN` and `LINE_DESTINATION_ID`, with legacy `LINE_USER_ID` support). They are never stored in the repository or browser.

## Report content

LINE reports include game state (`FINAL`, `LIVE / IN PROGRESS`, `NOT STARTED`, or `NO GAME`), appearance/performance, season statistics, player/roster status, recent transaction information, and a short observation.
