import handler from './line-flex-worker.js';

// Cloudflare is the only production LINE scheduler. The imported Flex worker
// resolves each current team's official sportId before querying MiLB schedules.
const nativeFetch = globalThis.fetch.bind(globalThis);

const DISPLAY_NAME = new Map([
  ['Hung-Leng Chang', '張弘稜 Hung-Leng Chang'],
  ['Wen-Hui Pan', '潘文輝 Wen-Hui Pan'],
  ['Tzu-Chen Sha', '沙子宸 Tzu-Chen Sha'],
  ['Lan-Hong Su', '蘇嵐鴻 Lan-Hong Su'],
  ['Po-Yu Chen', '陳柏毓 Po-Yu Chen'],
]);

function twNow() {
  const now = new Date();
  const date = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(now);
  const time = new Intl.DateTimeFormat('zh-TW', {
    timeZone: 'Asia/Taipei', hour: '2-digit', minute: '2-digit', hour12: false
  }).format(now);
  return { date, time };
}

function readPlayerRow(node) {
  if (!node || node.type !== 'box' || node.layout !== 'vertical' || !Array.isArray(node.contents)) return null;
  const top = node.contents[0];
  if (!top || top.type !== 'box' || top.layout !== 'horizontal' || !Array.isArray(top.contents)) return null;
  const name = top.contents?.[0]?.text;
  const badge = top.contents?.[1]?.contents?.[0]?.text;
  if (!name || !badge) return null;
  return {
    name: DISPLAY_NAME.get(name) || name,
    badge,
    meta: node.contents?.[1]?.text || '',
    performance: node.contents?.[2]?.text || '',
    season: node.contents?.[3]?.text || '',
  };
}

function badgeKind(text = '') {
  if (/^LIVE/i.test(text)) return 'live';
  if (/^FINAL/i.test(text)) return 'final';
  if (/^UPCOMING/i.test(text)) return 'upcoming';
  return 'other';
}

function sectionLabel(kind) {
  if (kind === 'live') return '🔴 LIVE';
  if (kind === 'final') return '✅ FINAL';
  if (kind === 'upcoming') return '⏱ UPCOMING';
  return 'STATUS';
}

function compactPlayerRow(player) {
  return {
    type: 'box', layout: 'vertical', margin: 'md', spacing: 'xs',
    contents: [
      { type: 'text', text: player.name, weight: 'bold', size: 'md', color: '#102A43', wrap: true },
      { type: 'text', text: player.meta, size: 'xs', color: '#667085', wrap: true },
      { type: 'text', text: player.performance, size: 'sm', weight: 'bold', color: '#111827', wrap: true },
      { type: 'text', text: player.season, size: 'xs', color: '#667085', wrap: true }
    ]
  };
}

