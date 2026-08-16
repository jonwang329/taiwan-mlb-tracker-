import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read=path=>readFile(new URL(`../${path}`,import.meta.url),'utf8');

test('website passes active MLB or MiLB sportId into official schedule query',async()=>{
  const app=await read('app.js');
  assert.match(app,/schedule\?sportId=\$\{sportId\|\|1\}&teamId=\$\{teamId\}&startDate=\$\{start\}&endDate=\$\{end\}/);
  assert.match(app,/return \{sportId,level,season:/);
  assert.match(app,/active\.sportId\|\|1/);
});

test('central snapshot resolves each candidate team sportId before querying the official schedule',async()=>{
  const builder=await read('scripts/build-dashboard-snapshot.mjs');
  assert.match(builder,/async function fetchTeamSportId\(teamId\)/);
  assert.match(builder,/const sportId=await fetchTeamSportId\(teamId\)/);
  assert.match(builder,/schedule\?sportId=\$\{sportId\}&teamId=\$\{teamId\}&startDate=\$\{start\}&endDate=\$\{end\}/);
  assert.match(builder,/return \{sportId,level,season:/);
});

test('LINE collector passes current level sportId into official schedule query',async()=>{
  const data=await read('scripts/shared-tracker-data.mjs');
  assert.match(data,/teamGames\(teamId, sportId, now, fetcher\)/);
  assert.match(data,/schedule\?sportId=\$\{sportId\|\|1\}&teamId=\$\{teamId\}&startDate=\$\{start\}&endDate=\$\{end\}/);
  assert.match(data,/teamGames\(teamId, currentLevel\.sportId\|\|1, now, fetcher\)/);
});
