(() => {
  const btn = document.querySelector('#refresh-btn');
  const label = btn?.querySelector('span');
  const lastUpdate = document.querySelector('#last-update');
  if (!btn) return;

  // The old terminal-state logic waited for tracker:gameday-universe before
  // allowing the UI to leave "checking". The universe scan is no longer part
  // of the foreground path, so that event may never arrive. Never let display
  // state depend on that expensive fallback scan.
  const MAX_WAIT_MS = 8_000;
  let finishTimer = null;
  let manualRefresh = false;
  const idleLabel = label?.textContent || '更新';

  const formatTime = ts => new Intl.DateTimeFormat('zh-TW', {
    timeZone: 'Asia/Taipei', hour: '2-digit', minute: '2-digit', hour12: false
  }).format(new Date(ts));

  function pairs() {
    if (typeof players !== 'undefined' && typeof lastResults !== 'undefined' && Array.isArray(players) && Array.isArray(lastResults)) {
      return players.map((player, index) => ({ player, result: lastResults[index] })).filter(({ result }) => result);
    }
    const snapshot = window.CENTRAL_DASHBOARD_SNAPSHOT;
    if (!snapshot?.players || !snapshot?.results) return [];
    return snapshot.players.map((player, index) => ({ player, result: snapshot.results[index] })).filter(({ result }) => result);
  }

  function isChecking(text = '') {
    return /正在確認今日出賽|正在直接向 MLB 確認|確認今日出賽|正在向 MLB|讀取中/.test(text);
  }

  function hasAppearance(player, result) {
    const stat = result?.today?.stat || {};
    if (result?.today?.onGame || result?.today?.live) return true;
    if (player.group === 'pitching') {
      return Number(stat.battersFaced || 0) > 0 || Number(stat.pitchesThrown || 0) > 0 || Number(stat.inningsPitched || 0) > 0;
    }
    return Number(stat.plateAppearances || 0) > 0 || Number(stat.atBats || 0) > 0 || Number(stat.runs || 0) > 0 || Number(stat.baseOnBalls || 0) > 0 || Number(stat.hitByPitch || 0) > 0 || Number(stat.sacFlies || 0) > 0 || Number(stat.sacBunts || 0) > 0;
  }

  function displayText(player, result, confirmed = false) {
    if (hasAppearance(player, result)) return null;
    if (result?.today?.game?.gamePk) return '今日有賽事 · 尚未出賽';
    return confirmed ? '今日暫無出賽' : '今日狀態待背景更新';
  }

  function clearCheckingRows({ confirmed = false, timedOut = false } = {}) {
    for (const { player, result } of pairs()) {
      const summary = document.querySelector(`a[href="#player-${player.id}"] .summary-today`);
      if (!summary || !isChecking(summary.textContent || '')) continue;
      const text = displayText(player, result, confirmed);
      if (text) summary.textContent = text;

      const detail = document.querySelector(`#player-${player.id} .today-detail`);
      if (detail) {
        const strong = detail.querySelector('strong');
        const p = detail.querySelector('p');
        if (strong && isChecking(strong.textContent || '')) strong.textContent = text || '今日狀態';
        if (p && text && isChecking(p.textContent || '')) p.textContent = text;
      }
    }

    if (manualRefresh) {
      manualRefresh = false;
      clearTimeout(finishTimer);
      btn.disabled = false;
      btn.removeAttribute('aria-busy');
      if (label) label.textContent = idleLabel;
      if (lastUpdate && timedOut && isChecking(lastUpdate.textContent || '')) {
        lastUpdate.textContent = `MLB 回應較慢 · 已保留目前資料 · ${formatTime(Date.now())}`;
      }
    }
  }

  function armFailSafe() {
    clearTimeout(finishTimer);
    finishTimer = setTimeout(() => clearCheckingRows({ confirmed: false, timedOut: true }), MAX_WAIT_MS);
  }

  // Startup must be instant: show the last usable status immediately instead
  // of blanking every player until a deep scan completes.
  setTimeout(() => {
    clearCheckingRows({ confirmed: false });
    if (lastUpdate && isChecking(lastUpdate.textContent || '')) {
      lastUpdate.textContent = '顯示目前資料 · MLB 背景更新中';
    }
  }, 50);

  btn.addEventListener('click', () => {
    manualRefresh = true;
    armFailSafe();
  }, false);

  // Any authoritative lightweight reconciliation can end the visible wait.
  window.addEventListener('tracker:live-fast-refresh', () => {
    clearCheckingRows({ confirmed: true });
  });
  window.addEventListener('tracker:single-source-reconciled', () => {
    clearCheckingRows({ confirmed: true });
  });
  window.addEventListener('tracker:gameday-universe', () => {
    clearCheckingRows({ confirmed: true });
  });

  // app.js itself reports completion through #last-update. Observe that text so
  // a successful normal refresh also releases the button without waiting for a
  // separate Gameday event.
  if (lastUpdate) {
    const observer = new MutationObserver(() => {
      if (!manualRefresh) return;
      const text = lastUpdate.textContent || '';
      if (!isChecking(text) && /已更新|已確認|無資料變更|暫時無法更新|部分球員/.test(text)) {
        clearCheckingRows({ confirmed: /已更新|已確認|無資料變更/.test(text) });
      }
    });
    observer.observe(lastUpdate, { childList: true, characterData: true, subtree: true });
  }
})();