function polishFlexMessage(message) {
  if (message?.type !== 'flex' || message?.contents?.type !== 'bubble') return message;
  const originalBody = message.contents?.body?.contents || [];
  const players = originalBody.map(readPlayerRow).filter(Boolean);
  if (!players.length) return message;

  const order = ['live', 'upcoming', 'final', 'other'];
  const grouped = new Map(order.map(kind => [kind, []]));
  for (const player of players) grouped.get(badgeKind(player.badge)).push(player);

  const body = [];
  for (const kind of order) {
    const group = grouped.get(kind);
    if (!group.length) continue;
    body.push({
      type: 'text', text: sectionLabel(kind), size: 'xs', weight: 'bold', color: kind === 'live' ? '#C62828' : '#475467',
      margin: body.length ? 'lg' : 'none'
    });
    group.forEach((player, index) => {
      body.push(compactPlayerRow(player));
      if (index < group.length - 1) body.push({ type: 'separator', margin: 'md', color: '#EEF2F6' });
    });
  }

  const { date, time } = twNow();
  return {
    type: 'flex',
    altText: `🇹🇼 Taiwan MLB Tracker｜${date} 即時更新`,
    contents: {
      type: 'bubble', size: 'mega',
      header: {
        type: 'box', layout: 'vertical', backgroundColor: '#0B2A4A', paddingAll: '16px',
        contents: [
          { type: 'text', text: '🇹🇼  TAIWAN MLB TRACKER', size: 'sm', weight: 'bold', color: '#FFFFFF' },
          { type: 'box', layout: 'horizontal', margin: 'sm', contents: [
            { type: 'text', text: `${date.slice(5).replace('-', '/')} UPDATE`, size: 'xl', weight: 'bold', color: '#FFFFFF', flex: 3 },
            { type: 'text', text: `${players.length} players`, size: 'xs', weight: 'bold', color: '#D8E6F3', align: 'end', gravity: 'center', flex: 2 }
          ]}
        ]
      },
      body: { type: 'box', layout: 'vertical', paddingAll: '16px', spacing: 'sm', contents: body },
      footer: {
        type: 'box', layout: 'vertical', paddingAll: '12px', spacing: 'sm',
        contents: [
          { type: 'text', text: `MLB / MiLB Official · Checked ${time}`, size: 'xxs', color: '#98A2B3', align: 'center' },
          { type: 'button', style: 'primary', color: '#0B63CE', height: 'sm', action: { type: 'uri', label: 'Open dashboard', uri: 'https://jonwang329.github.io/taiwan-mlb-tracker-/' } }
        ]
      },
      styles: {
        header: { backgroundColor: '#0B2A4A' },
        body: { backgroundColor: '#FFFFFF' },
        footer: { separator: true, separatorColor: '#E5E7EB', backgroundColor: '#F8FAFC' }
      }
    }
  };
}

globalThis.fetch = (input, init) => {
  const rawUrl = typeof input === 'string' ? input : input?.url;

  if (rawUrl === 'https://api.line.me/v2/bot/message/push' && typeof init?.body === 'string') {
    try {
      const payload = JSON.parse(init.body);
      if (Array.isArray(payload.messages)) {
        payload.messages = payload.messages.map(polishFlexMessage);
        return nativeFetch(input, { ...init, body: JSON.stringify(payload) });
      }
    } catch (error) {
      console.warn('[line] could not polish Flex payload', error);
    }
  }

  return nativeFetch(input, init);
};

const LINE_STATE_KEY = 'line-state:v4';
const SLOT_CRON_BY_TAIWAN_HOUR = new Map([
  ['07', '0 23 * * *'],
  ['08', '0 0 * * *'],
  ['09', '0 1 * * *'],
  ['12', '0 4 * * *'],
]);

function taiwanHour(date) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Taipei',
    hour: '2-digit',
    hour12: false,
  }).format(date);
}

async function forceCurrentStateReport(env, hour) {
  if (hour !== '08' && hour !== '09') return;
  const state = await env.OBSERVATION_LIST.get(LINE_STATE_KEY, 'json');
  if (!state) return;
  // The legacy 08/09 implementation suppresses a message when the delta is empty.
  // Clear only the comparison snapshot so these slots compare against no prior state
  // and therefore report the full current MLB-visible state. Delivery keys remain
  // intact, so duplicate protection still works.
  await env.OBSERVATION_LIST.put(LINE_STATE_KEY, JSON.stringify({ ...state, snapshot: null }));
}

export default {
  fetch: handler.fetch,
  async scheduled(controller, env, ctx) {
    const scheduledAt = new Date(controller.scheduledTime);
    const hour = taiwanHour(scheduledAt);
    const syntheticCron = SLOT_CRON_BY_TAIWAN_HOUR.get(hour);
    if (!syntheticCron) {
      console.log(`[line] ignoring unexpected Taiwan hour ${hour}`);
      return;
    }
    await forceCurrentStateReport(env, hour);
    return handler.scheduled({ ...controller, cron: syntheticCron }, env, ctx);
  },
};
