const MLB_API = 'https://statsapi.mlb.com/api/v1';
const PLAYERS_KEY = 'players';
const ROSTER_STATE_KEY = 'roster-level-state:v1';
const MAX_EVENTS = 50;

function shortLevel(name = '') {
  if (/major league/i.test(name)) return 'MLB';
  if (/triple-a/i.test(name)) return 'AAA';
  if (/double-a/i.test(name)) return 'AA';
  if (/high-a/i.test(name)) return 'A+';
  if (/single-a|class a/i.test(name)) return 'A';
  if (/rookie/i.test(name)) return 'Rookie';
  return name || 'Unknown';
}

async function mlbJson(url) {
  const sep = url.includes('?') ? '&' : '?';
  const response = await fetch(`${url}${sep}_=${Date.now()}`, {
    headers: { Accept: 'application/json', 'Cache-Control': 'no-cache' },
    cache: 'no-store',
  });
  if (!response.ok) throw new Error(`MLB API ${response.status}: ${url}`);
  return response.json();
}

function comparable(row = {}) {
  return {
    id: Number(row.id),
    teamId: Number(row.teamId || 0) || null,
    org: row.org || '',
    level: row.level || 'Unknown',
  };
}

export async function syncRosterLevels(env, now = new Date()) {
  const players = await env.OBSERVATION_LIST.get(PLAYERS_KEY, 'json');
  if (!Array.isArray(players) || !players.length) {
    return { ok: true, checked: 0, changed: 0, changes: [] };
  }

  const ids = players.map(p => Number(p.id)).filter(Boolean);
  const peopleData = await mlbJson(`${MLB_API}/people?personIds=${ids.join(',')}&hydrate=currentTeam`);
  const people = new Map((peopleData.people || []).map(person => [Number(person.id), person]));
  const teamIds = [...new Set([...people.values()].map(person => Number(person.currentTeam?.id)).filter(Boolean))];
  const teamsData = teamIds.length
    ? await mlbJson(`${MLB_API}/teams?teamId=${teamIds.join(',')}`)
    : { teams: [] };
  const teams = new Map((teamsData.teams || []).map(team => [Number(team.id), team]));

  const checkedAt = now.toISOString();
  const nextPlayers = players.map(player => {
    const person = people.get(Number(player.id));
    const teamId = Number(person?.currentTeam?.id || 0) || null;
    const team = teamId ? teams.get(teamId) : null;
    const org = person?.currentTeam?.name || player.org || 'MLB / MiLB';
    const level = shortLevel(team?.sport?.name || '');
    const rosterStatus = person?.rosterStatus?.description || person?.rosterStatus || player.rosterStatus || '';
    return { ...player, org, teamId, level, rosterStatus, rosterCheckedAt: checkedAt };
  });

  const previousState = await env.OBSERVATION_LIST.get(ROSTER_STATE_KEY, 'json');
  const previousRows = Array.isArray(previousState?.players) ? previousState.players : [];
  const before = new Map(previousRows.map(row => [Number(row.id), comparable(row)]));
  const changes = [];

  for (const player of nextPlayers) {
    const old = before.get(Number(player.id));
    if (!old) continue;
    const current = comparable(player);
    if (old.teamId !== current.teamId || old.org !== current.org || old.level !== current.level) {
      changes.push({
        id: current.id,
        name: player.name,
        fromTeam: old.org,
        toTeam: current.org,
        fromLevel: old.level,
        toLevel: current.level,
        changedAt: checkedAt,
      });
    }
  }

  const priorEvents = Array.isArray(previousState?.events) ? previousState.events : [];
  const events = [...changes, ...priorEvents].slice(0, MAX_EVENTS);
  const state = {
    checkedAt,
    players: nextPlayers.map(comparable),
    events,
    lastChanges: changes,
  };

  await env.OBSERVATION_LIST.put(PLAYERS_KEY, JSON.stringify(nextPlayers));
  await env.OBSERVATION_LIST.put(ROSTER_STATE_KEY, JSON.stringify(state));

  return { ok: true, checked: nextPlayers.length, changed: changes.length, changes };
}

export { shortLevel };
