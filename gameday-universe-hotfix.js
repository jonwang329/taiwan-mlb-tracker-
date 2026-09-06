(() => {
  const taiwanToday = () => new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(new Date());

  function appearanceStrength(today) {
    if (!today || String(today.date || '').slice(0, 10) !== taiwanToday()) return 0;
    const stat = today.stat || {};
    const onField = Number(stat.plateAppearances || 0) > 0 ||
      Number(stat.atBats || 0) > 0 || Number(stat.battersFaced || 0) > 0 ||
      Number(stat.pitchesThrown || 0) > 0 || Number(stat.inningsPitched || 0) > 0 ||
      Number(stat.runs || 0) > 0 || Number(stat.baseOnBalls || 0) > 0 ||
      Number(stat.hitByPitch || 0) > 0 || Number(stat.sacFlies || 0) > 0 ||
      Number(stat.sacBunts || 0) > 0;
    if (today.live && onField) return 5;
    if (onField || today.onGame) return 4;
    if (today.live) return 3;
    if (today.scheduled) return 2;
    return 1;
  }

  function centralById() {
    const snapshot = window.CENTRAL_DASHBOARD_SNAPSHOT;
    if (!snapshot?.players || !snapshot?.results) return new Map();
    return new Map(snapshot.players.map((player, index) => [Number(player.id), snapshot.results[index]]));
  }

  function reconcileConfirmedToday() {
    if (typeof players === 'undefined' || typeof lastResults === 'undefined' ||
        !Array.isArray(players) || !Array.isArray(lastResults) || !lastResults.length) return false;

    const central = centralById();
    let changed = false;
    players.forEach((player, index) => {
      const incoming = central.get(Number(player.id))?.today;
      const current = lastResults[index]?.today;
      if (appearanceStrength(incoming) <= appearanceStrength(current)) return;
      lastResults[index] = { ...(lastResults[index] || {}), today: structuredClone(incoming) };
      changed = true;
    });

    if (!changed) return false;
    if (typeof persistSnapshot === 'function') persistSnapshot(lastResults, Date.now());
    if (typeof paint === 'function') paint(lastResults, `MLB／MiLB Today 已同步 · ${new Intl.DateTimeFormat('zh-TW', { timeZone: 'Asia/Taipei', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date())}`);
    window.dispatchEvent(new CustomEvent('tracker:single-source-reconciled', {
      detail: { singleWriter: true, monotonicToday: true }
    }));
    return true;
  }

  async function scan({ force = false } = {}) {
    if (typeof refreshData !== 'function') return { skipped: true, reason: 'app-model-not-ready' };
    const results = await refreshData({ reason: force ? 'gameday-force' : 'gameday' });
    reconcileConfirmedToday();
    window.dispatchEvent(new CustomEvent('tracker:gameday-universe', {
      detail: { singleWriter: true, refreshed: true }
    }));
    return { singleWriter: true, refreshed: true, results };
  }

  let reconciling = false;
  window.addEventListener('tracker:players-loaded', () => {
    if (reconciling) return;
    reconciling = true;
    try { reconcileConfirmedToday(); } finally { reconciling = false; }
  });
  queueMicrotask(reconcileConfirmedToday);

  window.TaiwanMlbUniverseScan = scan;
  window.TaiwanTodayStateAuthority = { reconcileConfirmedToday, appearanceStrength };
})();
