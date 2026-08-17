(() => {
  const API = 'https://statsapi.mlb.com/api/v1';
  const timeLogic = window.TaiwanGameTime;
  if (!timeLogic || typeof window.fetchOfficialToday !== 'function') return;

  const { scheduleQueryWindow, isTaiwanTodayGame, gameTaiwanDate } = timeLogic;
  const num = value => Number(value || 0);

  async function freshJson(url) {
    const sep = url.includes('?') ? '&' : '?';
    const response = await fetch(`${url}${sep}_=${Date.now()}`, {
      cache: 'no-store',
      headers: { Accept: 'application/json', 'Cache-Control': 'no-cache' }
    });
    if (!response.ok) throw new Error(`MLB API ${response.status}`);
    return response.json();
  }

  function appeared(player, stat = {}) {
    return player.group === 'pitching'
      ? num(stat.battersFaced) > 0 || num(stat.pitchesThrown) > 0 || num(stat.inningsPitched) > 0
      : num(stat.plateAppearances) > 0 || num(stat.atBats) > 0 || num(stat.runs) > 0 ||
        num(stat.baseOnBalls) > 0 || num(stat.hitByPitch) > 0 || num(stat.sacFlies) > 0 ||
        num(stat.sacBunts) > 0;
  }

  window.fetchOfficialToday = async function fetchOfficialTodayTeamAuthoritative(player, teamIds, level) {
    const ids = [...new Set((Array.isArray(teamIds) ? teamIds : [teamIds]).map(Number).filter(Boolean))].slice(0, 8);
    if (!ids.length) return null;

    const now = new Date();
    const { start, end } = scheduleQueryWindow(now);
    const seenGames = new Set();
    let scheduleChecks = 0;
    let boxscoreChecks = 0;
    let relevantGames = 0;
    let lastError;

    for (const teamId of ids) {
      try {
        // teamId is the authoritative schedule identity. Never combine it with an
        // independently inferred sportId because a promotion/demotion can make
        // that pair impossible and hide the player's real game.
        const schedule = await freshJson(`${API}/schedule?teamId=${teamId}&startDate=${start}&endDate=${end}`);
        scheduleChecks += 1;
        const games = (schedule.dates || [])
          .flatMap(date => date.games || [])
          .filter(game => isTaiwanTodayGame(game, now))
          .sort((a, b) => {
            const rank = game => game.status?.abstractGameState === 'Live' ? 0 : game.status?.abstractGameState === 'Final' ? 1 : 2;
            return rank(a) - rank(b) || new Date(b.gameDate || 0) - new Date(a.gameDate || 0);
          });

        for (const game of games) {
          if (!game.gamePk || game.status?.abstractGameState === 'Preview' || seenGames.has(game.gamePk)) continue;
          seenGames.add(game.gamePk);
          relevantGames += 1;
          try {
            const box = await freshJson(`${API}/game/${game.gamePk}/boxscore`);
            boxscoreChecks += 1;
            const key = `ID${player.id}`;
            const boxPlayer = box.teams?.home?.players?.[key] || box.teams?.away?.players?.[key];
            if (!boxPlayer) continue;
            const stat = player.group === 'pitching'
              ? (boxPlayer.stats?.pitching || {})
              : (boxPlayer.stats?.batting || boxPlayer.stats?.hitting || {});
            if (appeared(player, stat)) {
              return {
                date: gameTaiwanDate(game),
                level,
                stat,
                game: { gamePk: game.gamePk },
                live: game.status?.abstractGameState === 'Live'
              };
            }
          } catch (error) {
            lastError = error;
            console.warn('Official boxscore unavailable', player.name, game.gamePk, error);
          }
        }
      } catch (error) {
        lastError = error;
        console.warn('Official schedule unavailable', player.name, teamId, error);
      }
    }

    if (scheduleChecks === 0) throw lastError || new Error('MLB schedule API unavailable');
    if (relevantGames > 0 && boxscoreChecks === 0 && lastError) throw lastError;
    return null;
  };
})();
