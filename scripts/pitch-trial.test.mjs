import fs from 'node:fs';
const html=fs.readFileSync('index.html','utf8');
for(const asset of ['pitch-analysis.css','pitch-trial.css','pitch-analysis.js','pitch-trial.js']){
  if(html.includes(asset))throw new Error(`embedded pitch asset should be disabled: ${asset}`);
}
if(!html.includes('smart-insight.js?v=20260817-live-v2'))throw new Error('official deep-dive insight asset missing');
console.log('embedded pitch trial disabled; official links own the deep dive');
