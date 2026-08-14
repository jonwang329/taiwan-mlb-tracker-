import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../smart-insight.js', import.meta.url), 'utf8');
const css = await readFile(new URL('../smart-insight.css', import.meta.url), 'utf8');
const index = await readFile(new URL('../index.html', import.meta.url), 'utf8');

test('smart insight is compact and data-driven', () => {
  assert.doesNotThrow(() => new Function(source));
  assert.match(source, /AI INSIGHT/);
  assert.match(source, /Trend/);
  assert.match(source, /What it may mean/);
  assert.match(source, /Watch next/);
  assert.match(source, /box score/);
  assert.match(source, /不假設未觀測到的配球或教練策略/);
});

test('insight supports both hitters and pitchers from existing result data', () => {
  assert.match(source, /hitterRead/);
  assert.match(source, /pitcherRead/);
  assert.match(source, /plateAppearances/);
  assert.match(source, /inningsPitched/);
  assert.match(source, /strikeOuts/);
  assert.match(source, /baseOnBalls/);
});

test('every player gets direct official player links and a game-specific deep dive when gamePk exists', () => {
  assert.match(source, /www\.mlb\.com\/player\/\$\{slug\}-\$\{id\}/);
  assert.match(source, /baseballsavant\.mlb\.com\/savant-player\/\$\{slug\}-\$\{id\}/);
  assert.match(source, /result\?\.today\?\.game\?\.gamePk/);
  assert.match(source, /www\.mlb\.com\/gameday\/\$\{gamePk\}/);
  assert.match(source, /baseballsavant\.mlb\.com\/gamefeed\?gamePk=\$\{gamePk\}/);
  assert.match(source, /Today Game/);
  assert.match(source, /Latest Game/);
  assert.match(source, /OFFICIAL DEEP DIVE/);
});

test('main UI uses official links instead of embedded Strike Zone data loading', () => {
  assert.match(index, /smart-insight\.css\?v=20260814-insight-v2/);
  assert.match(index, /smart-insight\.js\?v=20260814-insight-v2/);
  assert.doesNotMatch(index, /pitch-analysis\.css/);
  assert.doesNotMatch(index, /pitch-trial\.css/);
  assert.doesNotMatch(index, /pitch-analysis\.js/);
  assert.doesNotMatch(index, /pitch-trial\.js/);
});

test('mobile presentation keeps official links compact', () => {
  assert.match(css, /@media\(max-width:640px\)/);
  assert.match(css, /\.ai-insight-row/);
  assert.match(css, /\.official-deep-dive/);
  assert.match(css, /grid-template-columns:1fr 1fr/);
});
