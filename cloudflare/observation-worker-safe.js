import handler from './observation-worker.js';

export default {
  fetch: handler.fetch,
  async scheduled(controller, env, ctx) {
    console.log(`[observation] legacy scheduled event ignored: ${controller.cron || 'unknown'}`);
  },
};
