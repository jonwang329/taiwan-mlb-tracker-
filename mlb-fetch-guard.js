(() => {
  const originalFetch = window.fetch.bind(window);
  const MAX_MLB_REQUESTS = 8;
  let active = 0;
  const waiting = [];
  const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
  const isMlb = input => String(typeof input === 'string' ? input : input?.url || '').startsWith('https://statsapi.mlb.com/');

  async function acquireMlbSlot() {
    if (active < MAX_MLB_REQUESTS) {
      active += 1;
      return;
    }
    await new Promise(resolve => waiting.push(resolve));
    active += 1;
  }

  function releaseMlbSlot() {
    active = Math.max(0, active - 1);
    waiting.shift()?.();
  }

  window.fetch = async (input, init = {}) => {
    if (!isMlb(input)) return originalFetch(input, init);
    let lastError;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      await acquireMlbSlot();
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 10000);
      try {
        const response = await originalFetch(input, { ...init, signal: controller.signal });
        if (response.ok || (response.status !== 429 && response.status < 500)) return response;
        lastError = new Error(`MLB API ${response.status}`);
      } catch (error) {
        lastError = error;
      } finally {
        clearTimeout(timer);
        releaseMlbSlot();
      }
      if (attempt === 0) await pause(300);
    }
    throw lastError || new Error('MLB API request failed');
  };

  window.MLB_FETCH_GUARD = { maxConcurrent: MAX_MLB_REQUESTS };
})();
