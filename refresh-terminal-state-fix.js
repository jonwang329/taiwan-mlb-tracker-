(() => {
  const btn = document.querySelector('#refresh-btn');
  const label = btn?.querySelector('span');
  const lastUpdate = document.querySelector('#last-update');
  if (!btn) return;

  const MAX_WAIT_MS = 8_000;
  let finishTimer = null;
  let manualRefresh = false;
  const idleLabel = '更新';

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
    return /更新中|正在更新|確認中|正在確認|正在直接向 MLB 確認|正在向 MLB|讀取中|checking|updating/i.test(text);
  }

  function hasAppearance(player, result) {
    const stat = result?.today?.stat || {};
    if (result?.today?.onGame || result?.today?.live) return true;
    if (player.group === 'pitching') {
      return Number(stat.battersFaced || 0) > 0 || Number(stat.pitchesThrown || 0) > 0 || Number(stat.inningsPitched || 0) > 0;
    }
    return Number(stat.plateAppearances || 0) > 0 || Number(stat.atBats || 0) > 0 || Number(stat.runs || 0) > 0 || Number(stat.baseOnBalls || 0) > 0 || Number(stat.hitByPitch || 0) > 0 || Number(stat.sacFlies || 0) > 0 || Number(stat.sacBunts || 0) > 0;
  }

  function terminalText(player, result, confirmed = false) {
    if (hasAppearance(player, result)) return null;
    if (result?.today?.game?.gamePk) return '今日有賽事 · 尚未出賽';
    return confirmed ? '今日暫無出賽' : '顯示目前資料';
  }

  function clearCheckingRows({ confirmed = false, timedOut = false } = {}) {
    for (const { player, result } of pairs()) {
      const text = terminalText(player, result, confirmed);
      const summary = document.querySelector(`a[href="#player-${player.id}"] .summary-today`);
      if (summary && isChecking(summary.textContent || '') && text) summary.textContent = text;

      const detail = document.querySelector(`#player-${player.id} .today-detail`);
      if (detail) {
        const strong = detail.querySelector('strong');
        const p = detail.querySelector('p');
        if (strong && isChecking(strong.textContent || '')) strong.textContent = text || '今日狀態';
        if (p && isChecking(p.textContent || '')) p.textContent = text || '保留目前資料';
      }
    }

    manualRefresh = false;
    clearTimeout(finishTimer);
    btn.disabled = false;
    btn.removeAttribute('aria-busy');
    btn.classList.remove('is-refreshing', 'refreshing', 'loading');
    if (label) label.textContent = idleLabel;

    if (lastUpdate && isChecking(lastUpdate.textContent || '')) {
      lastUpdate.textContent = timedOut
        ? `已完成檢查 · 無新資料時保留目前結果 · ${formatTime(Date.now())}`
        : `已完成檢查 · ${formatTime(Date.now())}`;
    }
  }

  function armFailSafe() {
    clearTimeout(finishTimer);
    finishTimer = setTimeout(() => clearCheckingRows({ confirmed: true, timedOut: true }), MAX_WAIT_MS);
  }

  function finishConfirmed() {
    clearCheckingRows({ confirmed: true });
  }

  // Startup must never remain in an indeterminate state. Keep the last usable
  // snapshot visible while background reconciliation runs.
  setTimeout(() => {
    clearCheckingRows({ confirmed: false });
    if (lastUpdate && isChecking(lastUpdate.textContent || '')) {
      lastUpdate.textContent = '顯示目前資料 · 背景更新中';
    }
  }, 50);

  // A second startup guard catches scripts that overwrite the first repaint.
  setTimeout(() => clearCheckingRows({ confirmed: false }), 2500);

  btn.addEventListener('click', () => {
    manualRefresh = true;
    armFailSafe();
  }, true);

  ['tracker:live-fast-refresh', 'tracker:single-source-reconciled', 'tracker:gameday-universe', 'tracker:gameday-current-team']
    .forEach(name => window.addEventListener(name, finishConfirmed));

  if (lastUpdate) {
    const observer = new MutationObserver(() => {
      const text = lastUpdate.textContent || '';
      if (!isChecking(text) && /已更新|已完成|已確認|無資料變更|暫時無法更新|部分球員|顯示目前資料/.test(text)) {
        clearCheckingRows({ confirmed: /已更新|已完成|已確認|無資料變更/.test(text) });
      }
    });
    observer.observe(lastUpdate, { childList: true, characterData: true, subtree: true });
  }

  // Last-resort watchdog: if any later hotfix puts the UI back into an updating
  // state without arming a refresh, terminate it instead of leaving the page hung.
  setInterval(() => {
    const stuck = isChecking(lastUpdate?.textContent || '') ||
      isChecking(label?.textContent || '') ||
      [...document.querySelectorAll('.summary-today')].some(el => isChecking(el.textContent || ''));
    if (stuck && !finishTimer) armFailSafe();
  }, 1000);
})();
