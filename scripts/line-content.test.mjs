import test from 'node:test';
import assert from 'node:assert/strict';
import { formatSummary, formatChanges, hasChanges } from './shared-tracker-data.mjs';

const playedHuang={
  id:829473,
  name:'黃仲翔 Chung-Hsiang Huang',
  team:'Visalia Rawhide',
  level:'Single-A',
  played:true,
  gameDate:'2026-08-12',
  gameStatus:'FINAL — Final',
  performance:'1-for-3, 3 PA, 0 HR, 0 RBI, 0 SB',
  season:'AVG .250, OBP .330, OPS .700, 2 HR, 12 RBI',
  liveSource:false,
  news:'2026-06-10 old transaction that must never appear',
  status:'old roster text'
};
const notPlayed={
  id:123,
  name:'No Game Player',
  team:'Some Team',
  level:'AA',
  played:false,
  gameDate:'',
  gameStatus:'NO GAME',
  performance:'Did not play',
  season:'AVG .300, OBP .400, OPS .800, 1 HR, 2 RBI',
  news:'2026-06-01 stale activity',
  status:'Rostered'
};

function snapshot(players){return {date:'2026-08-12',stalePlayers:0,players};}

test('LINE summary contains only players who played on Taiwan today',()=>{
  const message=formatSummary(snapshot([playedHuang,notPlayed]),'final',true);
  assert.match(message,/黃仲翔 Chung-Hsiang Huang/);
  assert.match(message,/今日出賽：1 位/);
  assert.match(message,/1-for-3/);
  assert.match(message,/AVG \.250/);
  assert.doesNotMatch(message,/No Game Player/);
  assert.doesNotMatch(message,/2026-06/);
  assert.doesNotMatch(message,/動態：/);
  assert.doesNotMatch(message,/觀察：/);
  assert.doesNotMatch(message,/球員狀態：/);
});

test('LINE changes ignore background changes for players who did not play today',()=>{
  const previous=snapshot([{...playedHuang,performance:'0-for-2, 2 PA, 0 HR, 0 RBI, 0 SB'},notPlayed]);
  const current=snapshot([playedHuang,{...notPlayed,status:'Changed roster status',news:'2026-08-12 transaction'}]);
  assert.equal(hasChanges(previous,current),true);
  const message=formatChanges(previous,current,true);
  assert.match(message,/黃仲翔 Chung-Hsiang Huang/);
  assert.match(message,/1-for-3/);
  assert.doesNotMatch(message,/No Game Player/);
  assert.doesNotMatch(message,/transaction/);
});

test('background-only changes for non-playing players do not trigger LINE changes',()=>{
  const previous=snapshot([playedHuang,notPlayed]);
  const current=snapshot([playedHuang,{...notPlayed,status:'Changed roster status',news:'2026-08-12 transaction'}]);
  assert.equal(hasChanges(previous,current),false);
  const message=formatChanges(previous,current,true);
  assert.match(message,/目前沒有新的今日出賽變化/);
  assert.doesNotMatch(message,/No Game Player/);
});
