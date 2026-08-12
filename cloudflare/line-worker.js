const KEY = 'players';
const LINE_STATE_KEY = 'line-state:v3';
const MLB_API = 'https://statsapi.mlb.com/api/v1';
const TAIWAN_TZ = 'Asia/Taipei';
const NEW_YORK_TZ = 'America/New_York';
const DAY_MS = 24 * 60 * 60 * 1000;
const CRON_SLOTS = new Map([
  ['0 23 * * *', { slot: '07', mode: 'morning' }],
  ['0 0 * * *', { slot: '08', mode: 'changes' }],
  ['0 1 * * *', { slot: '09', mode: 'changes' }],
  ['0 4 * * *', { slot: '12', mode: 'final' }],
]);

const number = value => Number(value || 0);
const dateInZone = (date, timeZone) => new Intl.DateTimeFormat('en-CA', {
  timeZone, year: 'numeric', month: '2-digit', day: '2-digit'
}).format(date);
const taiwanDate = (now = new Date()) => dateInZone(now, TAIWAN_TZ);

function scheduleQueryWindow(now = new Date()) {
  const date = taiwanDate(now);
  const start = new Date(`${date}T00:00:00+08:00`);
  const end = new Date(start.getTime() + DAY_MS - 1);
  return { start: dateInZone(start, NEW_YORK_TZ), end: dateInZone(end, NEW_YORK_TZ) };
}

function gameTaiwanDate(game) {
  const parsed = new Date(game?.gameDate || '');
  return Number.isNaN(parsed.getTime()) ? '' : dateInZone(parsed, TAIWAN_TZ);
}

function statusLabel(status = {}) {
  const detail = status.detailedState || 'Status unavailable';
  const state = status.abstractGameState;
  if (state === 'Final' || /final|game over|completed early/i.test(detail)) return `FINAL — ${detail}`;
  if (state === 'Live' || /in progress|warmup|delay|suspend|review|challenge/i.test(detail)) return `LIVE / IN PROGRESS — ${detail}`;
  if (state === 'Preview' || /scheduled|pre-game|not started/i.test(detail)) return `NOT STARTED — ${detail}`;
  return `STATUS UNKNOWN — ${detail}`;
}

function schedulePriority(game = {}) {
  const state = game.status?.abstractGameState;
  return state === 'Live' ? 0 : state === 'Final' ? 1 : 2;
}

function hasAppearance(group, stat = {}, boxPlayer = {}) {
  if (group === 'pitching') {
    return number(stat.battersFaced) > 0 || number(stat.pitchesThrown) > 0 || number(stat.inningsPitched) > 0;
  }
  return number(stat.plateAppearances) > 0 || number(stat.atBats) > 0 || number(stat.runs) > 0 ||
    number(stat.baseOnBalls) > 0 || number(stat.hitByPitch) > 0 || number(stat.sacFlies) > 0 ||
    number(stat.sacBunts) > 0 || Boolean(boxPlayer.allPositions?.length && boxPlayer.gameStatus?.isSubstitute);
}

function performance(group, stat = {}) {
  return group === 'pitching'
    ? `${stat.inningsPitched ?? '0'} IP, ${stat.strikeOuts ?? 0} K, ${stat.baseOnBalls ?? 0} BB, ${stat.earnedRuns ?? 0} ER${stat.battersFaced != null ? `, ${stat.battersFaced} BF` : ''}`
    : `${stat.hits ?? 0}-for-${stat.atBats ?? 0}${stat.plateAppearances != null ? `, ${stat.plateAppearances} PA` : ''}, ${stat.homeRuns ?? 0} HR, ${stat.rbi ?? 0} RBI, ${stat.stolenBases ?? 0} SB`;
}

function seasonLine(group, stat = {}) {
  return group === 'pitching'
    ? `ERA ${stat.era ?? '—'}, WHIP ${stat.whip ?? '—'}, ${stat.inningsPitched ?? 0} IP, ${stat.strikeOuts ?? 0} K`
    : `AVG ${stat.avg ?? '—'}, OBP ${stat.obp ?? '—'}, OPS ${stat.ops ?? '—'}, ${stat.homeRuns ?? 0} HR, ${stat.rbi ?? 0} RBI`;
}

async function mlbJson(url) {
  const sep = url.includes('?') ? '&' : '?';
  const response = await fetch(`${url}${sep}_=${Date.now()}`, {
    headers: { Accept: 'application/json', 'Cache-Control': 'no-cache' },
    cache: 'no-store'
  });
  if (!response.ok) throw new Error(`MLB API ${response.status}: ${url}`);
  return response.json();
}

async function readPlayers(env) {
  const players = await env.OBSERVATION_LIST.get(KEY, 'json');
  if (!Array.isArray(players) || !players.length) throw new Error('Observation list is empty');
  return players;
}

async function loadPeople(players) {
  const ids = players.map(player => Number(player.id)).filter(Boolean);
  const data = await mlbJson(`${MLB_API}/people?personIds=${ids.join(',')}&hydrate=currentTeam`);
  return new Map((data.people || []).map(person => [Number(person.id), person]));
}

