import {mkdir,readFile,writeFile} from 'node:fs/promises';
import TaiwanGameTime from '../taiwan-game-time.js';

const API='https://statsapi.mlb.com/api/v1';
const LEVELS=[[1,'MLB'],[11,'AAA'],[12,'AA'],[13,'高階 1A'],[14,'1A'],[16,'新人聯盟']];
const MAX_MLB_REQUESTS=8;
const OUTPUT_URL=new URL('../data/dashboard-snapshot.js',import.meta.url);
const FALLBACK_URL=new URL('../tracked-players.json',import.meta.url);
const {scheduleQueryWindow,gameTaiwanDate,isTaiwanTodayGame,taiwanDate}=TaiwanGameTime;
let activeMlbRequests=0;
const waitingMlbRequests=[];
const teamSportCache=new Map();

const num=v=>Number(v||0);
const gameId=g=>g.game?.gamePk||`${g.date}-${g.level}`;
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));

async function acquireMlbSlot(){
  if(activeMlbRequests<MAX_MLB_REQUESTS){activeMlbRequests+=1;return;}
  await new Promise(resolve=>waitingMlbRequests.push(resolve));
  activeMlbRequests+=1;
}
function releaseMlbSlot(){
  activeMlbRequests=Math.max(0,activeMlbRequests-1);
  waitingMlbRequests.shift()?.();
}
async function mlbFetch(url,options={}){
  let lastError;
  for(let attempt=0;attempt<2;attempt+=1){
    await acquireMlbSlot();
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),10000);
    try{
      const response=await fetch(url,{...options,signal:controller.signal});
      if(response.ok)return response;
      lastError=new Error(`MLB API ${response.status}`);
      if(response.status!==429&&response.status<500)throw lastError;
    }catch(error){lastError=error;}
    finally{clearTimeout(timer);releaseMlbSlot();}
    if(attempt===0)await pause(350);
  }
  throw lastError||new Error('MLB API request failed');
}
async function freshJson(url){
  const sep=url.includes('?')?'&':'?';
  const response=await mlbFetch(`${url}${sep}_=${Date.now()}`,{cache:'no-store',headers:{Accept:'application/json','Cache-Control':'no-cache'}});
  return response.json();
}
async function officialTeamSportId(teamId){
  if(!teamSportCache.has(teamId)){
    teamSportCache.set(teamId,freshJson(`${API}/teams/${teamId}`).then(data=>Number(data.teams?.[0]?.sport?.id||0)));
  }
  return teamSportCache.get(teamId);
}
async function loadTrackedPlayers(){
  const apiUrl=String(process.env.OBSERVATION_API_URL||'').replace(/\/$/,'');
  if(apiUrl){
    try{
      const response=await fetch(`${apiUrl}/players`,{cache:'no-store',headers:{Accept:'application/json'}});
      if(!response.ok)throw new Error(`Observation API ${response.status}`);
      const payload=await response.json();
      const list=Array.isArray(payload)?payload:payload.players;
      if(!Array.isArray(list)||!list.length)throw new Error('Observation API returned invalid player list');
      return list;
    }catch(error){console.warn(`[snapshot] ${error.message}; using repository fallback list`);}
  }
  const fallback=JSON.parse(await readFile(FALLBACK_URL,'utf8'));
  if(!Array.isArray(fallback)||!fallback.length)throw new Error('Repository fallback player list is invalid');
  return fallback;
}
function gamesSorted(games){
  const seen=new Set();
  return games.filter(game=>{
    const key=gameId(game);
    if(seen.has(key))return false;
    seen.add(key);
    return game.date;
  }).sort((a,b)=>new Date(b.date)-new Date(a.date));
}
function liveAppearance(player,stat={}){
  return player.group==='pitching'
    ? num(stat.battersFaced)>0||num(stat.pitchesThrown)>0||num(stat.inningsPitched)>0
    : num(stat.plateAppearances)>0||num(stat.atBats)>0||num(stat.runs)>0||num(stat.baseOnBalls)>0||num(stat.hitByPitch)>0||num(stat.sacFlies)>0||num(stat.sacBunts)>0;
}
function todayFromGameLogs(player,games,now=new Date()){
  const {start,end}=scheduleQueryWindow(now);
  const candidates=games.filter(game=>game?.date&&game.date>=start&&game.date<=end&&liveAppearance(player,game.stat||{}));
  if(!candidates.length)return null;
  const game=candidates[0];
  return {...game,date:taiwanDate(now),stat:game.stat||{},game:game.game||{},live:false,source:'gameLog'};
}
async function fetchPerson(player){
  try{return (await freshJson(`${API}/people/${player.id}?hydrate=currentTeam`)).people?.[0]||{};}
  catch(error){console.warn(`[snapshot] Profile unavailable for ${player.name}: ${error.message}`);return {};}
}
async function fetchLevel(player,[sportId,level]){
  const base=`${API}/people/${player.id}/stats?group=${player.group}&season=${new Date().getFullYear()}&sportId=${sportId}`;
  try{
    const [seasonJson,logJson]=await Promise.all([freshJson(`${base}&stats=season`),freshJson(`${base}&stats=gameLog`)]);
    return {sportId,level,season:seasonJson.stats?.[0]?.splits?.[0]?.stat||null,games:(logJson.stats?.[0]?.splits||[]).map(game=>({...game,level}))};
  }catch(error){
    console.warn(`[snapshot] Stats unavailable for ${player.name} ${level}: ${error.message}`);
    return {sportId,level,season:null,games:[],failed:true};
  }
}
async function fetchOfficialToday(player,teamIds,level){
  const ids=[...new Set(teamIds.filter(Boolean))].slice(0,6);
  if(!ids.length)return null;
  const now=new Date();
  const {start,end}=scheduleQueryWindow(now);
  let scheduleChecks=0;
  let relevantGames=0;
  let boxscoreChecks=0;
  let lastError;
  const seenGames=new Set();
  for(const teamId of ids){
    try{
      // MiLB schedule requests require the team's official sportId. Resolve it
      // from the team itself so promotions cannot create an invalid pairing.
      const sportId=await officialTeamSportId(teamId);
      if(!sportId)throw new Error(`Official sportId unavailable for team ${teamId}`);
      const schedule=await freshJson(`${API}/schedule?teamId=${teamId}&sportId=${sportId}&startDate=${start}&endDate=${end}`);
      scheduleChecks+=1;
      const games=(schedule.dates||[]).flatMap(date=>date.games||[]).filter(game=>isTaiwanTodayGame(game,now));
      const ordered=[...games].sort((a,b)=>{
        const rank=game=>game.status?.abstractGameState==='Live'?0:game.status?.abstractGameState==='Final'?1:2;
        return rank(a)-rank(b)||new Date(b.gameDate||0)-new Date(a.gameDate||0);
      });
      for(const game of ordered){
        if(!game.gamePk||seenGames.has(game.gamePk))continue;
        seenGames.add(game.gamePk);
        relevantGames+=1;
        try{
          const box=await freshJson(`${API}/game/${game.gamePk}/boxscore`);
          boxscoreChecks+=1;
          const key=`ID${player.id}`;
          const boxPlayer=box.teams?.home?.players?.[key]||box.teams?.away?.players?.[key];
          if(!boxPlayer)continue;
          const stat=player.group==='pitching'?(boxPlayer.stats?.pitching||{}):(boxPlayer.stats?.batting||boxPlayer.stats?.hitting||{});
          if(liveAppearance(player,stat))return {date:gameTaiwanDate(game),level,stat,game:{gamePk:game.gamePk},live:game.status?.abstractGameState==='Live'};
          const battingOrder=Number(boxPlayer.battingOrder||0);
          const isStarter=Boolean(boxPlayer.gameStatus?.isStarter||battingOrder);
          if(isStarter)return {date:gameTaiwanDate(game),level,stat:{},game:{gamePk:game.gamePk},live:false,scheduled:true,onGame:false,battingOrder,position:boxPlayer.position?.abbreviation||boxPlayer.position?.name||''};
        }catch(error){lastError=error;console.warn(`[snapshot] Official boxscore unavailable for ${player.name}: ${error.message}`);}
      }
    }catch(error){lastError=error;console.warn(`[snapshot] Official schedule unavailable for ${player.name}: ${error.message}`);}
  }
  if(scheduleChecks===0)throw lastError||new Error('MLB schedule API unavailable');
  if(relevantGames>0&&boxscoreChecks===0&&lastError)throw lastError;
  return null;
}
async function loadPlayer(player){
  const [levels,person]=await Promise.all([Promise.all(LEVELS.map(level=>fetchLevel(player,level))),fetchPerson(player)]);
  const games=gamesSorted(levels.flatMap(level=>level.games));
  const latest=games[0]||null;
  const active=levels.find(level=>level.level===latest?.level)||levels.find(level=>level.season)||{};
  const teamIds=[latest?.team?.id,...games.slice(0,8).map(game=>game.team?.id),person.currentTeam?.id];
  let officialToday=null;
  try{officialToday=await fetchOfficialToday(player,teamIds,active.level||latest?.level||'—');}
  catch(error){console.warn(`[snapshot] Today schedule lookup failed for ${player.name}: ${error.message}`);}
  const gameLogToday=todayFromGameLogs(player,games);
  const compactLevels=levels.map(({sportId,level,season})=>({sportId,level,season,games:[]}));
  return {levels:compactLevels,games:games.slice(0,5),latest,today:officialToday||gameLogToday,season:active.season||{}};
}
function meaningful(result){
  return Boolean(result?.today||result?.latest||result?.games?.length||result?.levels?.some(level=>level.season));
}
async function readPrevious(){
  try{
    const text=await readFile(OUTPUT_URL,'utf8');
    const match=text.match(/window\.CENTRAL_DASHBOARD_SNAPSHOT\s*=\s*(.*);\s*$/s);
    if(!match)return null;
    return JSON.parse(match[1]);
  }catch{return null;}
}
function signature(snapshot){
  return snapshot?JSON.stringify({players:snapshot.players,results:snapshot.results}):'';
}

