const KEY = 'players';
const LINE_STATE_KEY = 'line-state:v1';
const OWNER_KEY_SHA256 = '3d917f84bd31e2c18597e0858262ba35af11a9fd12f050df4e514984f5a49941';
const TRUSTED_ORIGINS = new Set(['https://jonwang329.github.io']);
const MLB_API = 'https://statsapi.mlb.com/api/v1';
const TAIWAN_TZ = 'Asia/Taipei';
const NEW_YORK_TZ = 'America/New_York';
const DAY_MS = 24 * 60 * 60 * 1000;
const CRON_SLOTS = new Map([
  ['0 23 * * *', {slot:'07', mode:'morning'}],
  ['0 0 * * *', {slot:'08', mode:'changes'}],
  ['0 1 * * *', {slot:'09', mode:'changes'}],
  ['0 4 * * *', {slot:'12', mode:'final'}],
]);
const DEFAULT_PLAYERS = [
  {id:701678,name:'李灝宇 Hao-Yu Lee',role:'2B',org:'Detroit Tigers',group:'hitting'},
  {id:691907,name:'鄭宗哲 Tsung-Che Cheng',role:'SS',org:'Boston Red Sox',group:'hitting'},
  {id:678906,name:'鄧愷威 Kai-Wei Teng',role:'RHP',org:'Houston Astros',group:'pitching'},
  {id:827734,name:'林維恩 Wei-En Lin',role:'LHP',org:'Athletics',group:'pitching'},
  {id:801179,name:'林昱珉 Yu-Min Lin',role:'LHP',org:'Arizona Diamondbacks',group:'pitching'},
  {id:828667,name:'柯敬賢 Ching-Hsien Ko',role:'OF',org:'Los Angeles Dodgers',group:'hitting'},
  {id:813820,name:'林振瑋 Chen-Wei Lin',role:'RHP',org:'St. Louis Cardinals',group:'pitching'},
  {id:800018,name:'莊陳仲敖 Chen Zhong-Ao Zhuang',role:'RHP',org:'Athletics',group:'pitching'},
  {id:808486,name:'李晨薰 Chen-Hsun Lee',role:'RHP',org:'San Francisco Giants',group:'pitching'},
  {id:829473,name:'黃仲翔 Chung-Hsiang Huang',role:'RHP',org:'Arizona Diamondbacks',group:'pitching'}
];