async function collectSnapshot(env, now = new Date()) {
  const players = await readPlayers(env);
  const people = await loadPeople(players);
  const teamInfoCache = new Map();
  const scheduleCache = new Map();
  const boxCache = new Map();
  const seasonCache = new Map();
  const { start, end } = scheduleQueryWindow(now);
  const reportDate = taiwanDate(now);

  async function teamInfo(teamId) {
    if (!teamId) return null;
    if (!teamInfoCache.has(teamId)) {
      teamInfoCache.set(teamId, mlbJson(`${MLB_API}/teams/${teamId}`).then(data => data.teams?.[0] || null));
    }
    return teamInfoCache.get(teamId);
  }

  async function gamesForTeam(teamId, sportId) {
    const cacheKey = `${teamId}:${sportId}`;
    if (!scheduleCache.has(cacheKey)) {
      scheduleCache.set(cacheKey, mlbJson(`${MLB_API}/schedule?sportId=${sportId}&teamId=${teamId}&startDate=${start}&endDate=${end}`)
        .then(data => (data.dates || []).flatMap(item => item.games || []).filter(game => gameTaiwanDate(game) === reportDate)));
    }
    return scheduleCache.get(cacheKey);
  }

  async function boxscore(gamePk) {
    if (!boxCache.has(gamePk)) boxCache.set(gamePk, mlbJson(`${MLB_API}/game/${gamePk}/boxscore`));
    return boxCache.get(gamePk);
  }

  async function seasonStat(player, sportId) {
    const cacheKey = `${player.id}:${sportId}:${player.group}`;
    if (!seasonCache.has(cacheKey)) {
      seasonCache.set(cacheKey, mlbJson(`${MLB_API}/people/${player.id}/stats?group=${player.group}&season=${reportDate.slice(0, 4)}&sportId=${sportId}&stats=season`)
        .then(data => data.stats?.[0]?.splits?.[0]?.stat || null)
        .catch(() => null));
    }
    return seasonCache.get(cacheKey);
  }

  async function resolvePlayer(player) {
    const person = people.get(Number(player.id)) || {};
    const teamId = person.currentTeam?.id;
    const teamName = person.currentTeam?.name || player.org || 'MLB / MiLB';
    if (!teamId) {
      return { id: player.id, name: player.name, group: player.group, team: teamName, played: false, gameDate: '', gameStatus: 'NO GAME — current team unavailable', performance: 'Did not play', season: '—', level: '—', liveSource: false };
    }

    const info = await teamInfo(teamId);
    const sportId = Number(info?.sport?.id || 1);
    const level = info?.sport?.name || 'MLB / MiLB';
    const games = await gamesForTeam(teamId, sportId);
    const ordered = [...games].sort((a, b) => schedulePriority(a) - schedulePriority(b) || new Date(b.gameDate || 0) - new Date(a.gameDate || 0));

    for (const game of ordered) {
      if (!game.gamePk || game.status?.abstractGameState === 'Preview') continue;
      const box = await boxscore(game.gamePk);
      const key = `ID${player.id}`;
      const boxPlayer = box.teams?.home?.players?.[key] || box.teams?.away?.players?.[key];
      if (!boxPlayer) continue;
      const stat = player.group === 'pitching'
        ? (boxPlayer.stats?.pitching || {})
        : (boxPlayer.stats?.batting || boxPlayer.stats?.hitting || {});
      if (!hasAppearance(player.group, stat, boxPlayer)) continue;
      const season = await seasonStat(player, sportId);
      return {
        id: player.id,
        name: player.name,
        group: player.group,
        team: teamName,
        played: true,
        gameDate: gameTaiwanDate(game),
        gameStatus: statusLabel(game.status),
        performance: performance(player.group, stat),
        season: seasonLine(player.group, season || {}),
        level,
        liveSource: game.status?.abstractGameState === 'Live'
      };
    }

    const currentGame = ordered[0] || null;
    return {
      id: player.id,
      name: player.name,
      group: player.group,
      team: teamName,
      played: false,
      gameDate: '',
      gameStatus: currentGame ? statusLabel(currentGame.status) : 'NO GAME — no Taiwan-today game returned by MLB schedule',
      performance: 'Did not play',
      season: '—',
      level,
      liveSource: false
    };
  }

  const resolved = [];
  for (let i = 0; i < players.length; i += 3) {
    const batch = players.slice(i, i + 3);
    resolved.push(...await Promise.all(batch.map(resolvePlayer)));
  }

  return { date: reportDate, generatedAt: new Date().toISOString(), players: resolved };
}

function todayPlayers(snapshot) {
  return (snapshot.players || []).filter(player => player.played && player.gameDate === snapshot.date);
}

function comparablePlayer(player) {
  return player?.played
    ? { id: player.id, played: true, team: player.team, gameDate: player.gameDate, gameStatus: player.gameStatus, performance: player.performance, season: player.season, liveSource: player.liveSource }
    : { id: player?.id, played: false };
}

