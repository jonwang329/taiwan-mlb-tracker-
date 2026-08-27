import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const index=await readFile(new URL('../index.html',import.meta.url),'utf8');
const bootstrap=await readFile(new URL('../snapshot-bootstrap.js',import.meta.url),'utf8');

test('V2 page has one refresh owner and no legacy game-state hotfix stack',()=>{
  assert.match(index,/app\.js\?v=20260828-refresh-v2/);
  for(const legacy of ['official-today-hotfix.js','gameday-presence-hotfix.js','single-source-status-hotfix.js','today-gamepk-date-guard.js','team-schedule-visual.js','refresh-terminal-state-fix.js']){
    assert.doesNotMatch(index,new RegExp(legacy.replaceAll('.','\\.')));
  }
});

test('snapshot bootstrap preserves a newer local last-good result',()=>{
  assert.match(bootstrap,/localSaved<centralSaved/);
  assert.doesNotMatch(bootstrap,/localStorage\.setItem\(CACHE_KEY,JSON\.stringify\(central\)\);\s*\n\s*catch/);
});
