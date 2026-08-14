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

test('main UI loads insight and no longer loads Strike Zone', () => {
  assert.match(index, /smart-insight\.css\?v=20260814-insight-v1/);
  assert.match(index, /smart-insight\.js\?v=20260814-insight-v1/);
  assert.doesNotMatch(index, /pitch-analysis\.css/);
  assert.doesNotMatch(index, /pitch-analysis\.js/);
});

test('mobile presentation stays compact', () => {
  assert.match(css, /@media\(max-width:640px\)/);
  assert.match(css, /\.ai-insight-row/);
});
