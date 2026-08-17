import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const read=path=>readFile(new URL(`../${path}`,import.meta.url),'utf8');

test('canonical snapshot loads before renderer',async()=>{
  const index=await read('index.html');
  const central=index.indexOf('data/dashboard-snapshot.js');
  const bootstrap=index.indexOf('snapshot-bootstrap.js');
  const app=index.indexOf('app.js');
  assert.ok(central>=0&&bootstrap>central&&app>bootstrap);
});

test('legacy localStorage baseball truth is removed, not seeded',async()=>{
  const bootstrap=await read('snapshot-bootstrap.js');
  assert.match(bootstrap,/CENTRAL_DASHBOARD_SNAPSHOT/);
  assert.match(bootstrap,/localStorage\.removeItem\('taiwan-mlb-tracker:last-good:v2'\)/);
  assert.doesNotMatch(bootstrap,/localStorage\.setItem/);
});

test('browser is a canonical snapshot renderer with explicit freshness',async()=>{
  const app=await read('app.js');
  assert.match(app,/CENTRAL_DASHBOARD_SNAPSHOT/);
  assert.match(app,/savedAt/);
  assert.match(app,/VERIFIED/);
  assert.match(app,/STALE/);
  assert.match(app,/WAITING FOR MLB/);
  assert.doesNotMatch(app,/fetchOfficialToday|\/schedule\?|restoreSnapshot|localStorage\.setItem/);
});

test('live browser refresh only follows a canonical gamePk',async()=>{
  const live=await read('live-refresh.js');
  assert.match(live,/knownGameIds/);
  assert.match(live,/game\/\$\{gamePk\}\/feed\/live/);
  assert.match(live,/canonicalGamePk/);
  assert.doesNotMatch(live,/\/schedule\?|teamCandidates|discoverGames/);
});

test('central builder owns official schedule and boxscore collection',async()=>{
  const builder=await read('scripts/build-dashboard-snapshot.mjs');
  assert.match(builder,/fetchOfficialToday/);
  assert.match(builder,/schedule\?teamId=\$\{teamId\}&startDate=\$\{start\}&endDate=\$\{end\}/);
  assert.match(builder,/\/game\/\$\{g\.gamePk\}\/boxscore/);
  assert.match(builder,/previousById/);
  assert.match(builder,/signature\(previous\)===signature\(next\)/);
});

test('snapshot workflow refreshes centrally and never sends LINE itself',async()=>{
  const workflow=await read('.github/workflows/refresh-dashboard-snapshot.yml');
  assert.match(workflow,/git add data\/dashboard-snapshot\.js/);
  assert.match(workflow,/7,17,27,37,47,57 \* \* \* \*/);
  assert.doesNotMatch(workflow,/send-line-update|line-daily-updates/i);
});
