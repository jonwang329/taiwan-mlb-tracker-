(() => {
  const API = 'https://statsapi.mlb.com/api/v1';
  const LIVE_API = 'https://statsapi.mlb.com/api/v1.1';
  const timeLogic = window.TaiwanGameTime;
  if (!timeLogic) return;

  const { scheduleQueryWindow, isTaiwanTodayGame, gameTaiwanDate } = timeLogic;
  let running = false;
  let timer = null;

  const num = value => Number(value || 0);
  const formatTime = value => new Intl.DateTimeFormat('zh-TW', {
    timeZone: 'Asia/Taipei', hour: '2-digit', minute: '2-digit', hour12: false
  }).format(new Date(value));

  function pairs() {
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

  async function freshCurrentTeams(currentPairs) {
    const settled = await Promise.allSettled(currentPairs.map(async ({ player }) => {
      const person = await fetchJson(`${API}/people/${player.id}?hydrate=currentTeam`);
      const team = person.people?.[0]?.currentTeam;
      return { playerId: Number(player.id), teamId: Number(team?.id || 0), teamName: team?.name || '' };
    }));
    const teams = new Map();
    for (const item of settled) {
      if (item.status !== 'fulfilled' || !item.value.teamId) continue;
      teams.set(item.value.playerId, item.value);
    }
    return teams;
  }

  function presence(feed, player) {
    const id = Number(player.id);
    const plays = feed?.liveData?.plays;
    const current = plays?.currentPlay;
    const match = play => player.group === 'pitching'
      ? Number(play?.matchup?.pitcher?.id) === id
      : Number(play?.matchup?.batter?.id) === id;
    if (match(current)) return { found: true, current: true };
    const all = plays?.allPlays || [];
    for (let i = all.length - 1; i >= 0; i -= 1) if (match(all[i])) return { found: true, current: false };
    return { found: false, current: false };
  }

  function liveStat(feed, player) {
    const key = `ID${player.id}`;
    const entry = feed?.liveData?.boxscore?.teams?.home?.players?.[key] || feed?.liveData?.boxscore?.teams?.away?.players?.[key];
    if (!entry) return {};
    return player.group === 'pitching' ? (entry.stats?.pitching || {}) : (entry.stats?.batting || entry.stats?.hitting || {});
  }

  function statLine(player, stat) {
    if (player.group === 'pitching') return `${stat.inningsPitched ?? '0'} IP · ${num(stat.hits)} H · ${num(stat.earnedRuns)} ER · ${num(stat.baseOnBalls)} BB · ${num(stat.strikeOuts)} K`;
    return `${num(stat.hits)}-${num(stat.atBats)}${stat.plateAppearances != null ? ` · ${stat.plateAppearances} PA` : ''}`;
  }

  function markUpcoming(player, result, game, team) {
    if (result.today?.onGame || result.today?.stat) return;
    result.today = {
      ...(result.today || {}), date: gameTaiwanDate(game), game: { gamePk: game.gamePk },
      team: team?.teamId ? { id: team.teamId, name: team.teamName } : result.today?.team,
      scheduled: true, live: false
    };
    const node = document.querySelector(`a[href="#player-${player.id}"] .summary-today`);
    if (node && (!node.textContent || /未出賽|無出賽|—/.test(node.textContent))) node.textContent = `今日有賽 · ${formatTime(game.gameDate)}`;
  }

  function markLive(player, result, feed, p, team) {
    const stat = liveStat(feed, player);
    const gamePk = Number(feed?.gamePk || feed?.gameData?.game?.pk);
    result.today = {
      ...(result.today || {}),
      date: result.today?.date || gameTaiwanDate({ gameDate: feed?.gameData?.datetime?.dateTime || feed?.gameData?.datetime?.officialDate }),
      stat: { ...stat }, game: { gamePk }, live: true, onGame: true,
      team: team?.teamId ? { id: team.teamId, name: team.teamName } : result.today?.team
    };
    const label = p.current ? 'LIVE · 現在場上' : 'LIVE · 已上場';
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

  async function scan({ force = false } = {}) {
    if (running || document.hidden) return;
    running = true;
    let active = false;
    try {
      const now = new Date();
      const currentPairs = pairs();
      const currentTeams = await freshCurrentTeams(currentPairs);
      const { start, end } = scheduleQueryWindow(now);
      const uniqueTeamIds = [...new Set([...currentTeams.values()].map(item => item.teamId).filter(Boolean))];
      const schedules = await Promise.allSettled(uniqueTeamIds.map(async teamId => {
        const data = await fetchJson(`${API}/schedule?teamId=${teamId}&startDate=${start}&endDate=${end}`);
        return (data.dates || []).flatMap(date => date.games || []).filter(game => isTaiwanTodayGame(game, now));
      }));
      const games = new Map();
      for (const item of schedules) if (item.status === 'fulfilled') for (const game of item.value) if (game.gamePk) games.set(Number(game.gamePk), game);

      for (const game of games.values()) {
        const gameTeams = [Number(game.teams?.home?.team?.id), Number(game.teams?.away?.team?.id)].filter(Boolean);
        const related = currentPairs.filter(({ player }) => gameTeams.includes(currentTeams.get(Number(player.id))?.teamId));
        for (const { player, result } of related) markUpcoming(player, result, game, currentTeams.get(Number(player.id)));
        const state = game.status?.abstractGameState;
        const startAt = new Date(game.gameDate || 0).getTime();
        const read = force || state === 'Live' || state === 'Final' || (startAt && startAt <= now.getTime() + 2 * 60 * 1000);
        if (!read) continue;
        active = active || state === 'Live' || (startAt && startAt <= now.getTime());
        try {
          const feed = await fetchJson(`${LIVE_API}/game/${game.gamePk}/feed/live`);
          for (const { player, result } of related) {
            const p = presence(feed, player);
            if (p.found) markLive(player, result, feed, p, currentTeams.get(Number(player.id)));
          }
        } catch (error) {
          console.warn('Fresh-team Gameday feed unavailable', game.gamePk, error);
        }
      }

      const count = currentPairs.filter(({ result }) => result.today?.onGame || result.today?.stat).length;
      const countNode = document.querySelector('#today-count');
      if (countNode) countNode.textContent = String(count);
      window.dispatchEvent(new CustomEvent('tracker:gameday-current-team', { detail: { teams: uniqueTeamIds.length, games: games.size } }));
    } catch (error) {
      console.warn('Fresh current-team Gameday scan failed', error);
    } finally {
      running = false;
      clearTimeout(timer);
      timer = setTimeout(() => scan(), active ? 20_000 : 60_000);
    }
  }

  document.querySelector('#refresh-btn')?.addEventListener('click', () => setTimeout(() => scan({ force: true }), 500));
  document.addEventListener('visibilitychange', () => { if (!document.hidden) scan({ force: true }); });
  scan({ force: true });
})();
