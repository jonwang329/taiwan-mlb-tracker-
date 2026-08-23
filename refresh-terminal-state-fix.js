(() => {
  const btn = document.querySelector('#refresh-btn');
  const label = btn?.querySelector('span');
  const lastUpdate = document.querySelector('#last-update');
  if (!btn) return;

  const MAX_WAIT_MS = 35_000;
  let finishTimer = null;
  let holding = false;
  let sawUniverse = false;
  let suppressObserver = false;
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
    return /正在確認今日出賽|正在直接向 MLB 確認|確認今日出賽/.test(text);
  }

  function hasAppearance(player, result) {
    const stat = result?.today?.stat || {};
    if (result?.today?.onGame || result?.today?.live) return true;
    if (player.group === 'pitching') {
      return Number(stat.battersFaced || 0) > 0 || Number(stat.pitchesThrown || 0) > 0 || Number(stat.inningsPitched || 0) > 0;
    }
    return Number(stat.plateAppearances || 0) > 0 || Number(stat.atBats || 0) > 0 || Number(stat.runs || 0) > 0 || Number(stat.baseOnBalls || 0) > 0 || Number(stat.hitByPitch || 0) > 0 || Number(stat.sacFlies || 0) > 0 || Number(stat.sacBunts || 0) > 0;
  }

  function terminalText(player, result) {
    if (hasAppearance(player, result)) return null;
    if (result?.today?.game?.gamePk) return '今日有賽事 · 尚未出賽';
    return 'MLB 已確認 · 今日暫無出賽';
  }

  function forceBusyVisual() {
    if (!holding) return;
    suppressObserver = true;
    btn.disabled = true;
    btn.setAttribute('aria-busy', 'true');
    if (label) label.textContent = '檢查中…';
    queueMicrotask(() => { suppressObserver = false; });
  }

  function finalizeRows({ timedOut = false } = {}) {
    for (const { player, result } of pairs()) {
      const summary = document.querySelector(`a[href="#player-${player.id}"] .summary-today`);
      if (!summary || !isChecking(summary.textContent || '')) continue;
      const text = terminalText(player, result);
      if (text) summary.textContent = text;

      const detail = document.querySelector(`#player-${player.id} .today-detail`);
      if (detail) {
        const strong = detail.querySelector('strong');
        const p = detail.querySelector('p');
        if (strong && isChecking(strong.textContent || '')) strong.textContent = text || 'MLB 已確認';
        if (p && text && isChecking(p.textContent || '')) p.textContent = text;
      }
    }

    holding = false;
    sawUniverse = false;
    clearTimeout(finishTimer);
    suppressObserver = true;
    btn.disabled = false;
    btn.removeAttribute('aria-busy');
    if (label) label.textContent = idleLabel;
    queueMicrotask(() => { suppressObserver = false; });
    if (lastUpdate) {
      lastUpdate.textContent = timedOut
        ? `MLB 檢查逾時 · 已保留最後確認資料 · ${formatTime(Date.now())}`
        : `MLB / MiLB 最新資料已確認 · ${formatTime(Date.now())}`;
    }
  }

  function armFailSafe() {
    clearTimeout(finishTimer);
    finishTimer = setTimeout(() => finalizeRows({ timedOut: true }), MAX_WAIT_MS);
  }

  btn.addEventListener('click', () => {
    holding = true;
    sawUniverse = false;
    forceBusyVisual();
    armFailSafe();
  }, false);

  // Other refresh listeners historically re-enabled the button in their own finally blocks.
  // While a full manual refresh is still in flight, immediately put it back into busy state.
  const observer = new MutationObserver(() => {
    if (suppressObserver || !holding) return;
    if (!btn.disabled || btn.getAttribute('aria-busy') !== 'true') forceBusyVisual();
  });
  observer.observe(btn, { attributes: true, attributeFilter: ['disabled', 'aria-busy'] });

  window.addEventListener('tracker:gameday-universe', () => {
    if (!holding) return;
    sawUniverse = true;
    armFailSafe();
  });

  window.addEventListener('tracker:single-source-reconciled', () => {
    if (!holding || !sawUniverse) return;
    finalizeRows();
  });

  window.addEventListener('tracker:live-fast-refresh', () => {
    if (holding) armFailSafe();
  });
})();
