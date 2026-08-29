import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read=path=>readFile(new URL(`../${path}`,import.meta.url),'utf8');

test('fast live refresh discovers schedules by deduplicated team identity without a guessed sport filter',async()=>{
  const live=await read('live-refresh.js');
  assert.match(live,/schedule\?teamId=\$\{teamId\}&startDate=\$\{start\}&endDate=\$\{end\}/);
  assert.match(live,/uniqueTeams/);
  assert.doesNotMatch(live,/schedule\?sportId=\$\{item\.sportId/);
});

test('central snapshot resolves each team official sportId before querying its schedule',async()=>{
  const builder=await read('scripts/build-dashboard-snapshot.mjs');
  assert.match(builder,/officialTeamSportId\(teamId\)/);
  assert.match(builder,/schedule\?teamId=\$\{teamId\}&sportId=\$\{sportId\}&startDate=\$\{start\}&endDate=\$\{end\}/);
  assert.match(builder,/Official sportId unavailable for team/);
  assert.match(builder,/return \{sportId,level,season:/);
});

test('LINE production notifier uses Cloudflare schedule wrapper and official team sport identity',async()=>{
  const wrapper=await read('cloudflare/line-worker-single-cron.js');
  const flex=await read('cloudflare/line-flex-worker.js');
  assert.match(wrapper,/Cloudflare is the only production LINE scheduler/);
  assert.match(wrapper,/handler\.scheduled/);
  assert.match(flex,/const sportId = Number\(info\?\.sport\?\.id \|\| 1\)/);
  assert.match(flex,/gamesForTeam\(teamId, sportId\)/);
  assert.match(flex,/schedule\?sportId=\$\{sportId\}&startDate=\$\{start\}&endDate=\$\{end\}/);
});

test('Taiwan date filtering remains mandatory after schedule discovery',async()=>{
  const live=await read('live-refresh.js');
  const builder=await read('scripts/build-dashboard-snapshot.mjs');
  assert.match(live,/filter\(game => isTaiwanTodayGame\(game, now\)\)/);
  assert.match(builder,/filter\(game=>isTaiwanTodayGame\(game,now\)\)/);
});
