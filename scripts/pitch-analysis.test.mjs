import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../pitch-analysis.js', import.meta.url), 'utf8');
const css = await readFile(new URL('../pitch-analysis.css', import.meta.url), 'utf8');
const index = await readFile(new URL('../index.html', import.meta.url), 'utf8');

test('pitch analysis is limited to MLB and Triple-A hitters', () => {
  assert.match(source, /level==='MLB'\|\|level==='AAA'/);
  assert.match(source, /player\?\.group!==\'hitting\'/);
});

test('pitch analysis reads official live game feed and pitch/contact fields', () => {
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

test('view focuses on strike zone and contacted pitches without mistake-pitch claims', () => {
  assert.match(source, /STRIKE ZONE \+ CONTACT/);
  assert.match(source, /被打到的球/);
  assert.match(source, /只列有接觸的投球/);
  assert.match(source, /不判定「失投」/);
  assert.doesNotMatch(source, /失投候選/);
  assert.doesNotMatch(source, /中央甜蜜帶/);
});

test('pitch panel uses a persistent slot instead of remove-and-reinsert rendering', () => {
  assert.match(source, /document\.createElement\('section'\)/);
  assert.match(source, /slot\.className='pitch-analysis is-loading'/);
  assert.match(source, /slot\.innerHTML=/);
  assert.match(source, /htmlCache=new Map\(\)/);
  assert.doesNotMatch(source, /new MutationObserver/);
  assert.doesNotMatch(source, /\.pitch-analysis'\)\?\.remove/);
});

test('cached dashboard does not flash stale pitch data before official refresh settles', () => {
  assert.match(source, /cachedSnapshotOnly/);
  assert.match(source, /text\.includes\('最後有效資料'\)/);
  assert.match(source, /primaryRefreshBusy\(\)\|\|cachedSnapshotOnly\(\)/);
  assert.match(source, /scheduleWhenSettled\(180\)/);
});

test('slot is reserved synchronously below today detail and protects scroll anchoring', () => {
  assert.match(source, /querySelector\('\.today-detail'\)/);
  assert.match(source, /insertAdjacentElement\('afterend',slot\)/);
  assert.match(source, /document\.addEventListener\('tracker:players-loaded'/);
  assert.match(css, /\.player-detail\{overflow-anchor:none\}/);
  assert.match(css, /\.pitch-analysis\{[^}]*overflow-anchor:none/);
  assert.match(css, /\.pitch-analysis\.is-loading\{min-height:320px\}/);
  assert.match(css, /\.pitch-analysis\.is-loading\{min-height:430px\}/);
});

test('browser loads v3 pitch assets after the stable app core', () => {
  assert.match(index, /pitch-analysis\.css\?v=20260814-pitch-v3/);
  assert.match(index, /pitch-analysis\.js\?v=20260814-pitch-v3/);
  const appAt = index.indexOf('app.js?v=');
  const pitchAt = index.indexOf('pitch-analysis.js?v=');
  assert.ok(appAt >= 0 && pitchAt > appAt);
});
