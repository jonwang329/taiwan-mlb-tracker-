(() => {
  const API = 'https://statsapi.mlb.com/api/v1';
  const LIVE_API = 'https://statsapi.mlb.com/api/v1.1';
  const SPORT_IDS = [1, 11, 12, 13, 14, 16];
  const timeLogic = window.TaiwanGameTime;
  if (!timeLogic) return;

  const { scheduleQueryWindow, isTaiwanTodayGame, gameTaiwanDate } = timeLogic;
  let running = false;
  let timer = null;

  function trackedPairs() {
    if (typeof players !== 'undefined' && typeof lastResults !== 'undefined' && Array.isArray(players) && Array.isArray(lastResults)) {
      return players.map((player, index) => ({ player, result: lastResults[index] })).filter(({ result }) => result);
    }
    const snapshot = window.CENTRAL_DASHBOARD_SNAPSHOT;
    if (!snapshot?.players || !snapshot?.results) return [];
    return snapshot.players.map((player, index) => ({ player, result: snapshot.results[index] })).filter(({ result }) => result);
  }

  async function fetchJson(url, timeout = 8000) {
    const controller = new AbortController();
    const stop = setTimeout(() => controller.abort(), timeout);
    try {
      const response = await fetch(`${url}${url.includes('?') ? '&' : '?'}_=${Date.now()}`, {
        cache: 'no-store',
        headers: { Accept: 'application/json', 'Cache-Control': 'no-cache' },
        signal: controller.signal
      });
      if (!response.ok) throw new Error(`MLB ${response.status}`);
      return response.json();
    } finally {
      clearTimeout(stop);
    }
  }

  function idSet(currentPairs) {
    return new Set(currentPairs.map(({ player }) => Number(player.id)).filter(Boolean));
  }

  function playersSeenInFeed(feed, ids) {
    const seen = new Map();
    const plays = feed?.liveData?.plays;
    const all = [...(plays?.allPlays || [])];
    if (plays?.currentPlay) all.push(plays.currentPlay);

    for (const play of all) {
      const batter = Number(play?.matchup?.batter?.id || 0);
      const pitcher = Number(play?.matchup?.pitcher?.id || 0);
      if (ids.has(batter)) seen.set(batter, { current: play === plays?.currentPlay, role: 'hitting' });
      if (ids.has(pitcher)) seen.set(pitcher, { current: play === plays?.currentPlay, role: 'pitching' });
    }
    return seen;
  }

  function liveStat(feed, player) {
    const key = `ID${player.id}`;
    const entry = feed?.liveData?.boxscore?.teams?.home?.players?.[key] || feed?.liveData?.boxscore?.teams?.away?.players?.[key];
    if (!entry) return {};
    return player.group === 'pitching' ? (entry.stats?.pitching || {}) : (entry.stats?.batting || entry.stats?.hitting || {});
  }

  const num = value => Number(value || 0);
  function statLine(player, stat) {
    if (player.group === 'pitching') {
      return `${stat.inningsPitched ?? '0'} IP · ${num(stat.hits)} H · ${num(stat.earnedRuns)} ER · ${num(stat.baseOnBalls)} BB · ${num(stat.strikeOuts)} K`;
    }
    return `${num(stat.hits)}-${num(stat.atBats)}${stat.plateAppearances != null ? ` · ${stat.plateAppearances} PA` : ''}`;
  }

  function markLive(player, result, feed, presence) {
    const stat = liveStat(feed, player);
    const gamePk = Number(feed?.gamePk || feed?.gameData?.game?.pk);
    result.today = {
      ...(result.today || {}),
      date: result.today?.date || gameTaiwanDate({ gameDate: feed?.gameData?.datetime?.dateTime || feed?.gameData?.datetime?.officialDate }),
      stat: { ...stat },
      game: { gamePk },
      live: true,
      onGame: true
    };

    const label = presence.current ? 'LIVE · 現在場上' : 'LIVE · 已上場';
    const line = statLine(player, stat);
    const summary = document.querySelector(`a[href="#player-${player.id}"] .summary-today`);
    if (summary) summary.textContent = `${label} · ${line}`;
    const detail = document.querySelector(`#player-${player.id} .today-detail`);
    if (detail) {
      const strong = detail.querySelector('strong');
      const text = detail.querySelector('p');
      if (strong) strong.textContent = label;
      if (text) text.textContent = line;
    }
  }

  function shouldScanGame(game, now) {
    const state = game?.status?.abstractGameState;
    const detailed = String(game?.status?.detailedState || '').toLowerCase();
    const startAt = new Date(game?.gameDate || 0).getTime();
    const age = now.getTime() - startAt;
    if (state === 'Live') return true;
    if (/in progress|warmup|delayed|manager challenge|review/.test(detailed)) return true;
    if (startAt && age >= -5 * 60_000 && age <= 6 * 60 * 60_000 && state !== 'Preview') return true;
    // Some MiLB schedules lag in status; once scheduled start has passed, allow a short fallback window.
    if (startAt && age >= 0 && age <= 4 * 60 * 60_000) return true;
    return false;
  }

  async function scan() {
    if (running || document.hidden) return;
    running = true;
    let activeGames = 0;
    try {
      const now = new Date();
      const currentPairs = trackedPairs();
      const trackedIds = idSet(currentPairs);
      if (!trackedIds.size) return;
      const { start, end } = scheduleQueryWindow(now);

      const schedules = await Promise.allSettled(SPORT_IDS.map(async sportId => {
        const data = await fetchJson(`${API}/schedule?sportId=${sportId}&startDate=${start}&endDate=${end}`);
        return (data.dates || []).flatMap(date => date.games || []).filter(game => isTaiwanTodayGame(game, now));
      }));

      const games = new Map();
      for (const item of schedules) {
        if (item.status !== 'fulfilled') continue;
        for (const game of item.value) {
          if (game?.gamePk && shouldScanGame(game, now)) games.set(Number(game.gamePk), game);
        }
      }
      activeGames = games.size;

      const feeds = await Promise.allSettled([...games.keys()].map(async gamePk => ({
        gamePk,
        feed: await fetchJson(`${LIVE_API}/game/${gamePk}/feed/live`, 10_000)
      })));

      const pairById = new Map(currentPairs.map(pair => [Number(pair.player.id), pair]));
      let matched = 0;
      for (const item of feeds) {
        if (item.status !== 'fulfilled') continue;
        const seen = playersSeenInFeed(item.value.feed, trackedIds);
        for (const [playerId, presence] of seen) {
          const pair = pairById.get(playerId);
          if (!pair) continue;
          markLive(pair.player, pair.result, item.value.feed, presence);
          matched += 1;
        }
      }

      const count = currentPairs.filter(({ result }) => result.today?.onGame || result.today?.stat).length;
      const countNode = document.querySelector('#today-count');
      if (countNode) countNode.textContent = String(count);
      if (matched > 0) {
        const lastUpdate = document.querySelector('#last-update');
        if (lastUpdate) lastUpdate.textContent = `Gameday 全層級 LIVE 已確認 · ${new Intl.DateTimeFormat('zh-TW', { timeZone: 'Asia/Taipei', hour: '2-digit', minute: '2-digit', hour12: false }).format(now)}`;
      }
      window.dispatchEvent(new CustomEvent('tracker:gameday-universe', { detail: { games: games.size, matched } }));
    } catch (error) {
      console.warn('Sport-wide Gameday scan failed', error);
    } finally {
      running = false;
      clearTimeout(timer);
      timer = setTimeout(scan, activeGames ? 45_000 : 90_000);
    }
  }

  document.querySelector('#refresh-btn')?.addEventListener('click', () => setTimeout(scan, 750));
  document.addEventListener('visibilitychange', () => { if (!document.hidden) scan(); });
  scan();
})();
