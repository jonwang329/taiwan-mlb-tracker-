import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../pitch-analysis.js', import.meta.url), 'utf8');
const index = await readFile(new URL('../index.html', import.meta.url), 'utf8');

test('pitch analysis is limited to MLB and Triple-A hitters', () => {
  assert.match(source, /level === 'MLB' \|\| level === 'AAA'/);
  assert.match(source, /player\.group !== 'hitting'/);
});

test('pitch analysis reads official live game feed and Statcast-like fields', () => {
  assert.match(source, /statsapi\.mlb\.com\/api\/v1\.1/);
  assert.match(source, /\/game\/\$\{gamePk\}\/feed\/live/);
  assert.match(source, /startSpeed/);
  assert.match(source, /coordinates/);
  assert.match(source, /pX/);
  assert.match(source, /pZ/);
  assert.match(source, /launchSpeed/);
  assert.match(source, /launchAngle/);
  assert.match(source, /totalDistance/);
});

test('mistake pitch label remains explicitly heuristic', () => {
  assert.match(source, /失投候選/);
  assert.match(source, /不是官方判定/);
  assert.match(source, /中央甜蜜帶/);
});

test('browser loads pitch analysis assets after the stable app core', () => {
  assert.match(index, /pitch-analysis\.css\?v=/);
  const appAt = index.indexOf('app.js?v=');
  const pitchAt = index.indexOf('pitch-analysis.js?v=');
  assert.ok(appAt >= 0 && pitchAt > appAt);
});
