(() => {
  const btn = document.querySelector('#refresh-btn');
  const lastUpdate = document.querySelector('#last-update');
  const timeLogic = window.TaiwanGameTime;
  if (!btn || !timeLogic) return;

  const API = 'https://statsapi.mlb.com/api/v1';
  const LIVE_API = 'https://statsapi.mlb.com/api/v1.1';
  const LIVE_MS = 60 * 1000;
  const DISCOVERY_MS = 3 * 60 * 1000;
  const NEAR_GAME_MS = 2 * 60 * 1000;
  const NEAR_WINDOW_MS = 30 * 60 * 1000;
  let refreshing = false;
  let discovering = false;
  let discoveryTimer = null;
  let liveTimer = null;

  const { scheduleQueryWindow, isTaiwanTodayGame } = timeLogic;
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

  function knownGamePairs() {
    return currentPairs().filter(({ result }) => result?.today?.game?.gamePk);
  }

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

  async function fetchLiveGame(gamePk) {
    return fetchJson(`${LIVE_API}/game/${gamePk}/feed/live`);
  }

  function playerEntry(feed, player) {
    const key = `ID${player.id}`;
    const home = feed?.liveData?.boxscore?.teams?.home?.players?.[key];
    if (home) return { boxPlayer: home, side: 'home' };
    const away = feed?.liveData?.boxscore?.teams?.away?.players?.[key];
    if (away) return { boxPlayer: away, side: 'away' };
    return null;
  }

  function recentGameFromFeed(player, stat, feed, side, isLive) {
    const gamePk = Number(feed?.gamePk || feed?.gameData?.game?.pk);
    const gameDate = feed?.gameData?.datetime?.officialDate || new Date().toISOString().slice(0, 10);
    const home = feed?.gameData?.teams?.home;
    const away = feed?.gameData?.teams?.away;
    const opponent = side === 'home' ? away : home;
    const team = side === 'home' ? home : away;
    return {
      date: gameDate,
      level: null,
      stat: { ...stat },
      team: team?.id ? { id: team.id, name: team.name } : undefined,
      opponent: opponent?.id ? { id: opponent.id, name: opponent.name } : undefined,
      game: { gamePk },
      live: isLive
    };
  }

  function mergeRecentGame(result, currentGame) {
    const gamePk = Number(currentGame?.game?.gamePk);
    const previous = Array.isArray(result.games) ? result.games : [];
    const merged = [currentGame, ...previous.filter(game => Number(game?.game?.gamePk) !== gamePk)];
    result.games = merged.slice(0, 5);
    result.latest = result.games[0] || result.latest;
  }

  function repaintLastFive(player, result) {
    const card = document.querySelector(`#player-${player.id}`);
    if (!card || typeof gameRows !== 'function') return;
    const section = card.querySelector('.last-five');
    if (!section) return;
    const existing = section.querySelector('.game-table, .empty');
    const holder = document.createElement('div');
    holder.innerHTML = gameRows(player, result.games || []);
    const replacement = holder.firstElementChild;
    if (!replacement) return;
    if (result.today?.live) {
      const firstResult = replacement.querySelector('.game-row:not(.game-head) span:nth-child(2)');
      if (firstResult) firstResult.textContent = 'LIVE';
    }
    if (existing) existing.replaceWith(replacement); else section.appendChild(replacement);
  }

  function repaintPlayer(player, result, feed) {
    const entry = playerEntry(feed, player);
    if (!entry) return false;
    const stat = player.group === 'pitching'
      ? (entry.boxPlayer.stats?.pitching || {})
      : (entry.boxPlayer.stats?.batting || entry.boxPlayer.stats?.hitting || {});
    if (!liveAppearance(player, stat)) return false;

    const state = feed?.gameData?.status?.abstractGameState;
    const isLive = state === 'Live';
    const gamePk = Number(feed?.gamePk || feed?.gameData?.game?.pk);
    result.today = {
      ...(result.today || {}),
      date: feed?.gameData?.datetime?.officialDate || result.today?.date,
      level: result.today?.level || result.latest?.level || '—',
      stat: { ...stat },
      game: { gamePk },
      live: isLive
    };

    const currentGame = recentGameFromFeed(player, stat, feed, entry.side, isLive);
    currentGame.level = result.today.level;
    mergeRecentGame(result, currentGame);

    const summary = document.querySelector(`a[href="#player-${player.id}"] .summary-today`);
    if (summary) summary.textContent = `${line(player, stat)}${isLive ? ' · LIVE' : ''}`;

    const detail = document.querySelector(`#player-${player.id} .today-detail`);
    if (detail) {
      const strong = detail.querySelector('strong');
      const p = detail.querySelector('p');
      if (strong) strong.textContent = isLive ? 'LIVE · 已出賽' : '已出賽';
      if (p) p.textContent = line(player, stat);
    }
    repaintLastFive(player, result);
    return true;
  }

  async function refreshFeeds(gameIds, { quiet = false } = {}) {
    const ids = [...new Set(gameIds.map(Number).filter(Boolean))];
    if (!ids.length) return { feeds: new Map(), updated: 0 };
    const settled = await Promise.allSettled(ids.map(async gamePk => [gamePk, await fetchLiveGame(gamePk)]));
    const feeds = new Map();
    for (const item of settled) if (item.status === 'fulfilled') feeds.set(item.value[0], item.value[1]);
    if (!feeds.size) throw new Error('目前比賽即時資料暫時無法取得');

    let updated = 0;
    for (const { player, result } of currentPairs()) {
      for (const feed of feeds.values()) {
        if (repaintPlayer(player, result, feed)) { updated += 1; break; }
      }
    }
    window.dispatchEvent(new CustomEvent('tracker:live-fast-refresh', { detail: { updated, games: feeds.size } }));
    if (!quiet && lastUpdate) lastUpdate.textContent = `MLB Live 已更新 · ${formatTime(Date.now())}`;
    return { feeds, updated };
  }

  async function refreshKnownGames({ quiet = false } = {}) {
    const ids = knownGamePairs().map(({ result }) => result.today.game.gamePk);
    if (!ids.length) return false;
    return refreshFeeds(ids, { quiet }).then(() => true);
  }

  function teamCandidates(extraTeamIds = new Map()) {
    const candidates = [];
    for (const pair of currentPairs()) {
      const { player, result } = pair;
      const teamIds = [
        extraTeamIds.get(Number(player.id)),
        result.today?.team?.id,
        result.latest?.team?.id,
        ...(Array.isArray(result.games) ? result.games.slice(0, 5).map(game => game?.team?.id) : [])
      ];
      for (const teamId of teamIds.map(Number).filter(Boolean)) candidates.push({ player, result, teamId });
    }
    return candidates;
  }

  async function fetchCurrentTeams() {
    const pairs = currentPairs();
    const settled = await Promise.allSettled(pairs.map(async ({ player }) => {
      const person = await fetchJson(`${API}/people/${player.id}?hydrate=currentTeam`);
      return [Number(player.id), Number(person.people?.[0]?.currentTeam?.id || 0)];
    }));
    const map = new Map();
    for (const item of settled) {
      if (item.status !== 'fulfilled') continue;
      const [playerId, teamId] = item.value;
      if (playerId && teamId) map.set(playerId, teamId);
    }
    return map;
  }

  async function discoverGames({ quiet = true, refreshTeams = false } = {}) {
    if (discovering || document.hidden) return { nearGame: false, foundLive: false };
    discovering = true;
    try {
      const now = new Date();
      const { start, end } = scheduleQueryWindow(now);
      const extraTeamIds = refreshTeams ? await fetchCurrentTeams() : new Map();
      const candidates = teamCandidates(extraTeamIds);
      const uniqueTeams = [...new Set(candidates.map(item => Number(item.teamId)).filter(Boolean))];
      const settled = await Promise.allSettled(uniqueTeams.map(async teamId => {
        const json = await fetchJson(`${API}/schedule?teamId=${teamId}&startDate=${start}&endDate=${end}`);
        return (json.dates || []).flatMap(date => date.games || []).filter(game => isTaiwanTodayGame(game, now));
      }));

      const liveIds = new Set();
      let nearGame = false;
      for (const entry of settled) {
        if (entry.status !== 'fulfilled') continue;
        for (const game of entry.value) {
          const state = game.status?.abstractGameState;
          const startAt = new Date(game.gameDate || 0).getTime();
          if (startAt && Math.abs(startAt - now.getTime()) <= NEAR_WINDOW_MS) nearGame = true;
          if ((state === 'Live' || state === 'Final') && game.gamePk) liveIds.add(Number(game.gamePk));
        }
      }

      if (liveIds.size) await refreshFeeds([...liveIds], { quiet });
      if (!quiet && !liveIds.size && lastUpdate) lastUpdate.textContent = `MLB 官方賽程已確認 · ${formatTime(Date.now())}`;
      return { nearGame, foundLive: liveIds.size > 0 };
    } catch (error) {
      console.warn('Game discovery failed', error);
      if (!quiet && lastUpdate) lastUpdate.textContent = `賽程檢查失敗 · 可再次按更新 · ${formatTime(Date.now())}`;
      return { nearGame: false, foundLive: false };
    } finally {
      discovering = false;
    }
  }

  function scheduleDiscovery(delay = DISCOVERY_MS) {
    clearTimeout(discoveryTimer);
    discoveryTimer = setTimeout(async () => {
      const { nearGame } = await discoverGames({ quiet: true });
      scheduleDiscovery(nearGame ? NEAR_GAME_MS : DISCOVERY_MS);
    }, delay);
  }

  function startLiveLoop() {
    clearInterval(liveTimer);
    liveTimer = setInterval(() => {
      if (!document.hidden && knownGamePairs().some(({ result }) => result.today?.live)) {
        refreshKnownGames({ quiet: true }).catch(() => {});
      }
    }, LIVE_MS);
  }

  btn.addEventListener('click', async event => {
    event.preventDefault();
    if (refreshing) return;
    refreshing = true;
    btn.disabled = true;
    btn.setAttribute('aria-busy', 'true');
    if (lastUpdate) lastUpdate.textContent = '正在直接向 MLB 確認最新資料…';
    try {
      const discovery = await discoverGames({ quiet: false, refreshTeams: true });
      if (!discovery.foundLive) await refreshKnownGames({ quiet: false }).catch(() => false);
      // Team metadata can lag immediately after a promotion or reassignment.
      // The sport-wide scan is the authoritative fallback because it finds the
      // tracked player by MLB ID in every active MLB/MiLB Gameday feed.
      if (typeof window.TaiwanMlbUniverseScan === 'function') {
        await window.TaiwanMlbUniverseScan({ force: true });
      }
    } finally {
      refreshing = false;
      btn.disabled = false;
      btn.removeAttribute('aria-busy');
    }
  }, true);

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) discoverGames({ quiet: true }).then(({ nearGame }) => scheduleDiscovery(nearGame ? NEAR_GAME_MS : DISCOVERY_MS));
  });

  startLiveLoop();
  scheduleDiscovery(15 * 1000);
  window.addEventListener('pagehide', () => {
    clearInterval(liveTimer);
    clearTimeout(discoveryTimer);
  }, { once: true });
})();