function playerSection(player) {
  return [
    `\n【${player.name}｜${player.team}】`,
    `層級：${player.level}`,
    `比賽：${player.gameStatus}`,
    `本場：${player.performance}${player.liveSource ? '（LIVE）' : ''}`,
    `球季：${player.season}`
  ].join('\n');
}

function formatSummary(snapshot, period = 'final', test = false) {
  const title = period === 'morning' ? '早安速報' : '午間日報';
  const prefix = test ? '🧪 CLOUDFLARE LIVE-DATA TEST — Taiwan MLB Tracker' : `🇹🇼⚾ Taiwan MLB Tracker｜${snapshot.date} ${title}`;
  const active = todayPlayers(snapshot);
  const header = `${prefix}\n台灣日期：${snapshot.date}\n今日出賽：${active.length} 位`;
  return active.length
    ? [header, ...active.map(playerSection)].join('\n')
    : `${header}\n\n目前沒有追蹤球員在台灣今天出賽。`;
}

function formatChanges(previous, current) {
  const before = new Map((previous?.players || []).map(player => [Number(player.id), JSON.stringify(comparablePlayer(player))]));
  const changed = todayPlayers(current).filter(player => before.get(Number(player.id)) !== JSON.stringify(comparablePlayer(player)));
  const header = `🇹🇼⚾ Taiwan MLB Tracker｜${current.date} 今日出賽更新`;
  return changed.length ? [header, ...changed.map(playerSection)].join('\n') : `${header}\n目前沒有新的今日出賽變化。`;
}

async function sendLine(env, message) {
  const token = env.LINE_CHANNEL_ACCESS_TOKEN;
  const destination = env.LINE_DESTINATION_ID || env.LINE_USER_ID;
  if (!token || !destination) throw new Error('LINE Worker secrets are not configured');
  const response = await fetch('https://api.line.me/v2/bot/message/push', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ to: destination, messages: [{ type: 'text', text: message }] })
  });
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`LINE rejected notification (${response.status}) ${body.slice(0, 200)}`);
  }
  return response.status;
}

function deployTestAuthorized(request, env) {
  const header = request.headers.get('authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  return Boolean(token && env.DEPLOY_TEST_TOKEN && token === env.DEPLOY_TEST_TOKEN);
}

async function runLine(env, cron, now = new Date(), test = false) {
  const config = CRON_SLOTS.get(cron) || { slot: 'manual', mode: 'final' };
  const state = await env.OBSERVATION_LIST.get(LINE_STATE_KEY, 'json') || { deliveries: {}, snapshot: null };
  const deliveryKey = `${taiwanDate(now)}:${config.slot}`;
  if (!test && state.deliveries?.[deliveryKey]) return { ok: true, suppressed: true, slot: config.slot };

  const current = await collectSnapshot(env, now);
  const active = todayPlayers(current);
  if (test && active.length === 0) {
    return { ok: false, reason: 'no-active-data', date: current.date, players: current.players.length, active: 0, diagnostics: current.players.map(player => ({ id: player.id, name: player.name, team: player.team, level: player.level, gameStatus: player.gameStatus })) };
  }

  const message = test
    ? formatSummary(current, 'final', true)
    : config.mode === 'morning'
      ? formatSummary(current, 'morning', false)
      : config.mode === 'final'
        ? formatSummary(current, 'final', false)
        : formatChanges(state.snapshot, current);

  const lineStatus = await sendLine(env, message);
  if (!test) {
    const deliveries = { ...(state.deliveries || {}), [deliveryKey]: new Date().toISOString() };
    await env.OBSERVATION_LIST.put(LINE_STATE_KEY, JSON.stringify({ deliveries, snapshot: current, updatedAt: new Date().toISOString() }));
  }
  return { ok: true, slot: config.slot, mode: config.mode, date: current.date, players: current.players.length, active: active.length, lineStatus };
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === 'GET' && url.pathname === '/health') {
      return Response.json({ ok: true, lineScheduler: true, lineConfigured: Boolean(env.LINE_CHANNEL_ACCESS_TOKEN && (env.LINE_DESTINATION_ID || env.LINE_USER_ID)), cronTimezone: 'UTC' });
    }
    if (request.method === 'POST' && url.pathname === '/internal/line-test') {
      if (!deployTestAuthorized(request, env)) return Response.json({ error: 'unauthorized' }, { status: 401 });
      try {
        const result = await runLine(env, 'manual', new Date(), true);
        return Response.json(result, { status: result.ok ? 200 : 422 });
      } catch (error) {
        return Response.json({ ok: false, error: error.message }, { status: 500 });
      }
    }
    return Response.json({ error: 'not found' }, { status: 404 });
  },
  async scheduled(controller, env, ctx) {
    if (!CRON_SLOTS.has(controller.cron)) return;
    ctx.waitUntil(runLine(env, controller.cron, new Date(controller.scheduledTime)).then(result => console.log(JSON.stringify(result))));
  }
};
