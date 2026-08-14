import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../pitch-analysis.js', import.meta.url), 'utf8');
const index = await readFile(new URL('../index.html', import.meta.url), 'utf8');

test('pitch analysis calls the Cloudflare proxy directly', () => {
  assert.match(source, /taiwan-mlb-pitch-proxy\.jonwang329\.workers\.dev/);
  assert.match(source, /\/mlb\/playbyplay\/\$\{gamePk\}/);
  assert.doesNotMatch(source, /api\/v1\.1\/game/);
  assert.doesNotMatch(index, /pitch-data-adapter\.js/);
});

test('pitch parser accepts raw proxy allPlays and normalized legacy shape', () => {
  assert.match(source, /feed\?\.allPlays/);
  assert.match(source, /feed\?\.liveData\?\.plays\?\.allPlays/);
});
