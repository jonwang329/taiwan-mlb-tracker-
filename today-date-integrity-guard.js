(() => {
  const snapshot = window.CENTRAL_DASHBOARD_SNAPSHOT;
  if (!snapshot || !Array.isArray(snapshot.results)) return;

  // Safety rule: a gameLog entry is historical data, not authoritative proof
  // that the game belongs to Taiwan "today". The snapshot builder previously
  // relabelled a US game-log date as the current Taiwan date, which could make
  // yesterday's stats and gamePk appear as today's game.
  for (const result of snapshot.results) {
    if (!result || !result.today) continue;
    if (result.today.source === 'gameLog') {
      result.today = null;
    }
  }
})();
