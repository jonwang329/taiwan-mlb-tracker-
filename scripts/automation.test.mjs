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

test('dashboard and LINE use the same Cloudflare observation API with setup fallback',async()=>{
  const app=await read('app.js');
  const lineData=await read('scripts/shared-tracker-data.mjs');
  const lineWorkflow=await read('.github/workflows/line-daily-updates.yml');
  assert.match(app,/OBSERVATION_API_URL/);
  assert.match(app,/\/players/);
  assert.match(lineData,/OBSERVATION_API_URL/);
  assert.match(lineData,/\/players/);
  assert.match(lineWorkflow,/OBSERVATION_API_URL/);
  assert.match(app,/tracked-players\.json/);
  assert.match(lineData,/tracked-players\.json/);
});

test('watchlist automation accepts only owner requests and writes through protected API',async()=>{
  const yml=await read('.github/workflows/watchlist-manager.yml');
  const manager=await read('scripts/manage-watchlist.mjs');
  assert.match(yml,/author_association == 'OWNER'/);
  assert.match(yml,/issues: write/);
  assert.match(yml,/contents: read/);
  assert.match(yml,/OBSERVATION_ADMIN_TOKEN/);
  assert.doesNotMatch(yml,/git push origin main/);
  assert.match(manager,/Authorization:`Bearer \$\{adminToken\}`/);
  assert.match(manager,/OBSERVATION_API_URL/);
});

test('Cloudflare Worker binds KV and protects mutations',async()=>{
  const worker=await read('cloudflare/observation-worker.js');
  const deploy=await read('.github/workflows/deploy-observation-worker.yml');
  assert.match(worker,/env\.OBSERVATION_LIST\.get/);
  assert.match(worker,/env\.OBSERVATION_LIST\.put/);
  assert.match(worker,/Bearer \$\{env\.ADMIN_TOKEN\}/);
  assert.match(worker,/request\.method === 'POST'/);
  assert.match(worker,/request\.method === 'DELETE'/);
  assert.match(deploy,/taiwan-mlb-observation-list/);
  assert.match(deploy,/binding = "OBSERVATION_LIST"/);
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
