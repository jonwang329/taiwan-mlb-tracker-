(() => {
  const STAT_EVIDENCE = /(?:^|[·•\s])\d+(?:\.\d+)?\s*(?:BB|K|H|HR|RBI|PA|AB|IP|ER|BF)(?:\b|$)/i;
  const PENDING = /正在確認今日出賽(?:…|\.\.\.)?/;

  function reconcileNode(node) {
    const text = String(node?.textContent || '').replace(/\s+/g, ' ').trim();
    if (!PENDING.test(text) || !STAT_EVIDENCE.test(text)) return;
    node.textContent = text.replace(PENDING, '今日已出賽').replace(/今日已出賽\s*[·•]?\s*/, '今日已出賽 · ');
  }

  function reconcile() {
    document.querySelectorAll('.summary-today').forEach(reconcileNode);
  }

  function start() {
    reconcile();
    const root = document.querySelector('#player-summary');
    if (!root) return;
    const observer = new MutationObserver(reconcile);
    observer.observe(root, { childList: true, subtree: true, characterData: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }

  document.addEventListener('tracker:players-loaded', reconcile);
  window.addEventListener('tracker:gameday-universe', reconcile);
})();
