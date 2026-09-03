(() => {
  const API = 'https://statsapi.mlb.com/api/v1';
  const LIVE_API = 'https://statsapi.mlb.com/api/v1.1';
  const timeLogic = window.TaiwanGameTime;
  const lastUpdate = document.querySelector('#last-update');
  if (!timeLogic) return;

  const { scheduleQueryWindow, isTaiwanTodayGame, gameTaiwanDate } = timeLogic;
  let timer = null;
  let running = false;

  const num = value => Number(value || 0);
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

  async function fetchJson(url, timeout = 7000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
      const response = await fetch(`${url}${url.includes('?') ? '&' : '?'}_=${Date.now()}`, {
        cache: 'no-store',
        headers: { Accept: 'application/json', 'Cache-Control': 'no-cache' },
        signal: controller.signal
      });
      if (!response.ok) throw new Error(`MLB ${response.status}`);
      return response.json();
    } finally {
      clearTimeout(timer);
    }
  }

  function teamIdsFor(result) {
    return [...new Set([
      result.today?.team?.id,
      result.latest?.team?.id,
      ...(Array.isArray(result.games) ? result.games.slice(0, 5).map(game => game?.team?.id) : [])
    ].map(Number).filter(Boolean))];
  }

  function playerInPlay(play, player) {
    const id = Number(player.id);
    const matchup = play?.matchup || {};
    if (player.group === 'pitching') return Number(matchup.pitcher?.id) === id;
    return Number(matchup.batter?.id) === id;
  }

  function playerPresence(feed, player) {
    const currentPlay = feed?.liveData?.plays?.currentPlay;
    if (playerInPlay(currentPlay, player)) return { present: true, current: true, play: currentPlay };
    const allPlays = feed?.liveData?.plays?.allPlays || [];
    for (let i = allPlays.length - 1; i >= 0; i -= 1) {
      if (playerInPlay(allPlays[i], player)) return { present: true, current: false, play: allPlays[i] };
    }
    return { present: false, current: false, play: null };
  }

  function boxPlayer(feed, player) {
    const key = `ID${player.id}`;
    return feed?.liveData?.boxscore?.teams?.home?.players?.[key] || feed?.liveData?.boxscore?.teams?.away?.players?.[key] || null;
  }

  function liveStat(feed, player) {
    const entry = boxPlayer(feed, player);
    if (!entry) return {};
    return player.group === 'pitching'
      ? (entry.stats?.pitching || {})
      : (entry.stats?.batting || entry.stats?.hitting || {});
  }

  function statLine(player, stat = {}) {
    return window.TaiwanTodayStatLine(player, stat);
  }

  function markUpcoming(player, result, game) {
    if (result.today?.stat || result.today?.live) return;
    result.today = {
      ...(result.today || {}),
      date: gameTaiwanDate(game),
      game: { gamePk: game.gamePk },
      team: result.today?.team || result.latest?.team,
      scheduled: true,
      live: false
    };
    const summary = document.querySelector(`a[href="#player-${player.id}"] .summary-today`);
    const start = game.gameDate ? formatTime(game.gameDate) : '';
    if (summary && (!summary.textContent || /未出賽|無出賽|—/.test(summary.textContent))) summary.textContent = `今日有賽${start ? ` · ${start}` : ''}`;
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
    const summary = document.querySelector(`a[href="#player-${player.id}"] .summary-today`);
    if (summary) summary.textContent = `${statLine(player, stat)} · LIVE`;

    const detail = document.querySelector(`#player-${player.id} .today-detail`);
    if (detail) {
      const strong = detail.querySelector('strong');
      const p = detail.querySelector('p');
      if (strong) strong.textContent = label;
      if (p) p.textContent = statLine(player, stat);
    }
    return true;
  }

  function updateTodayCount() {
    const count = currentPairs().filter(({ result }) => result.today?.onGame || result.today?.stat).length;
    const node = document.querySelector('#today-count');
    if (node) node.textContent = String(count);
  }

  async function cycle({ force = false } = {}) {
    if (running || document.hidden) return;
    running = true;
    let hasActiveGame = false;
    let livePlayers = 0;
    try {
      const now = new Date();
      const { start, end } = scheduleQueryWindow(now);
      const pairs = currentPairs();
      const teamMap = new Map();
      for (const pair of pairs) {
        for (const teamId of teamIdsFor(pair.result)) {
          if (!teamMap.has(teamId)) teamMap.set(teamId, []);
          teamMap.get(teamId).push(pair);
        }
      }

      const scheduleResults = await Promise.allSettled([...teamMap.keys()].map(async teamId => {
        const data = await fetchJson(`${API}/schedule?teamId=${teamId}&startDate=${start}&endDate=${end}`);
        return {
          teamId,
          games: (data.dates || []).flatMap(date => date.games || []).filter(game => isTaiwanTodayGame(game, now))
        };
      }));

      const games = new Map();
      for (const item of scheduleResults) {
        if (item.status !== 'fulfilled') continue;
        for (const game of item.value.games) if (game.gamePk) games.set(Number(game.gamePk), game);
      }

      for (const [gamePk, game] of games) {
        const gameTeams = [Number(game.teams?.home?.team?.id), Number(game.teams?.away?.team?.id)].filter(Boolean);
        const related = pairs.filter(({ result }) => teamIdsFor(result).some(id => gameTeams.includes(id)));
        for (const { player, result } of related) markUpcoming(player, result, game);

        const state = game.status?.abstractGameState;
        const startAt = new Date(game.gameDate || 0).getTime();
        const shouldReadFeed = force || state === 'Live' || state === 'Final' || (startAt && startAt <= now.getTime() + 2 * 60 * 1000);
        if (!shouldReadFeed) continue;
        hasActiveGame = hasActiveGame || state === 'Live' || (startAt && startAt <= now.getTime());

        try {
          const feed = await fetchJson(`${LIVE_API}/game/${gamePk}/feed/live`);
          for (const { player, result } of related) {
            const presence = playerPresence(feed, player);
            if (presence.present && markLive(player, result, feed, presence)) livePlayers += 1;
          }
        } catch (error) {
          console.warn('Gameday feed unavailable', gamePk, error);
        }
      }

      updateTodayCount();
      window.dispatchEvent(new CustomEvent('tracker:gameday-presence', { detail: { games: games.size, livePlayers } }));
      if (lastUpdate && livePlayers > 0) lastUpdate.textContent = `Gameday LIVE 已確認 · ${formatTime(Date.now())}`;
    } catch (error) {
      console.warn('Gameday presence cycle failed', error);
    } finally {
      running = false;
      clearTimeout(timer);
      timer = setTimeout(() => cycle(), hasActiveGame ? 20 * 1000 : 60 * 1000);
    }
  }

  const refresh = document.querySelector('#refresh-btn');
  refresh?.addEventListener('click', () => setTimeout(() => cycle({ force: true }), 250), false);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) cycle({ force: true }); });
  cycle({ force: true });
})();
