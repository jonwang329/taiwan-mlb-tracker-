(() => {
  const DISCOVERY_MS = 2 * 60 * 1000;
  let timer = null;
  let running = false;

  function currentPairs() {
    if (typeof players !== 'undefined' && typeof lastResults !== 'undefined' && Array.isArray(players) && Array.isArray(lastResults)) {
      return players.map((player, index) => ({ player, result: lastResults[index] })).filter(({ result }) => result);
    }
    const snapshot = window.CENTRAL_DASHBOARD_SNAPSHOT;
    if (!snapshot || !Array.isArray(snapshot.players) || !Array.isArray(snapshot.results)) return [];
    return snapshot.players.map((player, index) => ({ player, result: snapshot.results[index] })).filter(({ result }) => result);
  }

  function teamIdsFor(result) {
    return [...new Set([
      result?.today?.team?.id,
      result?.latest?.team?.id,
      ...(Array.isArray(result?.games) ? result.games.slice(0, 8).map(game => game?.team?.id) : [])
    ].map(Number).filter(Boolean))].slice(0, 8);
  }

  function levelFor(result) {
    return result?.today?.level || result?.latest?.level || result?.games?.[0]?.level || '—';
  }

  function needsDiscovery(result) {
    const today = result?.today;
    if (!today?.game?.gamePk) return true;
    const gameDate = String(today.date || '');
    const now = new Date();
    const taipei = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit'
    }).format(now);
    return gameDate !== taipei;
  }

  async function discoverTodayGames() {
    if (running || document.hidden || typeof window.fetchOfficialToday !== 'function') return;
    running = true;
    try {
      const pairs = currentPairs();
      const targets = pairs.filter(({ result }) => needsDiscovery(result));
      if (!targets.length) return;

      for (const { player, result } of targets) {
        const teamIds = teamIdsFor(result);
        if (!teamIds.length) continue;
        try {
          const today = await window.fetchOfficialToday(player, teamIds, levelFor(result));
          if (today?.game?.gamePk) result.today = today;
        } catch (error) {
          console.warn('Today game discovery failed', player.name, error);
        }
      }

      window.dispatchEvent(new CustomEvent('tracker:today-game-discovery'));
    } finally {
      running = false;
    }
  }

  discoverTodayGames();
  timer = setInterval(discoverTodayGames, DISCOVERY_MS);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) discoverTodayGames(); });
  window.addEventListener('pagehide', () => clearInterval(timer), { once: true });
})();
