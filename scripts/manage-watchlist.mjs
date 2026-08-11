const action=process.env.WATCHLIST_ACTION;
const playerId=Number(process.env.PLAYER_ID);
const apiUrl=String(process.env.OBSERVATION_API_URL||'').replace(/\/$/,'');
const adminToken=process.env.OBSERVATION_ADMIN_TOKEN;
if(!['add','remove'].includes(action)) throw new Error('WATCHLIST_ACTION must be add or remove');
if(!Number.isInteger(playerId)||playerId<=0) throw new Error('PLAYER_ID must be a positive MLB player ID');
if(!apiUrl) throw new Error('OBSERVATION_API_URL is required');
if(!adminToken) throw new Error('OBSERVATION_ADMIN_TOKEN is required');

const listResponse=await fetch(`${apiUrl}/players`,{headers:{Accept:'application/json'}});
if(!listResponse.ok) throw new Error(`Observation API read failed (${listResponse.status})`);
const currentPayload=await listResponse.json();
const players=Array.isArray(currentPayload)?currentPayload:currentPayload.players;
if(!Array.isArray(players)) throw new Error('Observation API returned an invalid player list');

if(action==='remove'){
  if(!players.some(p=>Number(p.id)===playerId)) throw new Error(`Player ${playerId} is not in the observation list`);
  const response=await fetch(`${apiUrl}/players/${playerId}`,{method:'DELETE',headers:{Authorization:`Bearer ${adminToken}`,Accept:'application/json'}});
  if(!response.ok) throw new Error(`Observation API remove failed (${response.status})`);
  console.log(`Removed player ${playerId} from Cloudflare KV`);
  process.exit(0);
}

if(players.some(p=>Number(p.id)===playerId)) throw new Error(`Player ${playerId} is already tracked`);
const response=await fetch(`https://statsapi.mlb.com/api/v1/people/${playerId}?hydrate=currentTeam`);
if(!response.ok) throw new Error(`MLB player lookup failed (${response.status})`);
const person=(await response.json()).people?.[0];
if(!person?.id||!person?.fullName) throw new Error(`MLB player ${playerId} was not found`);
const role=person.primaryPosition?.abbreviation||person.primaryPosition?.name||'—';
const group=person.primaryPosition?.type==='Pitcher'||person.primaryPosition?.name==='Pitcher'?'pitching':'hitting';
const player={id:Number(person.id),name:person.fullName,role,org:person.currentTeam?.name||'MLB / MiLB',group};
const addResponse=await fetch(`${apiUrl}/players`,{method:'POST',headers:{Authorization:`Bearer ${adminToken}`,'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify(player)});
if(!addResponse.ok) throw new Error(`Observation API add failed (${addResponse.status})`);
console.log(`Added ${player.name} (${player.id}) to Cloudflare KV`);