const trackedPlayers=await loadTrackedPlayers();
const previous=await readPrevious();
const previousById=new Map((previous?.players||[]).map((player,index)=>[Number(player.id),previous.results?.[index]]));
const snapshotPlayers=[];
const results=[];
for(const player of trackedPlayers){
  let result=null;
  try{
    const fresh=await loadPlayer(player);
    if(meaningful(fresh))result=fresh;
  }catch(error){console.warn(`[snapshot] Player refresh failed for ${player.name}: ${error.message}`);}
  if(!result)result=previousById.get(Number(player.id))||null;
  if(!result){
    console.warn(`[snapshot] Skipping ${player.name}: no fresh or previous dashboard data is available`);
    continue;
  }
  snapshotPlayers.push(player);
  results.push(result);
}
if(!snapshotPlayers.length)throw new Error('No valid dashboard players are available; refusing to replace the last-good snapshot');
const next={savedAt:Date.now(),players:snapshotPlayers,results};
if(previous&&signature(previous)===signature(next)){
  console.log('[snapshot] No player data changes; keeping existing central snapshot.');
  process.exit(0);
}
await mkdir(new URL('../data/',import.meta.url),{recursive:true});
await writeFile(OUTPUT_URL,`window.CENTRAL_DASHBOARD_SNAPSHOT=${JSON.stringify(next)};\n`,'utf8');
const skipped=trackedPlayers.length-snapshotPlayers.length;
console.log(`[snapshot] Updated central snapshot for ${snapshotPlayers.length} valid players from official MLB / MiLB data${skipped?`; skipped ${skipped} invalid/unavailable player(s)`:''}.`);
