import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const identities=fs.readFileSync('player-identities.js','utf8');
const highlight=fs.readFileSync('today-highlight.js','utf8');

test('shared Taiwan identities include newly tracked players',()=>{
  assert.match(identities,/837088,zh:'蘇嵐鴻',en:'Lan-Hong Su'/);
  assert.match(identities,/800213,zh:'張弘稜',en:'Hung-Leng Chang'/);
});

test('highlight keeps Chinese headline and all-player pulse',()=>{
  assert.match(highlight,/今日重點 · TODAY’S HIGHLIGHT/);
  assert.match(highlight,/今日暫無出賽/);
  assert.match(highlight,/所有追蹤球員今日動態/);
});
