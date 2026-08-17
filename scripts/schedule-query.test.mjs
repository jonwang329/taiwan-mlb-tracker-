import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const read=path=>readFile(new URL(`../${path}`,import.meta.url),'utf8');

test('browser live refresh never rediscovers schedules',async()=>{
  const live=await read('live-refresh.js');
  assert.match(live,/knownGameIds/);
  assert.match(live,/result\?\.today\?\.game\?\.gamePk/);
  assert.match(live,/game\/\$\{gamePk\}\/feed\/live/);
  assert.doesNotMatch(live,/\/schedule\?|sportId=|teamCandidates|discoverGames/);
});

test('central snapshot uses teamId as authoritative schedule identity',async()=>{
  const builder=await read('scripts/build-dashboard-snapshot.mjs');
  assert.match(builder,/schedule\?teamId=\$\{teamId\}&startDate=\$\{start\}&endDate=\$\{end\}/);
  assert.doesNotMatch(builder,/schedule\?sportId=\$\{sportId\|\|1\}&teamId=/);
  assert.match(builder,/return \{sportId,level,season:/);
});

test('Taiwan date filtering remains in canonical discovery',async()=>{
  const builder=await read('scripts/build-dashboard-snapshot.mjs');
  assert.match(builder,/filter\(game=>isTaiwanTodayGame\(game,now\)\)/);
});
