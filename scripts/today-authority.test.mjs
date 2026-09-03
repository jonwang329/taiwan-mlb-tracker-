import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
const app=await readFile(new URL('../app.js',import.meta.url),'utf8');
const resolver=await readFile(new URL('../gameday-universe-hotfix.js',import.meta.url),'utf8');

test('production has one ID-first today authority and no legacy writers',()=>{
  assert.match(html,/today-stat-line\.js\?v=20260903-single-authority-v1[^]*app\.js\?v=20260903-single-authority-v2[^]*gameday-universe-hotfix\.js\?v=20260903-single-authority-v1/);
  for(const legacy of ['official-today-hotfix.js','live-refresh.js','gameday-presence-hotfix.js','single-source-status-hotfix.js']){
    assert.doesNotMatch(html,new RegExp(`<script[^>]+${legacy.replaceAll('.','\\.')}`));
  }
  assert.match(resolver,/playersInPublishedLineup/);
  assert.match(resolver,/idSet\(currentPairs\)/);
  assert.match(resolver,/players\.length && lastResults\.length/);
  assert.match(resolver,/currentMlbTeamIds\(currentPairs\)/);
  assert.match(resolver,/teamId=\$\{mlbTeamIds\.join\(','\)\}/);
  assert.doesNotMatch(resolver,/SPORT_IDS/);
  assert.doesNotMatch(resolver,/李灝宇|鄧愷威|701678|678906/);
});

test('refresh uses the same resolver and preserves confirmed state',()=>{
  assert.match(app,/refreshCentralSnapshot\(\)/);
  assert.match(app,/TaiwanMlbUniverseScan\(\{force:true\}\)\.catch/);
  assert.doesNotMatch(app,/await window\.TaiwanMlbUniverseScan/);
  assert.match(app,/today\?\.scheduled\|\|today\?\.onGame/);
  assert.doesNotMatch(app,/summary-today[^\n]+正在確認今日出賽/);
});
