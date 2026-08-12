const KEY = 'players';
const LINE_STATE_KEY = 'line-state:v4';
const MLB_API = 'https://statsapi.mlb.com/api/v1';
const TAIWAN_TZ = 'Asia/Taipei';
const NEW_YORK_TZ = 'America/New_York';
const DAY_MS = 24 * 60 * 60 * 1000;
const DASHBOARD_URL = 'https://jonwang329.github.io/taiwan-mlb-tracker-/';
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
const taiwanTime = date => new Intl.DateTimeFormat('zh-TW', {
  timeZone: TAIWAN_TZ, hour: '2-digit', minute: '2-digit', hour12: false
}).format(date);

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

function gameTaiwanTime(game) {
  const parsed = new Date(game?.gameDate || '');
  return Number.isNaN(parsed.getTime()) ? '' : taiwanTime(parsed);
}

function statusKind(status = {}) {
  const detail = status.detailedState || '';
  const state = status.abstractGameState;
  if (state === 'Final' || /final|game over|completed early/i.test(detail)) return 'final';
  if (state === 'Live' || /in progress|warmup|delay|suspend|review|challenge/i.test(detail)) return 'live';
  if (state === 'Preview' || /scheduled|pre-game|not started/i.test(detail)) return 'preview';
  return 'unknown';
}

function statusLabel(status = {}) {
  const detail = status.detailedState || 'Status unavailable';
  const kind = statusKind(status);
  if (kind === 'final') return `FINAL — ${detail}`;
  if (kind === 'live') return `LIVE — ${detail}`;
  if (kind === 'preview') return `NOT STARTED — ${detail}`;
  return `STATUS UNKNOWN — ${detail}`;
}

function hasAppearance(group, stat = {}, boxPlayer = {}) {
  if (group === 'pitching') {
    return number(stat.battersFaced) > 0 || number(stat.pitchesThrown) > 0 || number(stat.inningsPitched) > 0;
  }
  return number(stat.plateAppearances) > 0 || number(stat.atBats) > 0 || number(stat.runs) > 0 ||
    number(stat.baseOnBalls) > 0 || number(stat.hitByPitch) > 0 || number(stat.sacFlies) > 0 ||
    number(stat.sacBunts) > 0 || Boolean(boxPlayer.allPositions?.length && boxPlayer.gameStatus?.isSubstitute);
}

function isConfirmedStarter(player, game, boxPlayer) {
  if (statusKind(game?.status) !== 'preview') return false;
  if (player.group === 'pitching') {
    const probable = [game?.teams?.home?.probablePitcher?.id, game?.teams?.away?.probablePitcher?.id]
      .map(Number).filter(Boolean);
    return probable.includes(Number(player.id));
  }
  return Boolean(String(boxPlayer?.battingOrder || '').trim());
}

function performance(group, stat = {}) {
  return group === 'pitching'
    ? `${stat.inningsPitched ?? '0'} IP · ${stat.strikeOuts ?? 0} K · ${stat.baseOnBalls ?? 0} BB · ${stat.earnedRuns ?? 0} ER${stat.battersFaced != null ? ` · ${stat.battersFaced} BF` : ''}`
    : `${stat.hits ?? 0}-for-${stat.atBats ?? 0}${stat.plateAppearances != null ? ` · ${stat.plateAppearances} PA` : ''} · ${stat.baseOnBalls ?? 0} BB · ${stat.strikeOuts ?? 0} K · ${stat.homeRuns ?? 0} HR · ${stat.rbi ?? 0} RBI · ${stat.stolenBases ?? 0} SB`;
}

function seasonLine(group, stat = {}) {
  return group === 'pitching'
    ? `ERA ${stat.era ?? '—'} · WHIP ${stat.whip ?? '—'} · ${stat.inningsPitched ?? 0} IP · ${stat.strikeOuts ?? 0} K`
    : `AVG ${stat.avg ?? '—'} · OBP ${stat.obp ?? '—'} · OPS ${stat.ops ?? '—'} · ${stat.homeRuns ?? 0} HR · ${stat.rbi ?? 0} RBI`;
}

