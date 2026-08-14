import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../pitch-analysis.js', import.meta.url), 'utf8');
const adapter = await readFile(new URL('../pitch-data-adapter.js', import.meta.url), 'utf8');
const css = await readFile(new URL('../pitch-analysis.css', import.meta.url), 'utf8');
const index = await readFile(new URL('../index.html', import.meta.url), 'utf8');

test('pitch analysis is limited to MLB and Triple-A hitters', () => {
  assert.match(source, /level==='MLB'\|\|level==='AAA'/);
  assert.match(source, /player\?\.group!==\'hitting\'/);
});

test('pitch view still reads pitch/contact fields', () => {
  assert.match(source, /startSpeed/);
  assert.match(source, /coordinates/);
  assert.match(source, /pX/);
  assert.match(source, /pZ/);
  assert.match(source, /launchSpeed/);
  assert.match(source, /launchAngle/);
  assert.match(source, /totalDistance/);
});

test('adapter routes the browser pitch request through the dedicated Cloudflare proxy', () => {
  assert.doesNotThrow(() => new Function(adapter));
  assert.match(adapter, /api\\\/v1\\\.1\\\/game/);
  assert.match(adapter, /taiwan-mlb-pitch-proxy\.jonwang329\.workers\.dev/);
  assert.match(adapter, /\/mlb\/playbyplay\/\$\{gamePk\}/);
  assert.match(adapter, /allPlays: Array\.isArray\(data\?\.allPlays\)/);
  assert.match(adapter, /window\.PITCH_DATA_SOURCE = 'MLB Stats API via Cloudflare pitch proxy'/);
  assert.doesNotMatch(adapter, /statsapi\.mlb\.com\/api\/v1\/game\/\$\{gamePk\}\/playByPlay/);
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

test('browser loads the v5 Cloudflare adapter before pitch analysis after the stable app core', () => {
  assert.match(index, /pitch-analysis\.css\?v=20260814-pitch-v4/);
  assert.match(index, /pitch-data-adapter\.js\?v=20260814-pitch-v5/);
  assert.match(index, /pitch-analysis\.js\?v=20260814-pitch-v5/);
  const appAt = index.indexOf('app.js?v=');
  const adapterAt = index.indexOf('pitch-data-adapter.js?v=');
  const pitchAt = index.indexOf('pitch-analysis.js?v=');
  assert.ok(appAt >= 0 && adapterAt > appAt && pitchAt > adapterAt);
});

test('MLB playByPlay endpoint returns pitch events for a known tracked-player game', async () => {
  const response = await fetch('https://statsapi.mlb.com/api/v1/game/824238/playByPlay', { headers: { Accept: 'application/json' } });
  assert.equal(response.ok, true, `MLB playByPlay returned ${response.status}`);
  const data = await response.json();
  assert.ok(Array.isArray(data.allPlays) && data.allPlays.length > 0, 'playByPlay allPlays is empty');
  const haoYu = data.allPlays.filter(play => Number(play?.matchup?.batter?.id) === 701678);
  assert.ok(haoYu.length > 0, 'Hao-Yu Lee plate appearances missing from known game');
  assert.ok(haoYu.some(play => (play.playEvents || []).some(event => event.isPitch && event.pitchData)), 'pitchData missing for tracked hitter');
});
