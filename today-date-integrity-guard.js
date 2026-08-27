(() => {
  const CACHE_KEY = 'taiwan-mlb-tracker:last-good:v2';

  function sanitize(snapshot) {
    if (!snapshot || !Array.isArray(snapshot.results)) return snapshot;
    for (const result of snapshot.results) {
      if (!result || !result.today) continue;
      // A gameLog entry is historical data, not authoritative proof that the
      // game belongs to Taiwan "today". The snapshot builder previously
      // relabelled a US game-log date as the current Taiwan date, which could
      // make yesterday's stats and gamePk appear as today's game.
      if (result.today.source === 'gameLog') result.today = null;
    }
    return snapshot;
  }

  const central = sanitize(window.CENTRAL_DASHBOARD_SNAPSHOT);
  if (central) window.CENTRAL_DASHBOARD_SNAPSHOT = central;

  // snapshot-bootstrap runs earlier and seeds localStorage, so sanitize that
  // copy too before app.js restores it.
  try {
    const cached = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
    if (cached) localStorage.setItem(CACHE_KEY, JSON.stringify(sanitize(cached)));
  } catch (error) {
    console.warn('Could not sanitize cached Today data', error);
  }
})();