function cors(request){
  const origin=request.headers.get('Origin')||'';
  return {
    'Access-Control-Allow-Origin': TRUSTED_ORIGINS.has(origin)?origin:'null',
    'Access-Control-Allow-Headers': 'authorization, content-type',
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    'Vary': 'Origin',
    'Cache-Control': 'no-store'
  };
}
const jsonResponse = (request,body,status=200) => new Response(JSON.stringify(body), {status, headers:{...cors(request),'Content-Type':'application/json; charset=utf-8'}});
const number = value => Number(value || 0);
const dateInZone=(date,timeZone)=>new Intl.DateTimeFormat('en-CA',{timeZone,year:'numeric',month:'2-digit',day:'2-digit'}).format(date);
const taiwanDate=(now=new Date())=>dateInZone(now,TAIWAN_TZ);
function scheduleQueryWindow(now=new Date()){
  const date=taiwanDate(now);
  const start=new Date(`${date}T00:00:00+08:00`);
  const end=new Date(start.getTime()+DAY_MS-1);
  return {start:dateInZone(start,NEW_YORK_TZ),end:dateInZone(end,NEW_YORK_TZ)};
}
function gameTaiwanDate(game){
  const parsed=new Date(game?.gameDate||'');
  return Number.isNaN(parsed.getTime())?'':dateInZone(parsed,TAIWAN_TZ);
}
function statusLabel(status={}){
  const detail=status.detailedState||'Status unavailable';
  const state=status.abstractGameState;
  if(state==='Final'||/final|game over|completed early/i.test(detail))return `FINAL — ${detail}`;
  if(state==='Live'||/in progress|warmup|delay|suspend|review|challenge/i.test(detail))return `LIVE / IN PROGRESS — ${detail}`;
  if(state==='Preview'||/scheduled|pre-game|not started/i.test(detail))return `NOT STARTED — ${detail}`;
  return `STATUS UNKNOWN — ${detail}`;
}
function schedulePriority(game={}){const state=game.status?.abstractGameState;return state==='Live'?0:state==='Final'?1:2;}
function hasAppearance(group,stat={},boxPlayer={}){
  if(group==='pitching')return number(stat.battersFaced)>0||number(stat.pitchesThrown)>0||number(stat.inningsPitched)>0;
  return number(stat.plateAppearances)>0||number(stat.atBats)>0||number(stat.runs)>0||number(stat.baseOnBalls)>0||number(stat.hitByPitch)>0||number(stat.sacFlies)>0||number(stat.sacBunts)>0||Boolean(boxPlayer.allPositions?.length&&boxPlayer.gameStatus?.isSubstitute);
}
function performance(group,stat={}){
  return group==='pitching'
    ? `${stat.inningsPitched??'0'} IP, ${stat.strikeOuts??0} K, ${stat.baseOnBalls??0} BB, ${stat.earnedRuns??0} ER${stat.battersFaced!=null?`, ${stat.battersFaced} BF`:''}`
    : `${stat.hits??0}-for-${stat.atBats??0}${stat.plateAppearances!=null?`, ${stat.plateAppearances} PA`:''}, ${stat.homeRuns??0} HR, ${stat.rbi??0} RBI, ${stat.stolenBases??0} SB`;
}
function seasonLine(group,stat={}){
  return group==='pitching'
    ? `ERA ${stat.era??'—'}, WHIP ${stat.whip??'—'}, ${stat.inningsPitched??0} IP, ${stat.strikeOuts??0} K`
    : `AVG ${stat.avg??'—'}, OBP ${stat.obp??'—'}, OPS ${stat.ops??'—'}, ${stat.homeRuns??0} HR, ${stat.rbi??0} RBI`;
}
async function readPlayers(env){
  let players=await env.OBSERVATION_LIST.get(KEY,'json');
  if(!Array.isArray(players)){players=DEFAULT_PLAYERS;await env.OBSERVATION_LIST.put(KEY,JSON.stringify(players));}
  return players;
}
async function sha256Hex(value){
  const bytes=new TextEncoder().encode(value);
  const digest=await crypto.subtle.digest('SHA-256',bytes);
  return [...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,'0')).join('');
}
async function authorized(request){
  const header=request.headers.get('authorization')||'';
  const token=header.startsWith('Bearer ')?header.slice(7):'';
  if(!token)return false;
  return (await sha256Hex(token))===OWNER_KEY_SHA256;
}
function deployTestAuthorized(request,env){
  const header=request.headers.get('authorization')||'';
  const token=header.startsWith('Bearer ')?header.slice(7):'';
  return Boolean(token&&env.DEPLOY_TEST_TOKEN&&token===env.DEPLOY_TEST_TOKEN);
}
async function mlbJson(url){
  const sep=url.includes('?')?'&':'?';
  const response=await fetch(`${url}${sep}_=${Date.now()}`,{headers:{Accept:'application/json','Cache-Control':'no-cache'},cache:'no-store'});
  if(!response.ok)throw new Error(`MLB API ${response.status}: ${url}`);
  return response.json();
}
async function mlbPlayer(id){
  const response=await fetch(`${MLB_API}/people/${id}?hydrate=currentTeam`);
  if(!response.ok)return null;
  const person=(await response.json()).people?.[0];
  if(!person?.id||!person?.fullName)return null;
  const role=person.primaryPosition?.abbreviation||person.primaryPosition?.name||'—';
  const group=person.primaryPosition?.type==='Pitcher'||person.primaryPosition?.name==='Pitcher'?'pitching':'hitting';
  return {id:Number(person.id),name:String(person.fullName),role:String(role),org:String(person.currentTeam?.name||'MLB / MiLB'),group};
}
async function loadPeople(players){
  const ids=players.map(p=>Number(p.id)).filter(Boolean);
  try{
    const data=await mlbJson(`${MLB_API}/people?personIds=${ids.join(',')}&hydrate=currentTeam`);
    const people=new Map((data.people||[]).map(person=>[Number(person.id),person]));
    if(people.size)return people;
  }catch(error){console.log(`[line] batch people lookup failed: ${error.message}`);}
  const people=new Map();
  for(const player of players){
    try{const data=await mlbJson(`${MLB_API}/people/${player.id}?hydrate=currentTeam`);const person=data.people?.[0];if(person)people.set(Number(player.id),person);}catch(error){console.log(`[line] person lookup failed for ${player.id}: ${error.message}`);}
  }
  return people;
}
async function todaySchedule(teamId,now){
  if(!teamId)return [];
  const {start,end}=scheduleQueryWindow(now);
  const data=await mlbJson(`${MLB_API}/schedule?teamId=${teamId}&startDate=${start}&endDate=${end}`);
  return (data.dates||[]).flatMap(item=>item.games||[]).filter(game=>gameTaiwanDate(game)===taiwanDate(now));
}
async function teamSportId(teamId){
  if(!teamId)return null;
  const data=await mlbJson(`${MLB_API}/teams/${teamId}`);
  return Number(data.teams?.[0]?.sport?.id||0)||null;
}
async function seasonStat(player,sportId,season){
  if(!sportId)return null;
  const data=await mlbJson(`${MLB_API}/people/${player.id}/stats?group=${player.group}&season=${season}&sportId=${sportId}&stats=season`);
  return data.stats?.[0]?.splits?.[0]?.stat||null;
}
async function playerTodaySnapshot(player,person,now){
  const teamId=person?.currentTeam?.id;
  const team=person?.currentTeam?.name||player.org;
  const status=person?.rosterStatus?.description||person?.rosterStatus||(team?`Rostered with ${team}`:'Roster status not provided by MLB');
  if(!teamId)return {id:player.id,name:player.name,group:player.group,team,status,played:false,gameDate:'',level:'—',gameStatus:'NO GAME — current team unavailable',performance:'Did not play',season:'—',liveSource:false};
  let games=[];
  try{games=await todaySchedule(teamId,now);}catch(error){return {id:player.id,name:player.name,group:player.group,team,status,played:false,gameDate:'',level:'—',gameStatus:`DATA ERROR — ${error.message}`,performance:'Did not play',season:'—',liveSource:false};}
  const ordered=[...games].sort((a,b)=>schedulePriority(a)-schedulePriority(b)||new Date(b.gameDate||0)-new Date(a.gameDate||0));
  for(const game of ordered){
    if(!game.gamePk||game.status?.abstractGameState==='Preview')continue;
    try{
      const box=await mlbJson(`${MLB_API}/game/${game.gamePk}/boxscore`);
      const key=`ID${player.id}`;
      const boxPlayer=box.teams?.home?.players?.[key]||box.teams?.away?.players?.[key];
      if(!boxPlayer)continue;
      const stat=player.group==='pitching'?(boxPlayer.stats?.pitching||{}):(boxPlayer.stats?.batting||boxPlayer.stats?.hitting||{});
      if(!hasAppearance(player.group,stat,boxPlayer))continue;
      const sportId=await teamSportId(teamId).catch(()=>null);
      const season=await seasonStat(player,sportId,Number(taiwanDate(now).slice(0,4))).catch(()=>null);
      return {id:player.id,name:player.name,group:player.group,team,status,played:true,gameDate:gameTaiwanDate(game),level:'MiLB / MLB',gameStatus:statusLabel(game.status),performance:performance(player.group,stat),season:seasonLine(player.group,season||{}),liveSource:game.status?.abstractGameState==='Live'};
    }catch(error){console.log(`[line] boxscore failed for ${player.id}: ${error.message}`);}
  }
  const game=ordered[0]||null;
  return {id:player.id,name:player.name,group:player.group,team,status,played:false,gameDate:'',level:'—',gameStatus:game?statusLabel(game.status):'NO GAME — no Taiwan-today game returned by MLB schedule',performance:'Did not play',season:'—',liveSource:false};
}
async function collectSnapshot(env,now=new Date()){
  const players=await readPlayers(env);
  const people=await loadPeople(players);
  const resolved=[];
  for(let i=0;i<players.length;i+=3){
    const batch=players.slice(i,i+3);
    resolved.push(...await Promise.all(batch.map(player=>playerTodaySnapshot(player,people.get(Number(player.id)),now))));
  }
  return {date:taiwanDate(now),generatedAt:new Date().toISOString(),players:resolved};
}
function comparablePlayer(player){return player?.played?{id:player.id,played:true,team:player.team,gameDate:player.gameDate,gameStatus:player.gameStatus,performance:player.performance,season:player.season,liveSource:player.liveSource}:{id:player?.id,played:false};}
function todayPlayers(snapshot){return (snapshot.players||[]).filter(player=>player.played&&player.gameDate===snapshot.date);}
function playerSection(player){return [`\n【${player.name}｜${player.team}】`,`比賽：${player.gameStatus}`,`本場：${player.performance}${player.liveSource?'（LIVE）':''}`,`球季：${player.season}`].join('\n');}
function formatSummary(snapshot,period='final',test=false){
  const title=period==='morning'?'早安速報':'午間日報';
  const prefix=test?'🧪 CLOUDFLARE TEST — Taiwan MLB Tracker':`🇹🇼⚾ Taiwan MLB Tracker｜${snapshot.date} ${title}`;
  const active=todayPlayers(snapshot);
  const header=`${prefix}\n台灣日期：${snapshot.date}（依 MLB gameDate 換算）\n今日出賽：${active.length} 位`;
  return active.length?[header,...active.map(playerSection)].join('\n'):`${header}\n\n目前沒有追蹤球員在台灣今天出賽。`;
}
function formatChanges(previous,current){
  const before=new Map((previous?.players||[]).map(player=>[Number(player.id),JSON.stringify(comparablePlayer(player))]));
  const changed=todayPlayers(current).filter(player=>before.get(Number(player.id))!==JSON.stringify(comparablePlayer(player)));
  const header=`🇹🇼⚾ Taiwan MLB Tracker｜${current.date} 今日出賽更新`;
  return changed.length?[header,...changed.map(playerSection)].join('\n'):`${header}\n目前沒有新的今日出賽變化。`;
}
async function sendLine(env,message){
  const token=env.LINE_CHANNEL_ACCESS_TOKEN;
  const destination=env.LINE_DESTINATION_ID||env.LINE_USER_ID;
  if(!token||!destination)throw new Error('LINE Worker secrets are not configured');
  if(!/^[UCR]/.test(destination))throw new Error('LINE destination must begin with U, C, or R');
  if(message.length>5000)throw new Error(`LINE message exceeds 5,000 characters (${message.length})`);
  const response=await fetch('https://api.line.me/v2/bot/message/push',{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({to:destination,messages:[{type:'text',text:message}]})});
  if(!response.ok){const body=await response.text().catch(()=> '');throw new Error(`LINE rejected notification (${response.status}) ${body.slice(0,200)}`);}
  return response.status;
}
async function runScheduledLine(env,cron,now=new Date(),test=false){
  const config=CRON_SLOTS.get(cron)||{slot:'manual',mode:'final'};
  const state=await env.OBSERVATION_LIST.get(LINE_STATE_KEY,'json')||{deliveries:{},snapshot:null};
  const deliveryKey=`${taiwanDate(now)}:${config.slot}`;
  if(!test&&state.deliveries?.[deliveryKey])return {ok:true,suppressed:true,slot:config.slot,deliveryKey};
  const current=await collectSnapshot(env,now);
  let message;
  if(test)message=formatSummary(current,'final',true);
  else if(config.mode==='morning')message=formatSummary(current,'morning',false);
  else if(config.mode==='final')message=formatSummary(current,'final',false);
  else message=formatChanges(state.snapshot,current);
  const lineStatus=await sendLine(env,message);
  if(!test){
    const deliveries={...(state.deliveries||{}),[deliveryKey]:new Date().toISOString()};
    const trimmed=Object.fromEntries(Object.entries(deliveries).filter(([key])=>key>=`${current.date.slice(0,7)}-01`));
    await env.OBSERVATION_LIST.put(LINE_STATE_KEY,JSON.stringify({deliveries:trimmed,snapshot:current,updatedAt:new Date().toISOString()}));
  }
  return {ok:true,suppressed:false,slot:config.slot,mode:config.mode,date:current.date,players:current.players.length,active:todayPlayers(current).length,lineStatus};
}

