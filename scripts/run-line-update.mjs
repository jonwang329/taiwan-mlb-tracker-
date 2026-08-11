import { writeFile } from 'node:fs/promises';

const api=String(process.env.WATCHLIST_API_URL||'').replace(/\/$/,'');
if(api){
  console.log('[watchlist] Loading current observation list from server-side storage...');
  const response=await fetch(`${api}/watchlist`,{headers:{Accept:'application/json'},cache:'no-store'});
  if(!response.ok) throw new Error(`Observation list API failed (${response.status})`);
  const data=await response.json();
  const players=Array.isArray(data)?data:data.players;
  if(!Array.isArray(players)) throw new Error('Observation list API returned invalid data');
  await writeFile(new URL('../tracked-players.json',import.meta.url),`${JSON.stringify(players,null,2)}\n`);
  console.log(`[watchlist] Loaded ${players.length} tracked players.`);
}else{
  console.warn('[watchlist] WATCHLIST_API_URL is not configured; using repository bootstrap list.');
}

await import('./send-line-update.mjs');
