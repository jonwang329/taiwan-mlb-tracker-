import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source=fs.readFileSync(new URL('../today-stat-line.js',import.meta.url),'utf8');
const window={};
vm.runInNewContext(source,{window});

test('Hao-Yu Lee live line keeps strikeouts and RBI',()=>{
  const text=window.TaiwanTodayStatLine(
    {group:'hitting'},
    {hits:1,atBats:3,plateAppearances:3,strikeOuts:2,rbi:1}
  );
  assert.equal(text,'1-3 · 3 PA · 2 K · 1 RBI');
});

test('all dashboard repaint modules use the one Today formatter',()=>{
  const files=['app.js','live-refresh.js','gameday-universe-hotfix.js','gameday-presence-hotfix.js','live-stat-authority.js','gameday-current-team-hotfix.js','summary-extra-stats.js'];
  for(const file of files){
    const body=fs.readFileSync(new URL(`../${file}`,import.meta.url),'utf8');
    assert.match(body,/TaiwanTodayStatLine/,`${file} must use the shared Today formatter`);
  }
});

test('retired Korean player Lim Chang-yong is absent from shipped data',()=>{
  const files=['tracked-players.json','npb-update.js','data/dashboard-snapshot.js'];
  for(const file of files){
    const body=fs.readFileSync(new URL(`../${file}`,import.meta.url),'utf8');
    assert.doesNotMatch(body,/林昌勇|林昶勇|Lim Chang[- ]?yong|Chang[- ]?yong Lim|임창용/i,`${file} contains the removed Korean player`);
  }
});
