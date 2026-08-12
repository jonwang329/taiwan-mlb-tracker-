import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read=path=>readFile(new URL(`../${path}`,import.meta.url),'utf8');

test('Taiwan production LINE scheduler uses four explicit resilient slots',async()=>{
  const yml=await read('.github/workflows/line-daily-updates.yml');
  assert.match(yml,/cron: "7 7 \* \* \*"/);
  assert.match(yml,/cron: "7 8 \* \* \*"/);
  assert.match(yml,/cron: "7 9 \* \* \*"/);
  assert.match(yml,/cron: "7 12 \* \* \*"/);
  assert.match(yml,/timezone: "Asia\/Taipei"/);
  assert.match(yml,/EVENT_SCHEDULE/);
  assert.match(yml,/"7 7 \* \* \*"\)\s+mode="morning"; slot="07"/);
  assert.match(yml,/"7 8 \* \* \*"\)\s+mode="changes"; slot="08"/);
  assert.match(yml,/"7 9 \* \* \*"\)\s+mode="changes"; slot="09"/);
  assert.match(yml,/"7 12 \* \* \*"\)\s+mode="final"; slot="12"/);
  assert.match(yml,/NOTIFICATION_SLOT/);assert.match(yml,/workflow_dispatch:/);assert.match(yml,/--test/);
});

test('LINE retries are deduplicated and no-change slots still notify',async()=>{
  const sender=await read('scripts/send-line-update.mjs');
  assert.match(sender,/_deliveries/);assert.match(sender,/alreadyDelivered/);assert.match(sender,/retry suppressed/);assert.match(sender,/No new player changes since the previous update/);
});

test('in-progress and same-day player data stay fresh',async()=>{
  const data=await read('scripts/shared-tracker-data.mjs');const app=await read('app.js');
  assert.match(data,/\/game\/\$\{scheduled\.gamePk\}\/boxscore/);
  assert.match(data,/plateAppearances/);
  assert.match(data,/liveBoxscoreAppearance/);
  assert.match(data,/cache:"no-store"/);
  assert.match(data,/liveSource/);
  assert.match(data,/candidateTeamIds/);
  assert.match(data,/latest\?\.team\?\.id/);
  assert.match(app,/fetchLiveToday/);
  assert.match(app,/games\.slice\(0,5\)\.map\(g=>g\.team\?\.id\)/);
  assert.match(app,/slice\(0,4\)/);
  assert.match(app,/stableJson\(`\$\{base\}&stats=season`\),freshJson\(`\$\{base\}&stats=gameLog`\)/);
  assert.match(app,/\/game\/\$\{g\.gamePk\}\/boxscore/);
  assert.match(app,/plateAppearances/);
  assert.match(app,/LIVE · 已出賽/);
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

test('Cloudflare Worker requires owner auth and migrates Huang once',async()=>{
  const worker=await read('cloudflare/observation-worker.js');const deploy=await read('.github/workflows/deploy-observation-worker.yml');
  assert.match(worker,/OWNER_KEY_SHA256/);assert.match(worker,/Bearer /);assert.match(worker,/\/owner\/verify/);
  assert.doesNotMatch(worker,/TRUSTED_ORIGINS\.has\(origin\)\) return true/);
  assert.match(worker,/request\.method === 'POST'/);assert.match(worker,/request\.method==='DELETE'/);assert.match(worker,/env\.OBSERVATION_LIST\.put/);assert.match(worker,/mlbPlayer\(id\)/);
  assert.match(worker,/MIGRATION_KEY/);assert.match(worker,/829473/);assert.match(worker,/黃仲翔 Chung-Hsiang Huang/);
  assert.match(deploy,/taiwan-mlb-observation-list/);assert.match(deploy,/binding = "OBSERVATION_LIST"/);
});

test('prospect search falls back across MLB and MiLB sport directories',async()=>{
  const manager=await read('watchlist-manager.js');assert.match(manager,/SPORT_IDS=\[1,11,12,13,14,16\]/);assert.match(manager,/sports\/\$\{id\}\/players\?season=/);assert.match(manager,/people\/search\?names=/);assert.match(manager,/people\/\$\{q\}\?hydrate=currentTeam/);assert.doesNotMatch(manager,/people\/search\?names=\$\{encodeURIComponent\(name\)\}&hydrate=/);
});

test('official Single-A directory contains Lan-Hong Su prospect ID 837088',async()=>{
  const season=new Date().getUTCFullYear();const response=await fetch(`https://statsapi.mlb.com/api/v1/sports/14/players?season=${season}`,{headers:{Accept:'application/json'}});assert.equal(response.ok,true,`MLB Single-A directory returned ${response.status}`);const data=await response.json();assert.ok((data.people||[]).some(player=>Number(player.id)===837088),'Lan-Hong Su (837088) missing from Single-A player directory');
});
