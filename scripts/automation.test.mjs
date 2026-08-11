import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read=path=>readFile(new URL(`../${path}`,import.meta.url),'utf8');

test('Taiwan production cron schedule remains exact',async()=>{
  const yml=await read('.github/workflows/line-daily-updates.yml');
  for(const cron of ['0 23 * * *','0 0 * * *','0 1 * * *','0 4 * * *']) assert.match(yml,new RegExp(cron.replace(/\*/g,'\\*')));
  assert.match(yml,/workflow_dispatch:/);
  assert.match(yml,/--test/);
});

test('manual LINE tests are clearly labeled and share production sender',async()=>{
  const sender=await read('scripts/send-line-update.mjs');
  const data=await read('scripts/shared-tracker-data.mjs');
  assert.match(data,/🧪 TEST — Taiwan MLB Tracker/);
  assert.match(sender,/shared-tracker-data\.mjs/);
  assert.match(sender,/Manual test does not modify the production snapshot/);
});

test('dashboard and LINE use the same tracked player source',async()=>{
  const app=await read('app.js');
  const lineData=await read('scripts/shared-tracker-data.mjs');
  assert.match(app,/tracked-players\.json/);
  assert.match(lineData,/tracked-players\.json/);
  const players=JSON.parse(await read('tracked-players.json'));
  assert.ok(players.length>0);
  assert.equal(new Set(players.map(p=>p.id)).size,players.length);
});

test('watchlist automation accepts only owner-approved requests',async()=>{
  const yml=await read('.github/workflows/watchlist-manager.yml');
  assert.match(yml,/author_association == 'OWNER'/);
  assert.match(yml,/contents: write/);
  assert.match(yml,/issues: write/);
});
