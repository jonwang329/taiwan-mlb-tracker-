(() => {
  const LIVE_API = 'https://statsapi.mlb.com/api/v1.1';
  const POLL_MS = 30 * 1000;
  const lastUpdate = document.querySelector('#last-update');
  let timer = null;
  let running = false;

  const num = value => Number(value || 0);
  const val = (value, fallback = '—') => value ?? fallback;
  const formatTime = ts => new Intl.DateTimeFormat('zh-TW', {
    timeZone: 'Asia/Taipei', hour: '2-digit', minute: '2-digit', hour12: false
  }).format(new Date(ts));

  function currentPairs() {
    if (typeof players !== 'undefined' && typeof lastResults !== 'undefined' && Array.isArray(players) && Array.isArray(lastResults)) {
      return players.map((player, index) => ({ player, result: lastResults[index] })).filter(({ result }) => result);
    }
    const snapshot = window.CENTRAL_DASHBOARD_SNAPSHOT;
    if (!snapshot || !Array.isArray(snapshot.players) || !Array.isArray(snapshot.results)) return [];
    return snapshot.players.map((player, index) => ({ player, result: snapshot.results[index] })).filter(({ result }) => result);
  }

  function gamePkFor(result) {
    return Number(
      result?.today?.game?.gamePk ||
      result?.latest?.game?.gamePk ||
      result?.games?.[0]?.game?.gamePk ||
      0
    );
  }

  function appeared(player, stat = {}) {
    return player.group === 'pitching'
      ? num(stat.battersFaced) > 0 || num(stat.pitchesThrown) > 0 || num(stat.inningsPitched) > 0
      : num(stat.plateAppearances) > 0 || num(stat.atBats) > 0 || num(stat.runs) > 0 ||
        num(stat.baseOnBalls) > 0 || num(stat.hitByPitch) > 0 || num(stat.sacFlies) > 0 || num(stat.sacBunts) > 0;
  }

  function statLine(player, stat = {}) {
    if (player.group === 'pitching') {
      return `${val(stat.inningsPitched, '0')} IP · ${val(stat.hits, 0)} H · ${val(stat.earnedRuns, 0)} ER · ${val(stat.baseOnBalls, 0)} BB · ${val(stat.strikeOuts, 0)} K${stat.battersFaced != null ? ` · ${stat.battersFaced} BF` : ''}`;
    }
    const extras = [];
    if (num(stat.homeRuns)) extras.push(`${stat.homeRuns} HR`);
    if (num(stat.rbi)) extras.push(`${stat.rbi} RBI`);
    return `${val(stat.hits, 0)}-${val(stat.atBats, 0)}${stat.plateAppearances != null ? ` · ${stat.plateAppearances} PA` : ''}${extras.length ? ` · ${extras.join(' · ')}` : ''}`;
  }

  async function fetchFeed(gamePk) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 7000);
    try {
      const response = await fetch(`${LIVE_API}/game/${gamePk}/feed/live?_=${Date.now()}`, {
        cache: 'no-store',
        headers: { Accept: 'application/json', 'Cache-Control': 'no-cache' },
        signal: controller.signal
      });
      if (!response.ok) throw new Error(`MLB ${response.status}`);
      return response.json();
    } finally {
      clearTimeout(timeout);
    }
  }

  function findPlayer(feed, player) {
    const key = `ID${player.id}`;
    return feed?.liveData?.boxscore?.teams?.home?.players?.[key] ||
      feed?.liveData?.boxscore?.teams?.away?.players?.[key] || null;
  }

  function updateDom(player, result, feed) {
    const boxPlayer = findPlayer(feed, player);
    if (!boxPlayer) return false;
    const stat = player.group === 'pitching'
      ? (boxPlayer.stats?.pitching || {})
      : (boxPlayer.stats?.batting || boxPlayer.stats?.hitting || {});
    if (!appeared(player, stat)) return false;

    const gamePk = Number(feed?.gamePk || feed?.gameData?.game?.pk || gamePkFor(result));
    const state = feed?.gameData?.status?.abstractGameState;
    const isLive = state === 'Live';
    const line = statLine(player, stat);

    result.today = {
      ...(result.today || {}),
      date: feed?.gameData?.datetime?.officialDate || result.today?.date,
      level: result.today?.level || result.latest?.level || '—',
      stat: { ...stat },
      game: { gamePk },
      live: isLive
    };

    if (Array.isArray(result.games)) {
      const existing = result.games.find(game => Number(game?.game?.gamePk) === gamePk);
      if (existing) {
        existing.stat = { ...stat };
        existing.live = isLive;
      }
    }
    if (Number(result?.latest?.game?.gamePk) === gamePk) {
      result.latest.stat = { ...stat };
      result.latest.live = isLive;
    }

    const summary = document.querySelector(`a[href="#player-${player.id}"] .summary-today`);
    if (summary) summary.textContent = `${line}${isLive ? ' · LIVE' : ''}`;

    const detail = document.querySelector(`#player-${player.id} .today-detail`);
    if (detail) {
      const strong = detail.querySelector('strong');
      const p = detail.querySelector('p');
      if (strong) strong.textContent = isLive ? 'LIVE · 已出賽' : '已出賽';
      if (p) p.textContent = line;
    }

    return true;
  }

  async function refreshAuthoritative() {
    if (running || document.hidden) return;
    running = true;
    try {
      const pairs = currentPairs();
      const ids = [...new Set(pairs.map(({ result }) => gamePkFor(result)).filter(Boolean))];
      if (!ids.length) return;

      const settled = await Promise.allSettled(ids.map(async id => [id, await fetchFeed(id)]));
      const feeds = new Map();
      for (const item of settled) if (item.status === 'fulfilled') feeds.set(item.value[0], item.value[1]);
      if (!feeds.size) return;

      let confirmed = 0;
      for (const { player, result } of pairs) {
        const gamePk = gamePkFor(result);
        const feed = feeds.get(gamePk);
        if (feed && updateDom(player, result, feed)) confirmed += 1;
      }

      if (confirmed > 0 && lastUpdate) {
        lastUpdate.textContent = `MLB Live 已確認 · ${formatTime(Date.now())}`;
        lastUpdate.dataset.statVerifiedAt = String(Date.now());
      }
      window.dispatchEvent(new CustomEvent('tracker:authoritative-live-refresh', { detail: { confirmed, games: feeds.size } }));
    } catch (error) {
      console.warn('Authoritative live refresh failed', error);
    } finally {
      running = false;
    }
  }

  refreshAuthoritative();
  timer = setInterval(refreshAuthoritative, POLL_MS);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) refreshAuthoritative();
  });
  window.addEventListener('pagehide', () => clearInterval(timer), { once: true });
})();