export default {
  async fetch(request,env){
    if(request.method==='OPTIONS')return new Response(null,{status:204,headers:cors(request)});
    const url=new URL(request.url);
    if(request.method==='GET'&&url.pathname==='/health')return jsonResponse(request,{ok:true,storage:'Cloudflare Workers KV',ownerAuth:true,lineScheduler:true,lineConfigured:Boolean(env.LINE_CHANNEL_ACCESS_TOKEN&&(env.LINE_DESTINATION_ID||env.LINE_USER_ID)),cronTimezone:'UTC'});
    if(request.method==='POST'&&url.pathname==='/internal/line-test'){
      if(!deployTestAuthorized(request,env))return jsonResponse(request,{error:'unauthorized'},401);
      try{return jsonResponse(request,await runScheduledLine(env,'manual',new Date(),true));}catch(error){return jsonResponse(request,{ok:false,error:error.message},500);}
    }
    if(request.method==='GET'&&(url.pathname==='/'||url.pathname==='/players')){
      const players=await readPlayers(env);
      return jsonResponse(request,{players,count:players.length,updatedAt:new Date().toISOString()});
    }
    if(request.method==='POST'&&url.pathname==='/owner/verify'){
      if(!(await authorized(request)))return jsonResponse(request,{error:'unauthorized'},401);
      return jsonResponse(request,{ok:true});
    }
    if(!(await authorized(request)))return jsonResponse(request,{error:'unauthorized'},401);
    if(request.method==='POST'&&url.pathname==='/players'){
      const body=await request.json().catch(()=>null);
      const id=Number(body?.id);
      if(!Number.isInteger(id)||id<=0)return jsonResponse(request,{error:'invalid player id'},400);
      const players=await readPlayers(env);
      const existing=players.find(p=>Number(p.id)===id);
      if(existing)return jsonResponse(request,{ok:true,alreadyTracked:true,player:existing,players});
      const player=await mlbPlayer(id);
      if(!player)return jsonResponse(request,{error:'MLB player not found'},404);
      const next=[...players,player];
      await env.OBSERVATION_LIST.put(KEY,JSON.stringify(next));
      return jsonResponse(request,{ok:true,player,players:next},201);
    }
    const match=url.pathname.match(/^\/players\/(\d+)$/);
    if(request.method==='DELETE'&&match){
      const id=Number(match[1]);
      const players=await readPlayers(env);
      const next=players.filter(p=>Number(p.id)!==id);
      if(next.length===players.length)return jsonResponse(request,{ok:true,alreadyRemoved:true,players});
      await env.OBSERVATION_LIST.put(KEY,JSON.stringify(next));
      return jsonResponse(request,{ok:true,players:next});
    }
    return jsonResponse(request,{error:'not found'},404);
  },
  async scheduled(controller,env,ctx){
    const cron=controller.cron;
    if(!CRON_SLOTS.has(cron)){console.log(`[line] ignoring unknown cron ${cron}`);return;}
    ctx.waitUntil(runScheduledLine(env,cron,new Date(controller.scheduledTime)).then(result=>console.log(`[line] scheduled result ${JSON.stringify(result)}`)).catch(error=>{console.error(`[line] scheduled failure: ${error.stack||error.message}`);throw error;}));
  }
};
