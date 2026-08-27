import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const source=await readFile(new URL('../ranking-engine.js',import.meta.url),'utf8');

test('ranking engine is network-free and separated from refresh',()=>{
  assert.doesNotMatch(source,/\bfetch\s*\(/);
  assert.doesNotMatch(source,/XMLHttpRequest|OBSERVATION_API_URL|CENTRAL_DASHBOARD_SNAPSHOT/);
  assert.match(source,/window\.TaiwanMlbRanking/);
});

test('ranking engine includes hitter and pitcher metrics',()=>{
  for(const metric of ['AVG','OPS','HR','K%','BB%','ERA','WHIP','K/9'])assert.match(source,new RegExp(metric.replace('/','\\/')));
});
