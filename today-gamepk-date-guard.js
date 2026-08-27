(() => {
  const timeLogic = window.TaiwanGameTime;
  if (!timeLogic) return;

  const todayTaipei = () => timeLogic.taiwanDate(new Date());

  function currentPairs() {
    if (typeof players !== 'undefined' && typeof lastResults !== 'undefined' && Array.isArray(players) && Array.isArray(lastResults)) {
      return players.map((player, index) => ({ player, result: lastResults[index] })).filter(({ result }) => result);
    }
    const snapshot = window.CENTRAL_DASHBOARD_SNAPSHOT;
    if (!snapshot?.players || !snapshot?.results) return [];
    return snapshot.players.map((player, index) => ({ player, result: snapshot.results[index] })).filter(({ result }) => result);
  }

  function authoritativeTodayDate(today) {
    if (!today) return '';
    const stamp = today.officialTimestamp || today.gameDate || today.game?.gameDate || '';
    if (stamp) {
      const parsed = new Date(stamp);
      if (!Number.isNaN(parsed.getTime())) return timeLogic.gameTaiwanDate({ gameDate: parsed.toISOString() });
    }
    return String(today.date || '').slice(0, 10);
  }

  function clearStaleToday() {
    const expected = todayTaipei();
    let changed = false;

    for (const { result } of currentPairs()) {
      const today = result?.today;
      if (!today?.game?.gamePk) continue;
      const actual = authoritativeTodayDate(today);
      if (!actual || actual === expected) continue;

      console.warn('Discarding stale Today gamePk', today.game.gamePk, 'game date', actual, 'Taiwan today', expected);
      result.today = null;
      changed = true;
    }

    if (!changed) return false;

    // Repaint from the corrected in-memory truth so stale Gameday anchors disappear
    // immediately instead of surviving until the next full refresh.
    if (typeof paint === 'function' && typeof lastResults !== 'undefined' && Array.isArray(lastResults)) {
      paint(lastResults, `MLB／MiLB 今日賽事日期已校正 · ${new Intl.DateTimeFormat('zh-TW', { timeZone: 'Asia/Taipei', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date())}`);
    }
    if (typeof persistSnapshot === 'function' && typeof lastResults !== 'undefined' && Array.isArray(lastResults)) {
      persistSnapshot(lastResults, Date.now());
    }
    return true;
  }

  window.TaiwanTodayGamePkGuard = { clearStaleToday };
  window.addEventListener('tracker:single-source-reconciled', clearStaleToday);
  window.addEventListener('tracker:live-fast-refresh', () => setTimeout(clearStaleToday, 0));
  window.addEventListener('tracker:gameday-current-team', () => setTimeout(clearStaleToday, 0));
  window.addEventListener('tracker:gameday-universe', () => setTimeout(clearStaleToday, 0));
  document.addEventListener('visibilitychange', () => { if (!document.hidden) setTimeout(clearStaleToday, 0); });
  setTimeout(clearStaleToday, 1800);
})();
