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

test('dashboard and LINE can use the same server-side observation list',async()=>{
  const app=await read('app.js');
  const manager=await read('watchlist-manager.js');
  const runner=await read('scripts/run-line-update.mjs');
  const workflow=await read('.github/workflows/line-daily-updates.yml');
  assert.match(app,/WATCHLIST_API_URL/);
  assert.match(app,/\/watchlist/);
  assert.match(manager,/WATCHLIST_API_URL/);
  assert.doesNotMatch(manager,/github\.com\/.*issues\/new/);
  assert.match(runner,/WATCHLIST_API_URL/);
  assert.match(runner,/\/watchlist/);
  assert.match(workflow,/vars\.WATCHLIST_API_URL/);
});

test('watchlist writes stay server-side and require owner authorization',async()=>{
  const worker=await read('watchlist-api/src/index.js');
  assert.match(worker,/X-Owner-Pin/);
  assert.match(worker,/env\.OWNER_PIN/);
  assert.match(worker,/env\.WATCHLIST\.put/);
  assert.doesNotMatch(worker,/github/i);
  assert.doesNotMatch(worker,/LINE_CHANNEL_ACCESS_TOKEN/);
});

test('prospect search falls back across MLB and MiLB sport directories',async()=>{
  const manager=await read('watchlist-manager.js');
  assert.match(manager,/SPORT_IDS=\[1,11,12,13,14,16\]/);
  assert.match(manager,/sports\/\$\{id\}\/players\?season=/);
  assert.match(manager,/people\/search\?names=/);
  assert.match(manager,/people\/\$\{q\}\?hydrate=currentTeam/);
  assert.doesNotMatch(manager,/people\/search\?names=\$\{encodeURIComponent\(name\)\}&hydrate=/);
});

test('official Single-A directory contains Lan-Hong Su prospect ID 837088',async()=>{
  const season=new Date().getUTCFullYear();
  const response=await fetch(`https://statsapi.mlb.com/api/v1/sports/14/players?season=${season}`,{headers:{Accept:'application/json'}});
  assert.equal(response.ok,true,`MLB Single-A directory returned ${response.status}`);
  const data=await response.json();
  assert.ok((data.people||[]).some(player=>Number(player.id)===837088),'Lan-Hong Su (837088) missing from Single-A player directory');
});
