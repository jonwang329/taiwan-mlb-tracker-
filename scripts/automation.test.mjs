import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read=path=>readFile(new URL(`../${path}`,import.meta.url),'utf8');

test('Cloudflare owns the four Taiwan production LINE slots with one Free-plan cron and GitHub is manual fallback only',async()=>{
  const worker=await read('cloudflare/line-worker.js');
  const wrapper=await read('cloudflare/line-worker-single-cron.js');
  const deploy=await read('.github/workflows/deploy-observation-worker.yml');
  const githubLine=await read('.github/workflows/line-daily-updates.yml');
  assert.doesNotMatch(githubLine,/\bschedule:/);
  assert.match(githubLine,/workflow_dispatch:/);
  assert.match(githubLine,/manual fallback/i);
  assert.match(deploy,/\[triggers\]/);
  assert.match(deploy,/crons = \["0 0,1,4,23 \* \* \*"\]/);
  assert.match(deploy,/main = "cloudflare\/line-worker-single-cron\.js"/);
  assert.match(wrapper,/\['07', '0 23 \* \* \*'\]/);
  assert.match(wrapper,/\['08', '0 0 \* \* \*'\]/);
  assert.match(wrapper,/\['09', '0 1 \* \* \*'\]/);
  assert.match(wrapper,/\['12', '0 4 \* \* \*'\]/);
  assert.match(wrapper,/Asia\/Taipei/);
  assert.match(wrapper,/handler\.scheduled/);
  assert.match(worker,/async scheduled\(controller, env, ctx\)/);
  assert.match(worker,/api\.line\.me\/v2\/bot\/message\/push/);
  assert.match(deploy,/secret put LINE_CHANNEL_ACCESS_TOKEN/);
  assert.match(deploy,/secret put LINE_DESTINATION_ID/);
  assert.match(deploy,/internal\/line-test/);
});

