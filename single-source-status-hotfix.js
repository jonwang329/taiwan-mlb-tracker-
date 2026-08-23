(() => {
  const API = 'https://statsapi.mlb.com/api/v1';
  const LIVE_API = 'https://statsapi.mlb.com/api/v1.1';
  const timeLogic = window.TaiwanGameTime;
  const LEVEL_BY_SPORT_ID = new Map([
    [1, 'MLB'], [11, 'AAA'], [12, 'AA'], [13, 'A+'], [14, 'A'], [16, 'Rookie'], [17, 'Rookie']
  ]);

  const cache = new Map();
  const nowIso = () => new Date().toISOString();
  const num = v => Number(v || 0);
  const taiwanDate = value => {
    if (!value) return '';
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return '';
    return timeLogic?.dateInZone
      ? timeLogic.dateInZone(parsed, 'Asia/Taipei')
      : new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit' }).format(parsed);
  };

  async function fetchJson(url, timeout = 8000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
      const r = await fetch(`${url}${url.includes('?') ? '&' : '?'}_=${Date.now()}`, {
        cache: 'no-store',
        headers: { Accept: 'application/json', 'Cache-Control': 'no-cache' },
        signal: controller.signal
      });
      if (!r.ok) throw new Error(`MLB ${r.status}`);
      return r.json();
    } finally {
      clearTimeout(timer);
    }
  }

  async function teamMeta(teamId) {
    const id = num(teamId);
    if (!id) return null;
    const key = `team:${id}`;
    if (cache.has(key)) return cache.get(key);
    const p = (async () => {
      const data = await fetchJson(`${API}/teams/${id}`);
      const t = data.teams?.[0];
      if (!t) return null;
      const sportId = num(t.sport?.id);
      return {
        teamId: id,
        teamName: t.name || '',
        sportId,
        level: LEVEL_BY_SPORT_ID.get(sportId) || t.sport?.name || '—'
      };
    })();
    cache.set(key, p);
    return p;
  }

  function pairs() {
    if (typeof players !== 'undefined' && typeof lastResults !== 'undefined' && Array.isArray(players) && Array.isArray(lastResults)) {
      return players.map((player, index) => ({ player, result: lastResults[index] })).filter(x => x.result);
    }
    const s = window.CENTRAL_DASHBOARD_SNAPSHOT;
    if (!s?.players || !s?.results) return [];
    return s.players.map((player, index) => ({ player, result: s.results[index] })).filter(x => x.result);
  }

  function boxEntry(feed, playerId) {
    const key = `ID${playerId}`;
    return feed?.liveData?.boxscore?.teams?.home?.players?.[key]
      || feed?.liveData?.boxscore?.teams?.away?.players?.[key]
      || null;
  }

  function appeared(feed, player) {
    const e = boxEntry(feed, player.id);
    if (!e) return false;
    const s = player.group === 'pitching' ? (e.stats?.pitching || {}) : (e.stats?.batting || e.stats?.hitting || {});
    return player.group === 'pitching'
      ? num(s.battersFaced) > 0 || num(s.pitchesThrown) > 0 || num(s.inningsPitched) > 0
      : num(s.plateAppearances) > 0 || num(s.atBats) > 0 || num(s.runs) > 0 || num(s.baseOnBalls) > 0 || num(s.hitByPitch) > 0 || num(s.sacFlies) > 0 || num(s.sacBunts) > 0;
  }

  async function currentTeam(player) {
    const data = await fetchJson(`${API}/people/${player.id}?hydrate=currentTeam`);
    const t = data.people?.[0]?.currentTeam;
    if (!t?.id) return null;
    return teamMeta(t.id);
  }

  async function gameTeamAndLevel(gamePk, player) {
    if (!gamePk) return null;
    const key = `game:${gamePk}:player:${player.id}`;
    if (cache.has(key)) return cache.get(key);
    const task = (async () => {
      try {
        const feed = await fetchJson(`${LIVE_API}/game/${gamePk}/feed/live`);
        const e = boxEntry(feed, player.id);
        if (!e) return null;
        const homeHas = !!feed?.liveData?.boxscore?.teams?.home?.players?.[`ID${player.id}`];
        const team = homeHas ? feed?.gameData?.teams?.home : feed?.gameData?.teams?.away;
        if (!team?.id) return null;
        const meta = await teamMeta(team.id);
        const officialTimestamp = feed?.gameData?.datetime?.dateTime || feed?.gameData?.datetime?.originalDate || feed?.gameData?.datetime?.officialDate || '';
        return {
          ...meta,
          gamePk: num(gamePk),
          appeared: appeared(feed, player),
          evidence: 'GAMEDAY',
          officialTimestamp,
          taiwanDate: taiwanDate(officialTimestamp)
        };
      } catch (_) {
        return null;
      }
    })();
    cache.set(key, task);
    return task;
  }

  function setStatus(result, status) {
    if (!status) return;
    result.currentStatus = { ...status, checkedAt: nowIso() };
    if (result.today) {
      if (status.teamId) result.today.team = { id: status.teamId, name: status.teamName };
      if (status.level) result.today.level = status.level;
      if (status.gamePk) result.today.game = { gamePk: status.gamePk };
    }
  }

  function repaintCurrentStatus(player, status) {
    if (!status) return;
    const summaryLevel = document.querySelector(`a[href="#player-${player.id}"] .summary-club b`);
    if (summaryLevel && status.level) summaryLevel.textContent = status.level;
    const detailLevel = document.querySelector(`#player-${player.id} .level`);
    if (detailLevel && status.level) detailLevel.textContent = status.level;
    const summaryClub = document.querySelector(`a[href="#player-${player.id}"] .summary-club small`);
    if (summaryClub && status.teamName) summaryClub.textContent = status.teamName;
    const detailOrg = document.querySelector(`#player-${player.id} header p`);
    if (detailOrg && status.teamName) {
      const role = String(detailOrg.textContent || '').split('·').slice(1).join('·').trim();
      detailOrg.textContent = role ? `${status.teamName} · ${role}` : status.teamName;
    }
  }

  function canonicalGameTime(game) {
    const stamp = game?.officialTimestamp || game?.gameDate || game?.game?.gameDate || '';
    const parsed = stamp ? new Date(stamp).getTime() : NaN;
    if (!Number.isNaN(parsed)) return parsed;
    const dateOnly = game?.date;
    if (dateOnly) {
      const fallback = new Date(`${String(dateOnly).slice(0, 10)}T12:00:00+08:00`).getTime();
      if (!Number.isNaN(fallback)) return fallback;
    }
    return 0;
  }

  function refreshLatest(result) {
    const games = Array.isArray(result.games) ? result.games.filter(g => g?.game?.gamePk) : [];
    games.sort((a, b) => {
      const byTime = canonicalGameTime(b) - canonicalGameTime(a);
      if (byTime) return byTime;
      return num(b?.game?.gamePk) - num(a?.game?.gamePk);
    });
    result.games = games.slice(0, 5);
    result.latest = result.games[0] || result.latest;
  }

  async function resolvePlayer(player, result) {
    const todayPk = num(result.today?.game?.gamePk);
    const live = await gameTeamAndLevel(todayPk, player);
    if (live?.appeared) {
      setStatus(result, live);
      repaintCurrentStatus(player, live);
      return live;
    }

    const cur = await currentTeam(player).catch(() => null);
    if (cur) {
      const status = { ...cur, evidence: 'CURRENT_TEAM' };
      setStatus(result, status);
      repaintCurrentStatus(player, status);
      return status;
    }

    const fallback = {
      teamId: num(result.today?.team?.id || result.latest?.team?.id),
      teamName: result.today?.team?.name || result.latest?.team?.name || '',
      sportId: 0,
      level: result.today?.level || '—',
      evidence: 'CACHE_FALLBACK'
    };
    setStatus(result, fallback);
    repaintCurrentStatus(player, fallback);
    return fallback;
  }

  async function fixGameObject(player, game) {
    if (!game?.game?.gamePk) return;
    const status = await gameTeamAndLevel(game.game.gamePk, player).catch(() => null);
    if (!status) return;
    game.team = status.teamId ? { id: status.teamId, name: status.teamName } : game.team;
    game.level = status.level || game.level;
    game.boxScoreUrl = `https://www.mlb.com/gameday/${status.gamePk}`;
    game.sourceAuthority = 'GAMEDAY';
    if (status.officialTimestamp) {
      game.officialTimestamp = status.officialTimestamp;
      game.gameDate = status.officialTimestamp;
      game.date = status.taiwanDate || game.date;
    }
  }

  function canonicalPkFromAnchor(a) {
    const dataPk = a.dataset?.gamePk || a.dataset?.gamepk;
    if (dataPk) return String(dataPk);
    const href = String(a.getAttribute('href') || '');
    return href.match(/gameday\/(\d+)/)?.[1] || href.match(/[?&](?:gamePk|gamepk)=(\d+)/)?.[1] || null;
  }

  function patchAnchors(player, result) {
    const allGames = [result.today, result.latest, ...(Array.isArray(result.games) ? result.games : [])].filter(Boolean);
    const byPk = new Map(allGames.filter(g => g?.game?.gamePk).map(g => [String(g.game.gamePk), g]));
    document.querySelectorAll(`#player-${player.id} a, a[data-player-id="${player.id}"]`).forEach(a => {
      const pk = canonicalPkFromAnchor(a);
      if (!pk) return;
      const game = byPk.get(String(pk));
      if (!game?.game?.gamePk) return;
      a.href = `https://www.mlb.com/gameday/${game.game.gamePk}`;
      a.dataset.gamePk = String(game.game.gamePk);
    });
  }

  async function reconcileAll() {
    const all = pairs();
    await Promise.allSettled(all.map(async ({ player, result }) => {
      const history = Array.isArray(result.games) ? result.games.slice(0, 8) : [];
      await Promise.allSettled(history.map(g => fixGameObject(player, g)));
      if (result.latest?.game?.gamePk) await fixGameObject(player, result.latest);
      if (result.today?.game?.gamePk) await fixGameObject(player, result.today);
      refreshLatest(result);
      await resolvePlayer(player, result);
      patchAnchors(player, result);
    }));
    window.dispatchEvent(new CustomEvent('tracker:single-source-reconciled'));
  }

  window.TaiwanMlbSingleSource = { reconcileAll, resolvePlayer, teamMeta, gameTeamAndLevel, refreshLatest };
  document.querySelector('#refresh-btn')?.addEventListener('click', () => setTimeout(reconcileAll, 1200));
  window.addEventListener('tracker:live-fast-refresh', () => reconcileAll());
  window.addEventListener('tracker:gameday-current-team', () => reconcileAll());
  document.addEventListener('visibilitychange', () => { if (!document.hidden) reconcileAll(); });
  setTimeout(reconcileAll, 1500);
})();
