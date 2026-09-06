(() => {
  // Compatibility bridge only. There is exactly one refresh/write path: app.js refreshData().
  // This file must not fetch MLB independently, mutate Today state, paint the DOM,
  // persist snapshots, start timers, or run an automatic startup scan.
  async function scan({ force = false } = {}) {
    if (typeof refreshData !== 'function') return { skipped: true, reason: 'app-model-not-ready' };
    const results = await refreshData({ reason: force ? 'gameday-force' : 'gameday' });
    window.dispatchEvent(new CustomEvent('tracker:gameday-universe', { detail: { singleWriter: true, refreshed: true } }));
    return { singleWriter: true, refreshed: true, results };
  }
  window.TaiwanMlbUniverseScan = scan;
})();
