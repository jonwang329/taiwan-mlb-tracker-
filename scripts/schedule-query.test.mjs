import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read=path=>readFile(new URL(`../${path}`,import.meta.url),'utf8');

test('fast live refresh discovers schedules by team identity without a conflicting sport filter',async()=>{
  const live=await read('live-refresh.js');
  assert.match(live,/schedule\?teamId=\$\{item\.teamId\}&startDate=\$\{start\}&endDate=\$\{end\}/);
  assert.doesNotMatch(live,/schedule\?sportId=\$\{item\.sportId/);
});

test('central snapshot uses teamId as the authoritative schedule identity',async()=>{
  const builder=await read('scripts/build-dashboard-snapshot.mjs');
  assert.match(builder,/schedule\?teamId=\$\{teamId\}&startDate=\$\{start\}&endDate=\$\{end\}/);
  assert.doesNotMatch(builder,/schedule\?sportId=\$\{sportId\|\|1\}&teamId=/);
  assert.match(builder,/return \{sportId,level,season:/);
});

test('Taiwan date filtering remains mandatory after schedule discovery',async()=>{
  const live=await read('live-refresh.js');
  const builder=await read('scripts/build-dashboard-snapshot.mjs');
  assert.match(live,/filter\(game => isTaiwanTodayGame\(game, now\)\)/);
  assert.match(builder,/filter\(game=>isTaiwanTodayGame\(game,now\)\)/);
});
