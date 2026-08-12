import test from 'node:test';
import assert from 'node:assert/strict';
import TaiwanGameTime from '../taiwan-game-time.js';

const {taiwanDate,gameTaiwanDate,isTaiwanTodayGame,scheduleQueryWindow}=TaiwanGameTime;
const now=new Date('2026-08-12T04:36:00Z'); // 2026-08-12 12:36 Asia/Taipei

test('MLB US Aug 11 evening game is Taiwan Aug 12 today',()=>{
  const game={gameDate:'2026-08-11T23:10:00Z'}; // Aug 11 evening in US Eastern, Aug 12 07:10 Taiwan
  assert.equal(taiwanDate(now),'2026-08-12');
  assert.equal(gameTaiwanDate(game),'2026-08-12');
  assert.equal(isTaiwanTodayGame(game,now),true);
});

test('MLB US Aug 12 game that starts Taiwan Aug 13 is not Taiwan Aug 12 today',()=>{
  const game={gameDate:'2026-08-12T23:10:00Z'}; // Aug 13 07:10 Taiwan
  assert.equal(gameTaiwanDate(game),'2026-08-13');
  assert.equal(isTaiwanTodayGame(game,now),false);
});

test('US schedule query window covers both official US dates that can map to one Taiwan day',()=>{
  assert.deepEqual(scheduleQueryWindow(now),{start:'2026-08-11',end:'2026-08-12'});
});
