import handler from './line-worker.js';

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
