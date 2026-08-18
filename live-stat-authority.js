(() => {
  const API = 'https://statsapi.mlb.com/api/v1';
  const LIVE_API = 'https://statsapi.mlb.com/api/v1.1';
  const POLL_MS = 30 * 1000;
  const CACHE_KEY = 'taiwan-mlb-tracker:last-good:v2';
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
    return Number(result?.today?.game?.gamePk || result?.latest?.game?.gamePk || result?.games?.[0]?.game?.gamePk || 0);
  }

  function appeared(player, stat = {}) {
    return player.group === 'pitching'
      ? num(stat.battersFaced) > 0 || num(stat.pitchesThrown) > 0 || num(stat.inningsPitched) > 0
      : num(stat.plateAppearances) > 0 || num(stat.atBats) > 0 || num(stat.runs) > 0 ||
        num(stat.baseOnBalls) > 0 || num(stat.hitByPitch) > 0 || num(stat.sacFlies) > 0 || num(stat.sacBunts) > 0;
  }

  function progress(player, stat = {}) {
    if (player.group === 'pitching') {
      return num(stat.battersFaced) * 10000 + num(stat.pitchesThrown) * 10 + num(stat.strikeOuts);
    }
    return num(stat.plateAppearances) * 10000 + num(stat.atBats) * 1000 + num(stat.hits) * 100 +
      num(stat.baseOnBalls) * 10 + num(stat.hitByPitch);
  }

  function statLine(player, stat = {}) {
    if (player.group === 'pitching') {
      return `${val(stat.inningsPitched, '0')} IP · ${val(stat.hits, 0)} H · ${val(stat.earnedRuns, 0)} ER · ${val(stat.baseOnBalls, 0)} BB · ${val(stat.strikeOuts, 0)} K${stat.battersFaced != null ? ` · ${stat.battersFaced} BF` : ''}`;
    }
    const extras = [];
    if (num(stat.baseOnBalls)) extras.push(`${stat.baseOnBalls} BB`);
    if (num(stat.hitByPitch)) extras.push(`${stat.hitByPitch} HBP`);
    if (num(stat.homeRuns)) extras.push(`${stat.homeRuns} HR`);
    if (num(stat.rbi)) extras.push(`${stat.rbi} RBI`);
    return `${val(stat.hits, 0)}-for-${val(stat.atBats, 0)}${stat.plateAppearances != null ? ` · ${stat.plateAppearances} PA` : ''}${extras.length ? ` · ${extras.join(' · ')}` : ''}`;
  }

  async function fetchJson(url) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 7000);
    try {
      const response = await fetch(`${url}${url.includes('?') ? '&' : '?'}_=${Date.now()}`, {
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

  async function fetchOfficialGame(gamePk) {
    const [feedResult, boxResult] = await Promise.allSettled([
      fetchJson(`${LIVE_API}/game/${gamePk}/feed/live`),
      fetchJson(`${API}/game/${gamePk}/boxscore`)
    ]);
    const feed = feedResult.status === 'fulfilled' ? feedResult.value : null;
    const box = boxResult.status === 'fulfilled' ? boxResult.value : null;
    if (!feed && !box) throw new Error(`MLB game ${gamePk} unavailable`);
    return { gamePk, feed, box };
  }

  function playerBox(container, player) {
    const key = `ID${player.id}`;
    return container?.teams?.home?.players?.[key] || container?.teams?.away?.players?.[key] || null;
  }

  function statFrom(boxPlayer, player) {
    if (!boxPlayer) return null;
    return player.group === 'pitching'
      ? (boxPlayer.stats?.pitching || null)
      : (boxPlayer.stats?.batting || boxPlayer.stats?.hitting || null);
  }

  function freshestStat(game, player) {
    const feedBox = game.feed?.liveData?.boxscore;
    const candidates = [
      statFrom(playerBox(feedBox, player), player),
      statFrom(playerBox(game.box, player), player)
    ].filter(Boolean);
    return candidates.sort((a, b) => progress(player, b) - progress(player, a))[0] || null;
  }

  function gameState(game) {
    return game.feed?.gameData?.status?.abstractGameState || game.box?.gameData?.status?.abstractGameState || '';
  }

  function gameDate(game, result) {
    return game.feed?.gameData?.datetime?.officialDate || result?.today?.date || result?.latest?.date;
  }

  function updateDom(player, result, game) {
    const stat = freshestStat(game, player);
    if (!stat || !appeared(player, stat)) return false;
    const gamePk = Number(game.gamePk || gamePkFor(result));
    const isLive = gameState(game) === 'Live';
    const line = statLine(player, stat);

    result.today = {
      ...(result.today || {}),
      date: gameDate(game, result),
      level: result.today?.level || result.latest?.level || '—',
      stat: { ...stat },
      game: { gamePk },
      live: isLive
    };

    if (Array.isArray(result.games)) {
      const existing = result.games.find(item => Number(item?.game?.gamePk) === gamePk);
      if (existing) { existing.stat = { ...stat }; existing.live = isLive; }
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

  function persistRuntime(pairs) {
    try {
      const snapshot = {
        savedAt: Date.now(),
        players: pairs.map(({ player }) => player),
        results: pairs.map(({ result }) => result)
      };
      localStorage.setItem(CACHE_KEY, JSON.stringify(snapshot));
      window.CENTRAL_DASHBOARD_SNAPSHOT = snapshot;
    } catch (error) {
      console.warn('Could not persist authoritative MLB snapshot', error);
    }
  }

  async function refreshAuthoritative() {
    if (running || document.hidden) return;
    running = true;
    try {
      const pairs = currentPairs();
      const ids = [...new Set(pairs.map(({ result }) => gamePkFor(result)).filter(Boolean))];
      if (!ids.length) return;

      const settled = await Promise.allSettled(ids.map(fetchOfficialGame));
      const games = new Map();
      for (const item of settled) if (item.status === 'fulfilled') games.set(item.value.gamePk, item.value);
      if (!games.size) return;

      let confirmed = 0;
      for (const { player, result } of pairs) {
        const game = games.get(gamePkFor(result));
        if (game && updateDom(player, result, game)) confirmed += 1;
      }

      if (confirmed > 0) {
        const now = Date.now();
        persistRuntime(pairs);
        if (lastUpdate) {
          lastUpdate.textContent = `MLB 資料刷新 · ${formatTime(now)}`;
          lastUpdate.dataset.statVerifiedAt = String(now);
        }
      }
      window.dispatchEvent(new CustomEvent('tracker:authoritative-live-refresh', { detail: { confirmed, games: games.size } }));
    } catch (error) {
      console.warn('Authoritative live refresh failed', error);
    } finally {
      running = false;
    }
  }

  if (lastUpdate) {
    const observer = new MutationObserver(() => {
      const text = lastUpdate.textContent || '';
      if (text.startsWith('已檢查今日賽程')) {
        const verified = Number(lastUpdate.dataset.statVerifiedAt || 0);
        if (verified) lastUpdate.textContent = `MLB 資料刷新 · ${formatTime(verified)}`;
        else lastUpdate.textContent = `MLB 賽程檢查 · ${formatTime(Date.now())}（球員數據未確認）`;
      }
    });
    observer.observe(lastUpdate, { childList: true, characterData: true, subtree: true });
  }

  refreshAuthoritative();
  timer = setInterval(refreshAuthoritative, POLL_MS);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refreshAuthoritative(); });
  window.addEventListener('pagehide', () => clearInterval(timer), { once: true });
})();
