import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const worker = await readFile(new URL('../cloudflare/line-canonical-worker.js', import.meta.url), 'utf8');
const entry = await readFile(new URL('../cloudflare/line-worker-single-cron.js', import.meta.url), 'utf8');

assert.match(entry, /line-canonical-worker\.js/, 'scheduled entry must use canonical LINE worker');
assert.doesNotMatch(entry, /line-flex-worker\.js/, 'scheduled entry must not use legacy independent MLB collector');
assert.match(worker, /dashboard-snapshot\.js/, 'LINE worker must read the dashboard canonical snapshot');
assert.doesNotMatch(worker, /statsapi\.mlb\.com/, 'LINE worker must not independently query MLB Stats API');
assert.match(worker, /FRESH_MS=15\*60\*1000/, 'LINE worker must carry an explicit freshness limit');
assert.match(worker, /WAITING FOR MLB/, 'stale state must be explicit to the user');
assert.match(worker, /0 23 \* \* \*/, '07:00 Taiwan slot must exist');
assert.match(worker, /0 0 \* \* \*/, '08:00 Taiwan slot must exist');
assert.match(worker, /0 1 \* \* \*/, '09:00 Taiwan slot must exist');
assert.match(worker, /0 4 \* \* \*/, '12:00 Taiwan slot must exist');

console.log('LINE canonical worker regression checks passed');
