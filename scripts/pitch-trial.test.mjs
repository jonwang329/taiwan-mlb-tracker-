import fs from 'node:fs';
const html=fs.readFileSync('index.html','utf8');
const css=fs.readFileSync('pitch-trial.css','utf8');
const js=fs.readFileSync('pitch-trial.js','utf8');
for(const asset of ['pitch-analysis.css','pitch-trial.css','pitch-analysis.js','pitch-trial.js']){if(!html.includes(asset))throw new Error(`missing ${asset}`)}
if(!css.includes(':not(.pitch-open)>:not(.pitch-trial-toggle)'))throw new Error('trial is not collapsed by default');
if(!css.includes('min-height:0!important'))throw new Error('loading state may expand dashboard');
if(!js.includes("aria-expanded"))throw new Error('toggle accessibility missing');
if(!js.includes("MutationObserver"))throw new Error('toggle would not survive pitch rerenders');
console.log('pitch trial guardrails ok');
