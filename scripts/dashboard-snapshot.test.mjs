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

test('central snapshot seeds the existing last-good cache only when newer',async()=>{
  const bootstrap=await read('snapshot-bootstrap.js');
  assert.match(bootstrap,/taiwan-mlb-tracker:last-good:v2/);
  assert.match(bootstrap,/CENTRAL_DASHBOARD_SNAPSHOT/);
  assert.match(bootstrap,/localSaved>=centralSaved/);
  assert.match(bootstrap,/localStorage\.setItem/);
});

test('website Refresh always requests live data immediately',async()=>{
  const app=await read('app.js');
  assert.match(app,/refresh-btn[^\n]*addEventListener\('click'/);
  assert.match(app,/await refreshData\(\)/);
  assert.match(app,/async function refreshData/);
  assert.match(app,/await loadTrackedPlayers\(\)/);
  assert.match(app,/await collectResults\(\)/);
  assert.doesNotMatch(app,/setInterval|setTimeout\([^)]*refreshData|lastRefresh|refreshCooldown/i);
});

test('browser and central snapshot keep overnight games in the same baseball day',async()=>{
  const [app,builder,index]=await Promise.all([read('app.js'),read('scripts/build-dashboard-snapshot.mjs'),read('index.html')]);
  for(const source of [app,builder]){
    assert.match(source,/BASEBALL_DAY_CUTOFF_HOURS=6/);
    assert.match(source,/Date\.now\(\)-BASEBALL_DAY_CUTOFF_HOURS\*60\*60\*1000/);
    assert.match(source,/timeZone:'America\/New_York'/);
  }
  assert.match(index,/app\.js\?v=20260812-baseball-day/);
});

test('snapshot builder preserves complete last-known-good player data',async()=>{
  const builder=await read('scripts/build-dashboard-snapshot.mjs');
  assert.match(builder,/MAX_MLB_REQUESTS=8/);
  assert.match(builder,/AbortController/);
  assert.match(builder,/previousById/);
  assert.match(builder,/No fresh or previous dashboard data is available/);
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
  assert.match(workflow,/3,18,33,48 \* \* \* \*/);
  assert.doesNotMatch(workflow,/send-line-update|line-daily-updates/i);
});
