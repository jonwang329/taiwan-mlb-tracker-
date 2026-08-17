import handler from './line-flex-worker.js';

// LINE and the dashboard must discover games from the same MLB truth.
// A team's MLB schedule identity is teamId.  sportId is useful for stats/level
// metadata, but combining an independently inferred sportId with teamId can
// hide the real game immediately after a promotion/demotion.  Keep this guard
// at the notifier boundary so every LINE schedule lookup is team-authoritative.
const nativeFetch = globalThis.fetch.bind(globalThis);
globalThis.fetch = (input, init) => {
  const rawUrl = typeof input === 'string' ? input : input?.url;
  if (rawUrl && rawUrl.startsWith('https://statsapi.mlb.com/api/v1/schedule?')) {
    const url = new URL(rawUrl);
    if (url.searchParams.has('teamId') && url.searchParams.has('sportId')) {
      url.searchParams.delete('sportId');
      return nativeFetch(url.toString(), init);
    }
  }
  return nativeFetch(input, init);
};

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

export default {
  fetch: handler.fetch,
  async scheduled(controller, env, ctx) {
    const scheduledAt = new Date(controller.scheduledTime);
    const syntheticCron = SLOT_CRON_BY_TAIWAN_HOUR.get(taiwanHour(scheduledAt));
    if (!syntheticCron) {
      console.log(`[line] ignoring unexpected Taiwan hour ${taiwanHour(scheduledAt)}`);
      return;
    }
    return handler.scheduled({ ...controller, cron: syntheticCron }, env, ctx);
  },
};
