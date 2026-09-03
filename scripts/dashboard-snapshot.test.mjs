import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read=path=>readFile(new URL(`../${path}`,import.meta.url),'utf8');

test('central snapshot is loaded before app bootstrap',async()=>{
  const index=await read('index.html');
  const central=index.indexOf('data/dashboard-snapshot.js');
  const bootstrap=index.indexOf('snapshot-bootstrap.js');
  const app=index.indexOf('app.js');
  assert.ok(central>=0&&bootstrap>central&&app>bootstrap,'central snapshot and bootstrap must load before app.js');
});

test('central snapshot preserves a complete newer local cache and repairs incomplete rosters',async()=>{
  const bootstrap=await read('snapshot-bootstrap.js');
  assert.match(bootstrap,/taiwan-mlb-tracker:last-good:v2/);
  assert.match(bootstrap,/CENTRAL_DASHBOARD_SNAPSHOT/);
  assert.match(bootstrap,/localHasFullRoster/);
  assert.match(bootstrap,/!localHasFullRoster\|\|Number\(local\.savedAt\|\|0\)<Number\(central\.savedAt\|\|0\)/);
  assert.match(bootstrap,/localStorage\.setItem/);
});

test('official MLB or MiLB data is the refresh source of truth',async()=>{
  const app=await read('app.js');
  assert.match(app,/fetchOfficialToday/);
  assert.match(app,/startDate=\$\{start\}&endDate=\$\{end\}/);
  assert.match(app,/gameTaiwanDate/);
  assert.match(app,/status\?\.abstractGameState==='Live'/);
  assert.doesNotMatch(app,/BASEBALL_DAY_CUTOFF|gameDay\(\)/);
});

test('website checks automatically at startup and after returning to the tab',async()=>{
  const app=await read('app.js');
  assert.match(app,/refreshData\(\{reason:'startup'\}\)/);
  assert.match(app,/visibilitychange/);
  assert.match(app,/AUTO_RECHECK_MS=5\*60\*1000/);
  assert.match(app,/refreshData\(\{reason:'resume'\}\)/);
});

test('Refresh button always requests official data immediately',async()=>{
  const app=await read('app.js');
  assert.match(app,/refresh-btn[^\n]*addEventListener\('click'/);
  assert.match(app,/await refreshCentralSnapshot\(\)/);
  assert.match(app,/TaiwanMlbUniverseScan\(\{force:true\}\)/);
  assert.match(app,/refreshData\(\{reason:'button-background'\}\)/);
  assert.match(app,/await loadTrackedPlayers\(\)/);
  assert.match(app,/await collectResults\(\)/);
  assert.doesNotMatch(app,/refreshCooldown/i);
});

test('API failure preserves last-good screen and shows last successful time',async()=>{
  const app=await read('app.js');
  assert.match(app,/if\(lastResults\.length\)\{setTrackedPlayers\(lastPlayers\)/);
  assert.match(app,/MLB API 暫時無法更新 · 上次成功/);
  assert.match(app,/Promise\.allSettled/);
  assert.match(app,/previousById/);
});

test('dashboard paint tolerates a transient player/result length mismatch',async()=>{
  const app=await read('app.js');
  assert.match(app,/safeResults=players\.map\(\(_,i\)=>results\?\.\[i\]\|\|lastResults\?\.\[i\]/);
  assert.match(app,/summaryGroup\('hitting',safeResults\)/);
  assert.match(app,/updateMetrics\(safeResults\)/);
});

test('central fallback builder uses the same official schedule and boxscore source',async()=>{
  const builder=await read('scripts/build-dashboard-snapshot.mjs');
  assert.match(builder,/fetchOfficialToday/);
  assert.match(builder,/startDate=\$\{start\}&endDate=\$\{end\}/);
  assert.match(builder,/gameTaiwanDate/);
  assert.match(builder,/MLB schedule API unavailable/);
  assert.doesNotMatch(builder,/BASEBALL_DAY_CUTOFF|gameDay\(\)/);
});

test('snapshot builder preserves last-good data and skips only invalid players',async()=>{
  const builder=await read('scripts/build-dashboard-snapshot.mjs');
  assert.match(builder,/MAX_MLB_REQUESTS=8/);
  assert.match(builder,/AbortController/);
  assert.match(builder,/previousById/);
  assert.match(builder,/snapshotPlayers/);
  assert.match(builder,/Skipping \$\{player\.name\}: no fresh or previous dashboard data is available/);
  assert.match(builder,/No valid dashboard players are available/);
  assert.match(builder,/games:games\.slice\(0,5\)/);
  assert.match(builder,/compactLevels/);
  assert.match(builder,/signature\(previous\)===signature\(next\)/);
});

test('snapshot workflow only commits the data file and cannot loop on itself',async()=>{
  const workflow=await read('.github/workflows/refresh-dashboard-snapshot.yml');
  assert.match(workflow,/permissions:\s*\n\s*contents: write/);
  assert.match(workflow,/paths-ignore:\s*\n\s*- 'data\/dashboard-snapshot\.js'/);
  assert.match(workflow,/git add data\/dashboard-snapshot\.js/);
  assert.match(workflow,/git diff --quiet -- data\/dashboard-snapshot\.js/);
  assert.match(workflow,/\*\/5 \* \* \* \*/);
  assert.doesNotMatch(workflow,/send-line-update|line-daily-updates/i);
});
