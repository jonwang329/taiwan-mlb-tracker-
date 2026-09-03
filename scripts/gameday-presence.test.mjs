import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../gameday-presence-hotfix.js', import.meta.url), 'utf8');
const index = await readFile(new URL('../index.html', import.meta.url), 'utf8');

test('Gameday presence detects current and completed matchup player IDs', () => {
  assert.match(source, /liveData\?\.plays\?\.currentPlay/);
  assert.match(source, /liveData\?\.plays\?\.allPlays/);
  assert.match(source, /matchup\.pitcher\?\.id/);
  assert.match(source, /matchup\.batter\?\.id/);
});

test('today gamePk can be read even when schedule state is not yet Live', () => {
  assert.match(source, /startAt <= now\.getTime\(\) \+ 2 \* 60 \* 1000/);
  assert.doesNotMatch(source, /if \(\(state === 'Live' \|\| state === 'Final'\) && game\.gamePk\)/);
});

test('website loads the shared formatter before app and the one Gameday updater', () => {
  const formatterAt=index.indexOf('today-stat-line.js');
  const appAt=index.indexOf('app.js?v=');
  const gamedayAt=index.indexOf('gameday-universe-hotfix.js');
  assert.ok(formatterAt>=0&&formatterAt<appAt&&appAt<gamedayAt);
  assert.doesNotMatch(index,/live-refresh\.js|gameday-presence-hotfix\.js/);
});
