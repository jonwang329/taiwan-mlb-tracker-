import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read=path=>readFile(new URL(`../${path}`,import.meta.url),'utf8');

test('Taiwan production cron schedule has retry windows',async()=>{
  const yml=await read('.github/workflows/line-daily-updates.yml');
  for(const cron of ['5,15,25,35 23 * * *','5,15,25,35 0 * * *','5,15,25,35 1 * * *','5,15,25,35 4 * * *']) assert.match(yml,new RegExp(cron.replace(/[,*]/g,m=>m==='*'?'\\*':m)));
  assert.match(yml,/NOTIFICATION_SLOT/);assert.match(yml,/slot="07"/);assert.match(yml,/slot="08"/);assert.match(yml,/slot="09"/);assert.match(yml,/slot="12"/);
  assert.match(yml,/workflow_dispatch:/);assert.match(yml,/--test/);
});

test('LINE retries are deduplicated and no-change slots still notify',async()=>{
  const sender=await read('scripts/send-line-update.mjs');
  assert.match(sender,/_deliveries/);assert.match(sender,/alreadyDelivered/);assert.match(sender,/retry suppressed/);assert.match(sender,/No new player changes since the previous update/);
});

test('in-progress player data uses live boxscore instead of waiting for gameLog',async()=>{
  const data=await read('scripts/shared-tracker-data.mjs');
  assert.match(data,/\/game\/\$\{scheduled\.gamePk\}\/boxscore/);
  assert.match(data,/plateAppearances/);
  assert.match(data,/liveBoxscoreAppearance/);
  assert.match(data,/cache:"no-store"/);
  assert.match(data,/liveSource/);
});

test('manual LINE tests are clearly labeled and share production sender',async()=>{
  const sender=await read('scripts/send-line-update.mjs');const data=await read('scripts/shared-tracker-data.mjs');
  assert.match(data,/🧪 TEST — Taiwan MLB Tracker/);assert.match(sender,/shared-tracker-data\.mjs/);assert.match(sender,/Manual test does not modify the production snapshot/);
});

test('dashboard and LINE use the same Cloudflare observation API with setup fallback',async()=>{
  const app=await read('app.js');const lineData=await read('scripts/shared-tracker-data.mjs');const lineWorkflow=await read('.github/workflows/line-daily-updates.yml');
  assert.match(app,/OBSERVATION_API_URL/);assert.match(app,/\/players/);assert.match(lineData,/OBSERVATION_API_URL/);assert.match(lineData,/\/players/);assert.match(lineWorkflow,/OBSERVATION_API_URL/);assert.match(app,/tracked-players\.json/);assert.match(lineData,/tracked-players\.json/);
});

test('watchlist UI stays in-site and requires owner bearer authentication',async()=>{
  const manager=await read('watchlist-manager.js');
  assert.match(manager,/method:action==='add'\?'POST':'DELETE'/);
  assert.match(manager,/Authorization:`Bearer \$\{key\}`/);
  assert.match(manager,/\/owner\/verify/);
  assert.match(manager,/sessionStorage/);
  assert.match(manager,/data-watch-action="add"/);
  assert.match(manager,/data-watch-action="remove"/);
  assert.doesNotMatch(manager,/issues\/new/);
  assert.doesNotMatch(manager,/github\.com/);
});

test('Cloudflare Worker requires owner key for every mutation',async()=>{
  const worker=await read('cloudflare/observation-worker.js');const deploy=await read('.github/workflows/deploy-observation-worker.yml');
  assert.match(worker,/OWNER_KEY_SHA256/);assert.match(worker,/Bearer /);assert.match(worker,/\/owner\/verify/);
  assert.doesNotMatch(worker,/TRUSTED_ORIGINS\.has\(origin\)\) return true/);
  assert.match(worker,/request\.method === 'POST'/);assert.match(worker,/request\.method==='DELETE'/);assert.match(worker,/env\.OBSERVATION_LIST\.put/);assert.match(worker,/mlbPlayer\(id\)/);
  assert.match(deploy,/taiwan-mlb-observation-list/);assert.match(deploy,/binding = "OBSERVATION_LIST"/);
});

test('prospect search falls back across MLB and MiLB sport directories',async()=>{
  const manager=await read('watchlist-manager.js');assert.match(manager,/SPORT_IDS=\[1,11,12,13,14,16\]/);assert.match(manager,/sports\/\$\{id\}\/players\?season=/);assert.match(manager,/people\/search\?names=/);assert.match(manager,/people\/\$\{q\}\?hydrate=currentTeam/);assert.doesNotMatch(manager,/people\/search\?names=\$\{encodeURIComponent\(name\)\}&hydrate=/);
});

test('official Single-A directory contains Lan-Hong Su prospect ID 837088',async()=>{
  const season=new Date().getUTCFullYear();const response=await fetch(`https://statsapi.mlb.com/api/v1/sports/14/players?season=${season}`,{headers:{Accept:'application/json'}});assert.equal(response.ok,true,`MLB Single-A directory returned ${response.status}`);const data=await response.json();assert.ok((data.people||[]).some(player=>Number(player.id)===837088),'Lan-Hong Su (837088) missing from Single-A player directory');
});