test('Cloudflare LINE production state deduplicates delivered slots in KV',async()=>{
  const worker=await read('cloudflare/observation-worker.js');
  assert.match(worker,/LINE_STATE_KEY/);
  assert.match(worker,/state\.deliveries\?\.\[deliveryKey\]/);
  assert.match(worker,/suppressed:true/);
  assert.match(worker,/OBSERVATION_LIST\.put\(LINE_STATE_KEY/);
  assert.match(worker,/deliveries:trimmed/);
});

test('official gameDate converted to Taiwan drives website and LINE today data',async()=>{
  const data=await read('scripts/shared-tracker-data.mjs');const app=await read('app.js');const html=await read('index.html');const worker=await read('cloudflare/observation-worker.js');
  assert.match(html,/taiwan-game-time\.js/);
  assert.ok(html.indexOf('taiwan-game-time.js')<html.indexOf('app.js'),'Taiwan date helper must load before app.js');
  assert.match(data,/TaiwanGameTime/);
  assert.match(data,/isTaiwanTodayGame/);
  assert.match(data,/officialBoxscoreAppearance/);
  assert.doesNotMatch(data,/baseballDate/);
  assert.match(data,/\/game\/\$\{scheduled\.gamePk\}\/boxscore/);
  assert.match(data,/plateAppearances/);
  assert.match(data,/cache:"no-store"/);
  assert.match(data,/liveSource/);
  assert.match(data,/candidateTeamIds/);
  assert.match(data,/latest\?\.team\?\.id/);
  assert.match(app,/TaiwanGameTime/);
  assert.match(app,/isTaiwanTodayGame/);
  assert.match(app,/fetchOfficialToday/);
  assert.match(app,/games\.slice\(0,5\)\.map\(g=>g\.team\?\.id\)/);
  assert.match(app,/slice\(0,4\)/);
  assert.match(app,/stableJson\(`\$\{base\}&stats=season`\),freshJson\(`\$\{base\}&stats=gameLog`\)/);
  assert.match(app,/\/game\/\$\{g\.gamePk\}\/boxscore/);
  assert.match(app,/plateAppearances/);
  assert.match(app,/LIVE · 已出賽/);
  assert.match(worker,/gameTaiwanDate/);
  assert.match(worker,/todaySchedule/);
  assert.match(worker,/\/game\/\$\{game\.gamePk\}\/boxscore/);
});

test('dashboard bounds MLB requests and keeps last-good data on refresh failure',async()=>{
  const app=await read('app.js');const guard=await read('mlb-fetch-guard.js');const html=await read('index.html');
  assert.match(guard,/MAX_MLB_REQUESTS = 8/);
  assert.match(guard,/acquireMlbSlot/);
  assert.match(guard,/AbortController/);
  assert.match(guard,/attempt < 2/);
  assert.match(html,/mlb-fetch-guard\.js/);
  assert.ok(html.indexOf('mlb-fetch-guard.js')<html.indexOf('app.js'),'fetch guard must load before app.js');
  assert.match(app,/Observation API unavailable; using repository fallback/);
  assert.match(app,/fallbackTrackedPlayers/);
  assert.match(app,/CACHE_KEY='taiwan-mlb-tracker:last-good:v2'/);
  assert.match(app,/restoreSnapshot/);
  assert.match(app,/lastResults\.length/);
  assert.match(app,/sig!==lastSignature/);
  assert.match(app,/MLB API 暫時無法更新 · 上次成功/);
  assert.match(app,/Promise\.allSettled/);
  assert.match(app,/window\.applyTrackedPlayers/);
  assert.doesNotMatch(app,/summary\.innerHTML='<div class="loading">正在讀取 MLB \/ MiLB 資料…<\/div>';const results/);
});

test('manual fallback and Cloudflare deployment tests are clearly labeled',async()=>{
  const sender=await read('scripts/send-line-update.mjs');const data=await read('scripts/shared-tracker-data.mjs');const workflow=await read('.github/workflows/line-daily-updates.yml');const worker=await read('cloudflare/observation-worker.js');
  assert.match(data,/🧪 TEST — Taiwan MLB Tracker/);
  assert.match(sender,/shared-tracker-data\.mjs/);
  assert.match(sender,/Manual test does not modify the production snapshot/);
  assert.match(workflow,/--test/);
  assert.match(worker,/🧪 CLOUDFLARE TEST — Taiwan MLB Tracker/);
  assert.match(worker,/DEPLOY_TEST_TOKEN/);
});

test('dashboard and Cloudflare LINE share the same KV-backed observation list',async()=>{
  const app=await read('app.js');const worker=await read('cloudflare/observation-worker.js');const deploy=await read('.github/workflows/deploy-observation-worker.yml');
  assert.match(app,/OBSERVATION_API_URL/);assert.match(app,/\/players/);
  assert.match(worker,/const KEY = 'players'/);assert.match(worker,/OBSERVATION_LIST\.get\(KEY/);assert.match(worker,/OBSERVATION_LIST\.put\(KEY/);
  assert.match(deploy,/binding = "OBSERVATION_LIST"/);
  assert.match(app,/tracked-players\.json/);
});

test('watchlist UI stays in-site and uses the Owner Password for generic mutations',async()=>{
  const manager=await read('watchlist-manager.js');
  assert.match(manager,/method:action==='add'\?'POST':'DELETE'/);
  assert.match(manager,/Authorization:`Bearer \$\{password\}`/);
  assert.match(manager,/\/owner\/verify/);
  assert.match(manager,/OWNER_SESSION='twmlb_owner_password_session'/);
  assert.match(manager,/data-watch-action="add"/);
  assert.match(manager,/data-watch-action="remove"/);
  assert.match(manager,/window\.applyTrackedPlayers/);
  assert.match(manager,/mutationInFlight/);
  assert.doesNotMatch(manager,/await loadTrackedPlayers\(\)/);
  assert.doesNotMatch(manager,/issues\/new/);
  assert.doesNotMatch(manager,/github\.com/);
});

test('Cloudflare Worker uses generic idempotent add/delete without one-player migrations',async()=>{
  const worker=await read('cloudflare/observation-worker.js');const deploy=await read('.github/workflows/deploy-observation-worker.yml');
  assert.match(worker,/OWNER_KEY_SHA256/);assert.match(worker,/Bearer /);assert.match(worker,/\/owner\/verify/);
  assert.doesNotMatch(worker,/TRUSTED_ORIGINS\.has\(origin\)\) return true/);
  assert.match(worker,/request\.method==='POST'/);assert.match(worker,/request\.method==='DELETE'/);assert.match(worker,/env\.OBSERVATION_LIST\.put/);assert.match(worker,/mlbPlayer\(id\)/);
  assert.match(worker,/alreadyTracked:true/);assert.match(worker,/alreadyRemoved:true/);
  assert.doesNotMatch(worker,/MIGRATION_KEY/);assert.doesNotMatch(worker,/migration:2026/);
  assert.match(deploy,/taiwan-mlb-observation-list/);assert.match(deploy,/binding = "OBSERVATION_LIST"/);
});

test('Manage search is open across MLB and MiLB and Taiwan identities are enrichment only',async()=>{
  const manager=await read('watchlist-manager.js');const identities=await read('player-identities.js');
  assert.match(identities,/id:808207,zh:'潘文輝',en:'Wen-Hui Pan'/);
  assert.match(identities,/zh:'賴謙凡',en:'Chien-Fan Lai'/);
  assert.match(identities,/zh:'林珺希',en:'Chun-Hsi Lin'/);
  assert.match(identities,/zh:'何樺',en:'Hua Ho'/);
  assert.match(identities,/zh:'林睿杰',en:'Ruei-Chieh Lin'/);
  assert.match(manager,/const SPORT_IDS=\[1,11,12,13,14,16\]/);
  assert.match(manager,/sports\/\$\{id\}\/players\?season=\$\{season\}/);
  assert.match(manager,/normalize\(p\.fullName\|\|p\.name\)\.includes\(n\)/);
  assert.match(manager,/partialQuery/);
  assert.match(manager,/directoryMatches\(q\)/);
  assert.match(manager,/people\/search\?names=\$\{encodeURIComponent\(name\)\}&hydrate=currentTeam/);
  assert.doesNotMatch(manager,/const TAIWAN_PLAYER_CATALOG=/);
});

test('official Single-A directory contains Lan-Hong Su prospect ID 837088',async()=>{
  const season=new Date().getUTCFullYear();const response=await fetch(`https://statsapi.mlb.com/api/v1/sports/14/players?season=${season}`,{headers:{Accept:'application/json'}});assert.equal(response.ok,true,`MLB Single-A directory returned ${response.status}`);const data=await response.json();assert.ok((data.people||[]).some(player=>Number(player.id)===837088),'Lan-Hong Su (837088) missing from Single-A player directory');
});