async function mlbJson(url) {
  const sep = url.includes('?') ? '&' : '?';
  const response = await fetch(`${url}${sep}_=${Date.now()}`, {
    headers: { Accept: 'application/json', 'Cache-Control': 'no-cache' }, cache: 'no-store'
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
    if (!teamInfoCache.has(teamId)) {
      teamInfoCache.set(teamId, mlbJson(`${MLB_API}/teams/${teamId}`).then(data => data.teams?.[0] || null));
    }
    return teamInfoCache.get(teamId);
  }

  async function gamesForTeam(teamId, sportId) {
    const key = `${teamId}:${sportId}`;
    if (!scheduleCache.has(key)) {
      scheduleCache.set(key, mlbJson(`${MLB_API}/schedule?sportId=${sportId}&teamId=${teamId}&startDate=${start}&endDate=${end}&hydrate=probablePitcher`)
        .then(data => (data.dates || []).flatMap(item => item.games || []).filter(game => gameTaiwanDate(game) === reportDate)));
    }
    return scheduleCache.get(key);
  }

  async function boxscore(gamePk) {
    if (!boxCache.has(gamePk)) boxCache.set(gamePk, mlbJson(`${MLB_API}/game/${gamePk}/boxscore`).catch(() => null));
    return boxCache.get(gamePk);
  }

  async function seasonStat(player, sportId) {
    const key = `${player.id}:${sportId}:${player.group}`;
    if (!seasonCache.has(key)) {
      seasonCache.set(key, mlbJson(`${MLB_API}/people/${player.id}/stats?group=${player.group}&season=${reportDate.slice(0, 4)}&sportId=${sportId}&stats=season`)
        .then(data => data.stats?.[0]?.splits?.[0]?.stat || null).catch(() => null));
    }
    return seasonCache.get(key);
  }

  async function resolvePlayer(player) {
    const person = people.get(Number(player.id)) || {};
    const teamId = person.currentTeam?.id;
    const teamName = person.currentTeam?.name || player.org || 'MLB / MiLB';
    if (!teamId) return { ...player, team: teamName, played: false, scheduled: false, gameDate: '', gameTime: '', gameStatus: 'NO GAME', performance: 'Did not play', season: '—', level: '—', liveSource: false };

    const info = await teamInfo(teamId);
    const sportId = Number(info?.sport?.id || 1);
    const level = info?.sport?.name || 'MLB / MiLB';
    const games = await gamesForTeam(teamId, sportId);
    const ordered = [...games].sort((a, b) => {
      const rank = game => statusKind(game.status) === 'live' ? 0 : statusKind(game.status) === 'final' ? 1 : 2;
      return rank(a) - rank(b) || new Date(b.gameDate || 0) - new Date(a.gameDate || 0);
    });

    for (const game of ordered) {
      if (!game.gamePk) continue;
      const box = await boxscore(game.gamePk);
      const key = `ID${player.id}`;
      const boxPlayer = box?.teams?.home?.players?.[key] || box?.teams?.away?.players?.[key];

      if (statusKind(game.status) === 'preview') {
        if (!isConfirmedStarter(player, game, boxPlayer)) continue;
        const season = await seasonStat(player, sportId);
        return {
          ...player, team: teamName, played: false, scheduled: true,
          gameDate: gameTaiwanDate(game), gameTime: gameTaiwanTime(game), gameStatus: statusLabel(game.status),
          performance: player.group === 'pitching' ? '預定先發投手' : '先發名單已確認',
          season: seasonLine(player.group, season || {}), level, liveSource: false
        };
      }

      if (!boxPlayer) continue;
      const stat = player.group === 'pitching' ? (boxPlayer.stats?.pitching || {}) : (boxPlayer.stats?.batting || boxPlayer.stats?.hitting || {});
      if (!hasAppearance(player.group, stat, boxPlayer)) continue;
      const season = await seasonStat(player, sportId);
      return {
        ...player, team: teamName, played: true, scheduled: false,
        gameDate: gameTaiwanDate(game), gameTime: gameTaiwanTime(game), gameStatus: statusLabel(game.status),
        performance: performance(player.group, stat), season: seasonLine(player.group, season || {}),
        level, liveSource: statusKind(game.status) === 'live'
      };
    }

    const current = ordered[0] || null;
    return {
      ...player, team: teamName, played: false, scheduled: false,
      gameDate: current ? gameTaiwanDate(current) : '', gameTime: current ? gameTaiwanTime(current) : '',
      gameStatus: current ? statusLabel(current.status) : 'NO GAME', performance: 'Did not play', season: '—', level, liveSource: false
    };
  }

  const resolved = [];
  for (let i = 0; i < players.length; i += 3) {
    resolved.push(...await Promise.all(players.slice(i, i + 3).map(resolvePlayer)));
  }
  return { date: reportDate, generatedAt: new Date().toISOString(), players: resolved };
}

const todayPlayers = snapshot => (snapshot.players || []).filter(p => p.played && p.gameDate === snapshot.date);
const scheduledPlayers = snapshot => (snapshot.players || []).filter(p => p.scheduled && p.gameDate === snapshot.date);
const visiblePlayers = snapshot => (snapshot.players || []).filter(p => (p.played || p.scheduled) && p.gameDate === snapshot.date);

function comparablePlayer(player) {
  if (!player) return null;
  return {
    id: player.id, played: !!player.played, scheduled: !!player.scheduled, team: player.team,
    gameDate: player.gameDate, gameTime: player.gameTime, gameStatus: player.gameStatus,
    performance: player.performance, season: player.season, liveSource: !!player.liveSource
  };
}

function changedPlayers(previous, current) {
  const before = new Map((previous?.players || []).map(p => [Number(p.id), JSON.stringify(comparablePlayer(p))]));
  return visiblePlayers(current).filter(p => before.get(Number(p.id)) !== JSON.stringify(comparablePlayer(p)));
}

function levelShort(level = '') {
  if (/major league/i.test(level)) return 'MLB';
  if (/triple-a/i.test(level)) return 'AAA';
  if (/double-a/i.test(level)) return 'AA';
  if (/high-a/i.test(level)) return 'A+';
  if (/single-a|class a/i.test(level)) return 'A';
  return level || 'MiLB';
}

function badgeFor(player) {
  if (player.scheduled) return { text: player.gameTime ? `UPCOMING ${player.gameTime}` : 'UPCOMING', color: '#2F80ED', bg: '#EAF3FF' };
  if (player.liveSource || /^LIVE/i.test(player.gameStatus)) return { text: 'LIVE', color: '#C62828', bg: '#FDECEC' };
  if (/^FINAL/i.test(player.gameStatus)) return { text: 'FINAL', color: '#18794E', bg: '#E9F7EF' };
  return { text: 'STATUS', color: '#5F6B7A', bg: '#F2F4F7' };
}

function playerFlexRow(player) {
  const badge = badgeFor(player);
  return {
    type: 'box', layout: 'vertical', margin: 'md', spacing: 'xs',
    contents: [
      {
        type: 'box', layout: 'horizontal', contents: [
          { type: 'text', text: player.name, weight: 'bold', size: 'md', color: '#0B1F3A', flex: 5, wrap: true },
          {
            type: 'box', layout: 'vertical', backgroundColor: badge.bg, cornerRadius: '12px',
            paddingStart: '8px', paddingEnd: '8px', paddingTop: '4px', paddingBottom: '4px', flex: 3,
            contents: [{ type: 'text', text: badge.text, size: 'xxs', weight: 'bold', color: badge.color, align: 'center' }]
          }
        ]
      },
      { type: 'text', text: `${levelShort(player.level)} · ${player.team}`, size: 'xs', color: '#6B7280', wrap: true },
      { type: 'text', text: player.performance, size: 'sm', weight: 'bold', color: '#111827', wrap: true },
      { type: 'text', text: player.season, size: 'xs', color: '#667085', wrap: true }
    ]
  };
}

function buildFlexMessage(snapshot, period, players) {
  const played = todayPlayers(snapshot).length;
  const upcoming = scheduledPlayers(snapshot).length;
  const title = period === 'morning' ? 'MORNING REPORT' : period === 'changes' ? 'GAME UPDATE' : 'DAILY WRAP';
  const zhTitle = period === 'morning' ? '早安速報' : period === 'changes' ? '今日出賽更新' : '午間日報';
  const shown = players.slice(0, 8);
  const bodyContents = [
    {
      type: 'box', layout: 'horizontal', contents: [
        { type: 'text', text: `已出賽 ${played}`, size: 'sm', weight: 'bold', color: '#0B1F3A', flex: 1 },
        { type: 'text', text: `尚未開賽 ${upcoming}`, size: 'sm', weight: 'bold', color: '#2F80ED', align: 'end', flex: 1 }
      ]
    },
    { type: 'separator', margin: 'md', color: '#E5E7EB' }
  ];

  if (shown.length) {
    shown.forEach((player, index) => {
      bodyContents.push(playerFlexRow(player));
      if (index < shown.length - 1) bodyContents.push({ type: 'separator', margin: 'md', color: '#EEF2F6' });
    });
  } else {
    bodyContents.push({
      type: 'box', layout: 'vertical', margin: 'lg', backgroundColor: '#F7F9FC', cornerRadius: '10px', paddingAll: '12px',
      contents: [{ type: 'text', text: '目前沒有新的今日出賽變化', size: 'sm', color: '#667085', align: 'center', wrap: true }]
    });
  }

  if (players.length > shown.length) {
    bodyContents.push({ type: 'text', text: `另有 ${players.length - shown.length} 位，請開啟完整 Dashboard`, size: 'xs', color: '#667085', margin: 'md', align: 'center' });
  }

  return {
    type: 'flex',
    altText: `🇹🇼 Taiwan MLB Tracker｜${snapshot.date} ${zhTitle}`,
    contents: {
      type: 'bubble', size: 'mega',
      header: {
        type: 'box', layout: 'vertical', backgroundColor: '#0B2A4A', paddingAll: '16px',
        contents: [
          { type: 'text', text: '🇹🇼  TAIWAN MLB TRACKER', size: 'sm', weight: 'bold', color: '#FFFFFF' },
          { type: 'text', text: title, size: 'xl', weight: 'bold', color: '#FFFFFF', margin: 'sm' },
          { type: 'text', text: `${snapshot.date} · Cloudflare official`, size: 'xs', color: '#C7D7E8', margin: 'xs' }
        ]
      },
      body: { type: 'box', layout: 'vertical', paddingAll: '16px', spacing: 'sm', contents: bodyContents },
      footer: {
        type: 'box', layout: 'vertical', paddingAll: '12px',
        contents: [{
          type: 'button', style: 'primary', color: '#0B63CE', height: 'sm',
          action: { type: 'uri', label: 'Open full dashboard', uri: DASHBOARD_URL }
        }]
      },
      styles: {
        header: { backgroundColor: '#0B2A4A' },
        body: { backgroundColor: '#FFFFFF' },
        footer: { separator: true, separatorColor: '#E5E7EB', backgroundColor: '#F8FAFC' }
      }
    }
  };
}

async function sendLine(env, message) {
  const token = env.LINE_CHANNEL_ACCESS_TOKEN;
  const destination = env.LINE_DESTINATION_ID || env.LINE_USER_ID;
  if (!token || !destination) throw new Error('LINE Worker secrets are not configured');
  const response = await fetch('https://api.line.me/v2/bot/message/push', {
    method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ to: destination, messages: [message] })
  });
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`LINE rejected notification (${response.status}) ${body.slice(0, 300)}`);
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
  if (!test && state.deliveries?.[deliveryKey]) return { ok: true, suppressed: true, slot: config.slot, reason: 'already-delivered' };

  const current = await collectSnapshot(env, now);
  const active = todayPlayers(current);
  const upcoming = scheduledPlayers(current);
  const changed = changedPlayers(state.snapshot, current);

  if (config.mode === 'changes' && !test && changed.length === 0) {
    const deliveries = { ...(state.deliveries || {}), [deliveryKey]: new Date().toISOString() };
    await env.OBSERVATION_LIST.put(LINE_STATE_KEY, JSON.stringify({ deliveries, snapshot: current, updatedAt: new Date().toISOString() }));
    return { ok: true, suppressed: true, slot: config.slot, mode: config.mode, reason: 'no-change', active: active.length, upcoming: upcoming.length };
  }

  const period = test ? 'final' : config.mode;
  const players = config.mode === 'changes' && !test ? changed : visiblePlayers(current);
  const lineStatus = await sendLine(env, buildFlexMessage(current, period, players));

  if (!test) {
    const deliveries = { ...(state.deliveries || {}), [deliveryKey]: new Date().toISOString() };
    await env.OBSERVATION_LIST.put(LINE_STATE_KEY, JSON.stringify({ deliveries, snapshot: current, updatedAt: new Date().toISOString() }));
  }
  return { ok: true, slot: config.slot, mode: config.mode, date: current.date, players: current.players.length, active: active.length, upcoming: upcoming.length, changed: changed.length, lineStatus };
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === 'GET' && url.pathname === '/health') {
      return Response.json({
        ok: true, lineScheduler: true,
        lineConfigured: Boolean(env.LINE_CHANNEL_ACCESS_TOKEN && (env.LINE_DESTINATION_ID || env.LINE_USER_ID)),
        format: 'flex-v1', source: 'cloudflare-official', cronTimezone: 'UTC'
      });
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
