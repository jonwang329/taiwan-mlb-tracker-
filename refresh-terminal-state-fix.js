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

  // This helper only owns refresh-button state. It must never call paint().
  // app.js owns full-dashboard rendering; live-refresh.js owns targeted live updates.
  // Keeping those responsibilities separate prevents repeated full DOM rebuilds on iPhone Safari.
  function finish(message = `已完成檢查 · ${formatTime(Date.now())}`) {
    clearTimeout(finishTimer);
    finishTimer = null;
    btn.disabled = false;
    btn.removeAttribute('aria-busy');
    btn.classList.remove('is-refreshing', 'refreshing', 'loading');
    if (label) label.textContent = idleLabel;
    if (lastUpdate && lastUpdate.textContent !== message) lastUpdate.textContent = message;
  }

  function armFailSafe() {
    clearTimeout(finishTimer);
    finishTimer = setTimeout(() => {
      finish(`已完成檢查 · 無新資料時保留目前結果 · ${formatTime(Date.now())}`);
    }, MAX_WAIT_MS);
  }

  btn.addEventListener('click', () => {
    armFailSafe();
  }, true);

  [
    'tracker:live-fast-refresh',
    'tracker:single-source-reconciled',
    'tracker:gameday-universe',
    'tracker:gameday-current-team'
  ].forEach(name => window.addEventListener(name, () => finish()));

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
