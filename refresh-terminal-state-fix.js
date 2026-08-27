(() => {
  const btn = document.querySelector('#refresh-btn');
  const label = btn?.querySelector('span');
  const lastUpdate = document.querySelector('#last-update');
  if (!btn) return;

  const MAX_WAIT_MS = 8000;
  let finishTimer = null;
  const idleLabel = '更新';

  const formatTime = ts => new Intl.DateTimeFormat('zh-TW', {
    timeZone: 'Asia/Taipei', hour: '2-digit', minute: '2-digit', hour12: false
  }).format(new Date(ts));

  function repaintLastGood(message = '顯示目前資料 · 背景更新中') {
    try {
      if (typeof paint === 'function' && typeof lastResults !== 'undefined' && Array.isArray(lastResults) && lastResults.length) {
        paint(lastResults, message);
        return true;
      }
    } catch (error) {
      console.warn('Could not repaint last-good dashboard', error);
    }
    return false;
  }

  function finish(message = `已完成檢查 · ${formatTime(Date.now())}`) {
    clearTimeout(finishTimer);
    finishTimer = null;
    btn.disabled = false;
    btn.removeAttribute('aria-busy');
    btn.classList.remove('is-refreshing', 'refreshing', 'loading');
    if (label) label.textContent = idleLabel;
    if (!repaintLastGood(message) && lastUpdate) lastUpdate.textContent = message;
  }

  function armFailSafe() {
    clearTimeout(finishTimer);
    finishTimer = setTimeout(() => {
      finish(`已完成檢查 · 無新資料時保留目前結果 · ${formatTime(Date.now())}`);
    }, MAX_WAIT_MS);
  }

  // app.js restores the last-good snapshot first, then its legacy startup state
  // temporarily overwrites every Today row with "checking". Restore the snapshot
  // immediately and keep it visible while reconciliation happens in background.
  setTimeout(() => {
    try {
      if (typeof initialConfirmationPending !== 'undefined') initialConfirmationPending = false;
    } catch {}
    repaintLastGood('顯示目前資料 · 背景更新中');
  }, 0);

  // Catch any later startup script that tries to put the entire dashboard back
  // into an indeterminate state. Never hide valid data behind "checking".
  setTimeout(() => repaintLastGood('顯示目前資料 · 背景更新中'), 1200);

  btn.addEventListener('click', () => {
    repaintLastGood('顯示目前資料 · 正在更新');
    armFailSafe();
  }, true);

  [
    'tracker:live-fast-refresh',
    'tracker:single-source-reconciled',
    'tracker:gameday-universe',
    'tracker:gameday-current-team'
  ].forEach(name => window.addEventListener(name, () => finish()));

  // If app.js completes a refresh without one of the auxiliary events, preserve
  // the rendered data and return the refresh button to idle instead of hanging.
  if (lastUpdate) {
    const observer = new MutationObserver(() => {
      const text = lastUpdate.textContent || '';
      if (/已更新|已完成|已確認|無資料變更|暫時無法更新|部分球員|賽程檢查失敗/.test(text)) {
        finish(text);
      }
    });
    observer.observe(lastUpdate, { childList: true, characterData: true, subtree: true });
  }
})();
