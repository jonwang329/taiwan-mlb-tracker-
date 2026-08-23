(() => {
  const API = 'https://statsapi.mlb.com/api/v1';
  const LIVE_API = 'https://statsapi.mlb.com/api/v1.1';
  const LEVEL_BY_SPORT_ID = new Map([
    [1, 'MLB'], [11, 'AAA'], [12, 'AA'], [13, 'A+'], [14, 'A'], [16, 'Rookie'], [17, 'Rookie']
  ]);

  const cache = new Map();
  const nowIso = () => new Date().toISOString();
  const num = v => Number(v || 0);

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
    try {
      const feed = await fetchJson(`${LIVE_API}/game/${gamePk}/feed/live`);
      const e = boxEntry(feed, player.id);
      if (!e) return null;
      const homeHas = !!feed?.liveData?.boxscore?.teams?.home?.players?.[`ID${player.id}`];
      const team = homeHas ? feed?.gameData?.teams?.home : feed?.gameData?.teams?.away;
      if (!team?.id) return null;
      const meta = await teamMeta(team.id);
      return { ...meta, gamePk: num(gamePk), appeared: appeared(feed, player), evidence: 'GAMEDAY' };
    } catch (_) {
      return null;
    }
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

  async function resolvePlayer(player, result) {
    // Highest authority: an actual MLB/MiLB Gameday appearance for today's game.
    const todayPk = num(result.today?.game?.gamePk);
    const live = await gameTeamAndLevel(todayPk, player);
    if (live?.appeared) {
      setStatus(result, live);
      return live;
    }

    // Second authority: fresh official currentTeam + its official sportId.
    const cur = await currentTeam(player).catch(() => null);
    if (cur) {
      const status = { ...cur, evidence: 'CURRENT_TEAM' };
      setStatus(result, status);
      return status;
    }

    // Last resort: never promote historical level to authoritative current status.
    const fallback = {
      teamId: num(result.today?.team?.id || result.latest?.team?.id),
      teamName: result.today?.team?.name || result.latest?.team?.name || '',
      sportId: 0,
      level: result.today?.level || '—',
      evidence: 'CACHE_FALLBACK'
    };
    setStatus(result, fallback);
    return fallback;
  }

  function fixGameObject(player, game) {
    if (!game?.game?.gamePk) return Promise.resolve();
    return gameTeamAndLevel(game.game.gamePk, player).then(status => {
      if (!status) return;
      game.team = status.teamId ? { id: status.teamId, name: status.teamName } : game.team;
      game.level = status.level || game.level;
      // Canonical box-score identity is always gamePk. Any stale cached URL is invalid.
      game.boxScoreUrl = `https://www.mlb.com/gameday/${status.gamePk}`;
    }).catch(() => {});
  }

  function patchAnchors(player, result) {
    const games = Array.isArray(result.games) ? result.games : [];
    const byPk = new Map(games.filter(g => g?.game?.gamePk).map(g => [String(g.game.gamePk), g]));
    document.querySelectorAll(`#player-${player.id} a[href*="gameday"], #player-${player.id} a[data-game-pk]`).forEach(a => {
      const attrPk = a.dataset?.gamePk;
      const match = a.href?.match(/gameday\/(\d+)/);
      const pk = attrPk || match?.[1];
      const game = byPk.get(String(pk));
      if (game?.game?.gamePk) a.href = `https://www.mlb.com/gameday/${game.game.gamePk}`;
    });
  }

  async function reconcileAll() {
    const all = pairs();
    await Promise.allSettled(all.map(async ({ player, result }) => {
      await resolvePlayer(player, result);
      const history = Array.isArray(result.games) ? result.games.slice(0, 5) : [];
      await Promise.allSettled(history.map(g => fixGameObject(player, g)));
      if (result.latest?.game?.gamePk) await fixGameObject(player, result.latest);
      if (result.today?.game?.gamePk) await fixGameObject(player, result.today);
      patchAnchors(player, result);
    }));
    window.dispatchEvent(new CustomEvent('tracker:single-source-reconciled'));
  }

  window.TaiwanMlbSingleSource = { reconcileAll, resolvePlayer, teamMeta };
  document.querySelector('#refresh-btn')?.addEventListener('click', () => setTimeout(reconcileAll, 1200));
  window.addEventListener('tracker:live-fast-refresh', () => reconcileAll());
  window.addEventListener('tracker:gameday-current-team', () => reconcileAll());
  document.addEventListener('visibilitychange', () => { if (!document.hidden) reconcileAll(); });
  setTimeout(reconcileAll, 1500);
})();
