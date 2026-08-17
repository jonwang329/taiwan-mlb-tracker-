import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const read=path=>readFile(new URL(`../${path}`,import.meta.url),'utf8');

test('Cloudflare owns the four Taiwan LINE slots and GitHub is manual fallback only',async()=>{
  const wrapper=await read('cloudflare/line-worker-single-cron.js');
  const deploy=await read('.github/workflows/deploy-observation-worker.yml');
  const githubLine=await read('.github/workflows/line-daily-updates.yml');
  assert.doesNotMatch(githubLine,/\bschedule:/);
  assert.match(githubLine,/workflow_dispatch:/);
  assert.match(deploy,/crons = \["0 0,1,4,23 \* \* \*"\]/);
  for(const [hour,cron] of [['07','0 23'],['08','0 0'],['09','0 1'],['12','0 4']]) assert.match(wrapper,new RegExp(`\\['${hour}', '${cron} \\* \\* \\*'\\]`));
  assert.match(wrapper,/line-canonical-worker\.js/);
});

test('website baseball truth comes only from canonical snapshot',async()=>{
  const app=await read('app.js');const bootstrap=await read('snapshot-bootstrap.js');
  assert.match(app,/CENTRAL_DASHBOARD_SNAPSHOT/);
  assert.match(app,/VERIFIED/);assert.match(app,/STALE/);assert.match(app,/WAITING FOR MLB/);
  assert.doesNotMatch(app,/fetchOfficialToday|\/schedule\?|OBSERVATION_API_URL|tracked-players\.json|localStorage\.setItem/);
  assert.match(bootstrap,/localStorage\.removeItem\('taiwan-mlb-tracker:last-good:v2'\)/);
  assert.doesNotMatch(bootstrap,/localStorage\.setItem/);
});

test('browser live refresh only reads MLB feed for known canonical gamePk',async()=>{
  const live=await read('live-refresh.js');
  assert.match(live,/knownGameIds/);
  assert.match(live,/api\/v1\.1/);
  assert.match(live,/game\/\$\{gamePk\}\/feed\/live/);
  assert.doesNotMatch(live,/\/schedule\?|teamCandidates|discoverGames/);
});

test('production LINE reads canonical dashboard snapshot and never re-queries MLB roster/schedule',async()=>{
  const worker=await read('cloudflare/line-canonical-worker.js');
  assert.match(worker,/dashboard-snapshot\.js/);
  assert.match(worker,/CENTRAL_DASHBOARD_SNAPSHOT/);
  assert.match(worker,/FRESH_MS/);
  assert.match(worker,/STALE/);
  assert.match(worker,/LINE_STATE_KEY/);
  assert.match(worker,/api\.line\.me\/v2\/bot\/message\/push/);
  assert.doesNotMatch(worker,/statsapi\.mlb\.com|\/schedule\?|\/people\?|currentTeam/);
});

test('12:00 final slot always sends a verified or stale status report',async()=>{
  const worker=await read('cloudflare/line-canonical-worker.js');
  assert.match(worker,/\['0 4 \* \* \*',\{slot:'12',mode:'final'\}\]/);
  assert.match(worker,/cfg\.mode!==\'changes\'/);
  assert.match(worker,/最後 MLB 驗證/);
  assert.match(worker,/WAITING FOR MLB/);
});

test('canonical builder owns official schedule and boxscore truth',async()=>{
  const builder=await read('scripts/build-dashboard-snapshot.mjs');
  assert.match(builder,/schedule\?teamId=\$\{teamId\}&startDate=\$\{start\}&endDate=\$\{end\}/);
  assert.match(builder,/\/game\/\$\{game\.gamePk\}\/boxscore/);
  assert.match(builder,/ID\$\{player\.id\}/);
  assert.doesNotMatch(builder,/schedule\?sportId=\$\{sportId\|\|1\}&teamId=/);
});

test('watchlist mutations stay generic and Chinese identities are enrichment only',async()=>{
  const manager=await read('watchlist-manager.js');const identities=await read('player-identities.js');
  assert.match(manager,/method:action==='add'\?'POST':'DELETE'/);
  assert.match(manager,/window\.applyTrackedPlayers/);
  assert.match(identities,/TaiwanPlayerIdentities/);
  assert.doesNotMatch(manager,/const TAIWAN_PLAYER_CATALOG=/);
});
