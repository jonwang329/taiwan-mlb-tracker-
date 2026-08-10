# Taiwan MLB Tracker 🇹🇼⚾

A beginner-friendly vibe coding project that tracks Taiwanese baseball players in MLB using official MLB data.

## Project goals

1. Show Taiwanese players and their current MLB status.
2. Display daily game performance and season statistics.
3. Build a mobile-friendly dashboard.
4. Use official MLB data/API where possible.
5. Send LINE notifications for tracker updates.

## Build approach

This project is intentionally built step by step with AI-assisted vibe coding. The first milestone is a simple working web dashboard; automation and LINE integration come later.

## Send a test LINE notification

The **Test LINE notification** GitHub Actions workflow sends one test push message
without storing credentials in the repository.

1. Add the Messaging API channel as a friend in LINE.
2. In the channel's LINE Developers console, find your user ID. It begins with `U`
   and is different from your LINE display name or custom LINE ID.
3. Add that value to the GitHub repository as an Actions secret named
   `LINE_USER_ID`. Keep the existing `LINE_CHANNEL_ACCESS_TOKEN` secret.
4. Open **Actions → Test LINE notification → Run workflow**.

Both values are read only from GitHub Actions secrets. The workflow stops with a
clear error if either secret is missing, and the test script never prints either
secret. The recipient must have added the channel as a friend (and not blocked it)
for the Messaging API push to be delivered.

To validate the script locally without sending a message, provide dummy values and
use dry-run mode:

```bash
LINE_CHANNEL_ACCESS_TOKEN=dummy LINE_USER_ID=Udummy \
  node scripts/send-line-test.mjs --dry-run
```

## Automatic LINE tracker updates

The **LINE daily tracker updates** workflow connects the same tracked player list
to live MLB Stats API data. It runs every day at 07:00, 08:00, 09:00, and 12:00
in `Asia/Taipei` (the workflow cron expressions are the corresponding UTC times).

- The three morning checks compare a cached snapshot and send only when a game,
  season line, roster status, team, or transaction has changed. A first run saves
  a baseline without creating a false "update" notification.
- The noon run always sends every player's playing status, game result and level,
  batting/pitching line, season statistics, latest transaction/status, and a short
  analysis. Because the run happens around midnight in the U.S., the report labels
  the applicable official game date (America/New_York) separately from its Taiwan
  delivery date.
- The snapshot is saved only after a successful data fetch and LINE operation, so
  a temporary API or delivery failure is retried rather than silently accepted.

The workflow uses the existing `LINE_CHANNEL_ACCESS_TOKEN` and `LINE_USER_ID`
Actions secrets; no credential is stored in the source. You can also run either
mode manually from the Actions page.
