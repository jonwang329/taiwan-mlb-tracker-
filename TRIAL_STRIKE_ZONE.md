# Strike Zone Trial

This branch restores the existing MLB/AAA hitter pitch-by-pitch module behind a collapsed-by-default control so the main dashboard remains compact.

Guardrails:
- No changes to app.js, watchlist state, LINE, observation KV, or core dashboard data flow.
- Pitch detail is hidden until the user opens it.
- Loading/error states remain collapsed and cannot stretch player cards.
- Existing Smart Insight remains enabled.
