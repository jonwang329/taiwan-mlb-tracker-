(() => {
  const btn = document.querySelector('#refresh-btn');
  const lastUpdate = document.querySelector('#last-update');
  if (!btn) return;

  const API = 'https://statsapi.mlb.com/api/v1.1';
  let refreshing = false;

  const num = value => Number(value || 0);
  const val = (value, fallback = '—') => value ?? fallback;
  const formatTime = ts => new Intl.DateTimeFormat('zh-TW', {
    timeZone: 'Asia/Taipei', hour: '2-digit', minute: '2-digit', hour12: false
  }).format(new Date(ts));

  function liveAppearance(player, stat = {}) {
    return player.group === 'pitching'
      ? num(stat.battersFaced) > 0 || num(stat.pitchesThrown) > 0 || num(stat.inningsPitched) > 0
      : num(stat.plateAppearances) > 0 || num(stat.atBats) > 0 || num(stat.runs) > 0 || num(stat.baseOnBalls) > 0 || num(stat.hitByPitch) > 0 || num(stat.sacFlies) > 0 || num(stat.sacBunts) > 0;
  }

  function line(player, stat = {}) {
    return player.group === 'pitching'
      ? `${val(stat.inningsPitched, '0')} IP · ${val(stat.hits, 0)} H · ${val(stat.earnedRuns, 0)} ER · ${val(stat.baseOnBalls, 0)} BB · ${val(stat.strikeOuts, 0)} K${stat.battersFaced != null ? ` · ${stat.battersFaced} BF` : ''}`
      : `${val(stat.hits, 0)}-${val(stat.atBats, 0)}${stat.plateAppearances != null ? ` · ${stat.plateAppearances} PA` : ''} · ${num(stat.homeRuns) ? `${stat.homeRuns} HR · ` : ''}${num(stat.rbi) ? `${stat.rbi} RBI` : ''}`.replace(/ · $/, '');
  }

  function snapshotPairs() {
    const snapshot = window.CENTRAL_DASHBOARD_SNAPSHOT;
    if (!snapshot || !Array.isArray(snapshot.players) || !Array.isArray(snapshot.results)) return [];
    return snapshot.players.map((player, index) => ({ player, result: snapshot.results[index] })).filter(({ result }) => result?.today?.game?.gamePk);
  }

  async function fetchLiveGame(gamePk) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 7000);
    try {
      const response = await fetch(`${API}/game/${gamePk}/feed/live?_=${Date.now()}`, {
        cache: 'no-store',
        headers: { Accept: 'application/json', 'Cache-Control': 'no-cache' },
        signal: controller.signal
      });
      if (!response.ok) throw new Error(`MLB live ${response.status}`);
      return response.json();
    } finally {
      clearTimeout(timer);
    }
  }

  function playerFromFeed(feed, player) {
    const key = `ID${player.id}`;
    return feed?.liveData?.boxscore?.teams?.home?.players?.[key]
      || feed?.liveData?.boxscore?.teams?.away?.players?.[key]
      || null;
  }

  function repaintPlayer(player, result, feed) {
    const boxPlayer = playerFromFeed(feed, player);
    if (!boxPlayer) return false;
    const stat = player.group === 'pitching'
      ? (boxPlayer.stats?.pitching || {})
      : (boxPlayer.stats?.batting || boxPlayer.stats?.hitting || {});
    if (!liveAppearance(player, stat)) return false;

    const state = feed?.gameData?.status?.abstractGameState;
    const isLive = state === 'Live';
    result.today.stat = stat;
    result.today.live = isLive;

    const summary = document.querySelector(`a[href="#player-${player.id}"] .summary-today`);
    if (summary) summary.textContent = `${line(player, stat)}${isLive ? ' · LIVE' : ''}`;

    const detail = document.querySelector(`#player-${player.id} .today-detail`);
    if (detail) {
      const strong = detail.querySelector('strong');
      const p = detail.querySelector('p');
      if (strong) strong.textContent = isLive ? 'LIVE · 已出賽' : '已出賽';
      if (p) p.textContent = line(player, stat);
    }
    return true;
  }

  async function refreshKnownGames({ quiet = false } = {}) {
    if (refreshing) return true;
    const pairs = snapshotPairs();
    if (!pairs.length) return false;

    refreshing = true;
    btn.disabled = true;
    btn.setAttribute('aria-busy', 'true');
    if (!quiet && lastUpdate) lastUpdate.textContent = '正在更新目前進行中的比賽…';

    try {
      const gameIds = [...new Set(pairs.map(({ result }) => Number(result.today.game.gamePk)).filter(Boolean))];
      const feeds = new Map();
      const settled = await Promise.allSettled(gameIds.map(async gamePk => [gamePk, await fetchLiveGame(gamePk)]));
      for (const item of settled) if (item.status === 'fulfilled') feeds.set(item.value[0], item.value[1]);
      if (!feeds.size) throw new Error('目前比賽即時資料暫時無法取得');

      let updated = 0;
      for (const { player, result } of pairs) {
        const feed = feeds.get(Number(result.today.game.gamePk));
        if (feed && repaintPlayer(player, result, feed)) updated += 1;
      }
      if (!quiet && lastUpdate) lastUpdate.textContent = `MLB Live 已更新 · ${formatTime(Date.now())}`;
      window.dispatchEvent(new CustomEvent('tracker:live-fast-refresh', { detail: { updated, games: feeds.size } }));
      return true;
    } catch (error) {
      console.warn('Fast live refresh failed', error);
      if (!quiet && lastUpdate) lastUpdate.textContent = `即時更新失敗 · 可再次按更新 · ${formatTime(Date.now())}`;
      return true;
    } finally {
      refreshing = false;
      btn.disabled = false;
      btn.removeAttribute('aria-busy');
    }
  }

  // Capture first so a manual tap does not launch the expensive all-player/all-level refresh.
  btn.addEventListener('click', async event => {
    const hasKnownGame = snapshotPairs().length > 0;
    if (!hasKnownGame) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    await refreshKnownGames();
  }, true);

  // While a live game is already known, keep it fresh without requiring a page reload.
  const timer = setInterval(() => {
    if (!document.hidden && snapshotPairs().some(({ result }) => result.today?.live)) {
      refreshKnownGames({ quiet: true }).catch(() => {});
    }
  }, 60 * 1000);

  window.addEventListener('pagehide', () => clearInterval(timer), { once: true });
})();
