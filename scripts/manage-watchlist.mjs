import { readFile, writeFile } from 'node:fs/promises';

const action=process.env.WATCHLIST_ACTION;
const playerId=Number(process.env.PLAYER_ID);
const path=new URL('../tracked-players.json',import.meta.url);
if(!['add','remove'].includes(action)) throw new Error('WATCHLIST_ACTION must be add or remove');
if(!Number.isInteger(playerId)||playerId<=0) throw new Error('PLAYER_ID must be a positive MLB player ID');
const players=JSON.parse(await readFile(path,'utf8'));

if(action==='remove'){
  const next=players.filter(p=>Number(p.id)!==playerId);
  if(next.length===players.length) throw new Error(`Player ${playerId} is not in the observation list`);
  await writeFile(path,`${JSON.stringify(next,null,2)}\n`);
  console.log(`Removed player ${playerId}`);
  process.exit(0);
}

if(players.some(p=>Number(p.id)===playerId)) throw new Error(`Player ${playerId} is already tracked`);
const response=await fetch(`https://statsapi.mlb.com/api/v1/people/${playerId}?hydrate=currentTeam`);
if(!response.ok) throw new Error(`MLB player lookup failed (${response.status})`);
const person=(await response.json()).people?.[0];
if(!person?.id||!person?.fullName) throw new Error(`MLB player ${playerId} was not found`);
const role=person.primaryPosition?.abbreviation||person.primaryPosition?.name||'—';
const group=person.primaryPosition?.type==='Pitcher'||person.primaryPosition?.name==='Pitcher'?'pitching':'hitting';
const player={id:person.id,name:person.fullName,role,org:person.currentTeam?.name||'MLB / MiLB',group};
players.push(player);
await writeFile(path,`${JSON.stringify(players,null,2)}\n`);
console.log(`Added ${player.name} (${player.id})`);
