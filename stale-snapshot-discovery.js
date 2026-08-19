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

  function taipeiToday() {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit'
    }).format(new Date());
  }

  function formatTime(ts) {
    return new Intl.DateTimeFormat('zh-TW', {
      timeZone: 'Asia/Taipei', hour: '2-digit', minute: '2-digit', hour12: false
    }).format(new Date(ts));
  }

  function needsDiscovery(result) {
    const today = result?.today;
    if (!today?.game?.gamePk) return true;
    return String(today.date || '') !== taipeiToday();
  }

  async function discoverTodayGames({ force = false } = {}) {
    if (running || document.hidden || typeof window.fetchOfficialToday !== 'function') return { found: 0, checked: 0 };
    running = true;
    let found = 0;
    let checked = 0;
    try {
      const pairs = currentPairs();
      const targets = force ? pairs : pairs.filter(({ result }) => needsDiscovery(result));
      if (!targets.length) return { found, checked };

      for (const { player, result } of targets) {
        const teamIds = teamIdsFor(result);
        if (!teamIds.length) continue;
        checked += 1;
        try {
          const today = await window.fetchOfficialToday(player, teamIds, levelFor(result));
          if (today?.game?.gamePk) {
            result.today = today;
            found += 1;
          } else if (force && String(result?.today?.date || '') !== taipeiToday()) {
            result.today = null;
          }
        } catch (error) {
          console.warn('Today game discovery failed', player.name, error);
        }
      }

      if (found > 0 && typeof paint === 'function' && typeof lastResults !== 'undefined' && Array.isArray(lastResults)) {
        const now = Date.now();
        paint(lastResults, `MLB 官方資料已強制更新 · ${formatTime(now)}`);
        if (typeof persistSnapshot === 'function') persistSnapshot(lastResults, now);
      }

      window.dispatchEvent(new CustomEvent('tracker:today-game-discovery', { detail: { found, checked, force } }));
      return { found, checked };
    } finally {
      running = false;
    }
  }

  window.forceTodayGameDiscovery = () => discoverTodayGames({ force: true });

  const refreshButton = document.querySelector('#refresh-btn');
  refreshButton?.addEventListener('click', () => {
    discoverTodayGames({ force: true }).catch(error => console.warn('Manual today-game discovery failed', error));
  });

  discoverTodayGames();
  timer = setInterval(discoverTodayGames, DISCOVERY_MS);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) discoverTodayGames(); });
  window.addEventListener('pagehide', () => clearInterval(timer), { once: true });
})();
