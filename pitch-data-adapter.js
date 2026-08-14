(() => {
  const upstreamFetch = window.fetch.bind(window);
  const FEED_RE = /^https:\/\/statsapi\.mlb\.com\/api\/v1\.1\/game\/(\d+)\/feed\/live(?:\?.*)?$/;

  window.fetch = async (input, init = {}) => {
    const url = String(typeof input === 'string' ? input : input?.url || '');
    const match = url.match(FEED_RE);
    if (!match) return upstreamFetch(input, init);

    const gamePk = match[1];
    const playByPlayUrl = `https://statsapi.mlb.com/api/v1/game/${gamePk}/playByPlay?_=${Date.now()}`;
    const response = await upstreamFetch(playByPlayUrl, {
      ...init,
      cache: 'no-store',
      headers: { ...(init.headers || {}), Accept: 'application/json', 'Cache-Control': 'no-cache' }
    });
    if (!response.ok) return response;

    const data = await response.json();
    const normalized = {
      liveData: {
        plays: {
          allPlays: Array.isArray(data?.allPlays) ? data.allPlays : [],
          currentPlay: data?.currentPlay || null,
          scoringPlays: Array.isArray(data?.scoringPlays) ? data.scoringPlays : []
        }
      }
    };

    return new Response(JSON.stringify(normalized), {
      status: response.status,
      statusText: response.statusText,
      headers: { 'Content-Type': 'application/json' }
    });
  };

  window.PITCH_DATA_SOURCE = 'MLB Stats API v1 playByPlay';
})();
