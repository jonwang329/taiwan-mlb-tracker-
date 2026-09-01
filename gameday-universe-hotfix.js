(() => {
  const API = 'https://statsapi.mlb.com/api/v1';
  const LIVE_API = 'https://statsapi.mlb.com/api/v1.1';
  const timeLogic = window.TaiwanGameTime;
  if (!timeLogic) return;

  const { scheduleQueryWindow, isTaiwanTodayGame, gameTaiwanDate } = timeLogic;
  let running = false;
  let queuedForce = false;
  let timer = null;

  function trackedPairs() {
    if (typeof players !== 'undefined' && typeof lastResults !== 'undefined' && Array.isArray(players) && Array.isArray(lastResults) && players.length && lastResults.length) {
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

  function currentMlbTeamIds(currentPairs) {
    const ids = new Set();
    for (const { result } of currentPairs) {
      const level = result?.currentStatus?.level || result?.latest?.level || result?.today?.level;
      const teamId = Number(result?.currentStatus?.teamId || result?.latest?.team?.id || result?.today?.team?.id || 0);
      if (level === 'MLB' && teamId) ids.add(teamId);
    }
    return [...ids];
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

  function playersInPublishedLineup(feed, ids) {
    const found = new Map();
    const teams = feed?.liveData?.boxscore?.teams || {};
    for (const side of ['away', 'home']) {
      for (const entry of Object.values(teams?.[side]?.players || {})) {
        const playerId = Number(entry?.person?.id || 0);
        const battingOrder = Number(entry?.battingOrder || 0);
        const isStarter = Boolean(battingOrder || entry?.gameStatus?.isStarter);
        if (!ids.has(playerId) || !isStarter) continue;
        found.set(playerId, {
          battingOrder,
          position: entry?.position?.abbreviation || entry?.position?.name || ''
        });
      }
    }
    return found;
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

  function markScheduled(player, result, feed, lineup) {
    if (result.today?.onGame) return;
    const gamePk = Number(feed?.gamePk || feed?.gameData?.game?.pk);
    result.today = {
      date: gameTaiwanDate({ gameDate: feed?.gameData?.datetime?.dateTime || feed?.gameData?.datetime?.officialDate }),
      stat: {},
      game: { gamePk },
      live: false,
      scheduled: true,
      onGame: false,
      battingOrder: lineup.battingOrder,
      position: lineup.position
    };
    const spot = lineup.battingOrder ? Math.ceil(lineup.battingOrder / 100) : 0;
    const label = player.group === 'pitching'
      ? '預定先發投手'
      : `先發已確認${spot ? ` · 第 ${spot} 棒` : ''}${lineup.position ? ` · ${lineup.position}` : ''}`;
    const summary = document.querySelector(`a[href="#player-${player.id}"] .summary-today`);
    if (summary) summary.textContent = label;
    const detail = document.querySelector(`#player-${player.id} .today-detail`);
    if (detail) {
      const strong = detail.querySelector('strong');
      const text = detail.querySelector('p');
      if (strong) strong.textContent = '先發已確認';
      if (text) text.textContent = label;
    }
  }

  function shouldScanGame(game, now, force = false, sportId = 0) {
    const state = game?.status?.abstractGameState;
    const detailed = String(game?.status?.detailedState || '').toLowerCase();
    const startAt = new Date(game?.gameDate || 0).getTime();
    const age = now.getTime() - startAt;
    if (force && state !== 'Preview') return true;
    if (sportId === 1 && state === 'Preview' && startAt && age >= -12 * 60 * 60_000 && age <= 0) return true;
    if (state === 'Live') return true;
    if (/in progress|warmup|delayed|manager challenge|review/.test(detailed)) return true;
    if (startAt && age >= -5 * 60_000 && age <= 6 * 60 * 60_000 && state !== 'Preview') return true;
    if (startAt && age >= 0 && age <= 4 * 60 * 60_000) return true;
    return false;
  }

  async function scan({ force = false } = {}) {
    if (running) {
      if (force) queuedForce = true;
      return { skipped: true, queued: force };
    }
    if (document.hidden && !force) return { skipped: true };
    running = true;
    let activeGames = 0;
    try {
      const now = new Date();
      const currentPairs = trackedPairs();
      const trackedIds = idSet(currentPairs);
      if (!trackedIds.size) return;
      const { start, end } = scheduleQueryWindow(now);
      const mlbTeamIds = currentMlbTeamIds(currentPairs);

      const teamFilter = mlbTeamIds.length ? `&teamId=${mlbTeamIds.join(',')}` : '';
      const schedules = await Promise.allSettled([1].map(async sportId => {
        const data = await fetchJson(`${API}/schedule?sportId=${sportId}${teamFilter}&startDate=${start}&endDate=${end}`);
        return { sportId, games: (data.dates || []).flatMap(date => date.games || []).filter(game => isTaiwanTodayGame(game, now)) };
      }));
      const scheduleSuccesses = schedules.filter(item => item.status === 'fulfilled').length;

      const games = new Map();
      for (const item of schedules) {
        if (item.status !== 'fulfilled') continue;
        for (const game of item.value.games) {
          if (game?.gamePk && shouldScanGame(game, now, force, item.value.sportId)) games.set(Number(game.gamePk), game);
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
        const lineups = playersInPublishedLineup(item.value.feed, trackedIds);
        for (const [playerId, lineup] of lineups) {
          const pair = pairById.get(playerId);
          if (!pair) continue;
          markScheduled(pair.player, pair.result, item.value.feed, lineup);
          matched += 1;
        }
        const seen = playersSeenInFeed(item.value.feed, trackedIds);
        for (const [playerId, presence] of seen) {
          const pair = pairById.get(playerId);
          if (!pair) continue;
          markLive(pair.player, pair.result, item.value.feed, presence);
          matched += 1;
        }
      }

      const count = currentPairs.filter(({ result }) => result.today?.scheduled || result.today?.onGame || result.today?.stat).length;
      const countNode = document.querySelector('#today-count');
      if (countNode) countNode.textContent = String(count);
      if (matched > 0) {
        const lastUpdate = document.querySelector('#last-update');
        if (lastUpdate) lastUpdate.textContent = `Gameday 全層級 LIVE 已確認 · ${new Intl.DateTimeFormat('zh-TW', { timeZone: 'Asia/Taipei', hour: '2-digit', minute: '2-digit', hour12: false }).format(now)}`;
      }
      window.dispatchEvent(new CustomEvent('tracker:gameday-universe', { detail: { games: games.size, matched, scheduleSuccesses } }));
      return { games: games.size, matched, scheduleSuccesses };
    } catch (error) {
      console.warn('Sport-wide Gameday scan failed', error);
      return { games: 0, matched: 0, error: error.message };
    } finally {
      running = false;
      clearTimeout(timer);
      if (queuedForce) {
        queuedForce = false;
        timer = setTimeout(() => scan({ force: true }), 0);
      } else timer = setTimeout(() => scan(), activeGames ? 20_000 : 60_000);
    }
  }

  window.TaiwanMlbUniverseScan = scan;
  document.addEventListener('visibilitychange', () => { if (!document.hidden) scan(); });
  scan();
})();
