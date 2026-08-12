let players = [];
let lastPlayers = [];
let lastResults = [];
let lastSignature = '';
let lastSuccessAt = 0;
let lastCheckAt = 0;
const API='https://statsapi.mlb.com/api/v1';
const LEVELS=[[1,'MLB'],[11,'AAA'],[12,'AA'],[13,'高階 1A'],[14,'1A'],[16,'新人聯盟']];
const CACHE_KEY='taiwan-mlb-tracker:last-good:v2';
const AUTO_RECHECK_MS=5*60*1000;
const photo=id=>`https://img.mlbstatic.com/mlb-photos/image/upload/w_640,q_auto:best,f_auto/v1/people/${id}/headshot/67/current`;
const val=(v,f='—')=>v??f, num=v=>Number(v||0), day=v=>String(v||'').slice(0,10);
const dateInZone=(date,timeZone)=>new Intl.DateTimeFormat('en-CA',{timeZone,year:'numeric',month:'2-digit',day:'2-digit'}).format(date);
const twToday=()=>dateInZone(new Date(),'Asia/Taipei');
const scheduleWindow=()=>({start:dateInZone(new Date(Date.now()-24*60*60*1000),'America/New_York'),end:dateInZone(new Date(),'America/New_York')});
const gameTaiwanDate=g=>g?.gameDate?dateInZone(new Date(g.gameDate),'Asia/Taipei'):'';
const relevantTodayGame=g=>g?.status?.abstractGameState==='Live'||gameTaiwanDate(g)===twToday();
const formatTime=ts=>ts?new Intl.DateTimeFormat('zh-TW',{timeZone:'Asia/Taipei',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(ts)):'—';
const names=p=>{const a=p.name.split(' ');return {zh:a.shift(),en:a.join(' ')}};
const gameId=g=>g.game?.gamePk||`${g.date}-${g.level}`;
async function stableJson(url){const r=await fetch(url,{headers:{Accept:'application/json'}});if(!r.ok)throw new Error(`MLB API ${r.status}`);return r.json();}
async function freshJson(url){const sep=url.includes('?')?'&':'?';const r=await fetch(`${url}${sep}_=${Date.now()}`,{cache:'no-store',headers:{Accept:'application/json','Cache-Control':'no-cache'}});if(!r.ok)throw new Error(`MLB API ${r.status}`);return r.json();}
async function fallbackTrackedPlayers(){const r=await fetch(`tracked-players.json?v=${Date.now()}`,{cache:'no-store'});if(!r.ok)throw new Error('無法讀取觀察名單');const list=await r.json();if(!Array.isArray(list)||!list.length)throw new Error('觀察名單格式錯誤');return list;}
function setTrackedPlayers(list){players=list;window.trackedPlayers=players;return players;}
async function loadTrackedPlayers(){
  const apiUrl=String(window.OBSERVATION_API_URL||'').replace(/\/$/,'');
  let list;
  if(apiUrl){
    try{
      const r=await fetch(`${apiUrl}/players`,{cache:'no-store',headers:{Accept:'application/json'}});
      if(!r.ok)throw new Error(`Cloudflare ${r.status}`);
      const payload=await r.json();
      list=Array.isArray(payload)?payload:payload.players;
      if(!Array.isArray(list)||!list.length)throw new Error('Cloudflare 觀察名單格式錯誤');
    }catch(error){
      console.warn('Observation API unavailable; using repository fallback',error);
      list=await fallbackTrackedPlayers();
    }
  }else list=await fallbackTrackedPlayers();
  return setTrackedPlayers(list);
}
function gamesSorted(games){const seen=new Set;return games.filter(g=>{const k=gameId(g);if(seen.has(k))return false;seen.add(k);return g.date}).sort((a,b)=>new Date(b.date)-new Date(a.date));}
function initials(p){return names(p).en.split(' ').map(x=>x[0]).slice(0,2).join('').toUpperCase();}
function image(p,large=false){return `<div class="photo ${large?'photo-large':''}"><img src="${photo(p.id)}" alt="${p.name} 球員照片" loading="lazy" decoding="async" referrerpolicy="no-referrer"><span aria-hidden="true"><b>${initials(p)}</b><small>TAIWAN BASEBALL</small></span></div>`;}
function wireImages(){document.querySelectorAll('.photo img:not([data-wired])').forEach(img=>{img.dataset.wired='1';const fail=()=>img.parentElement.classList.add('fallback');img.addEventListener('error',fail,{once:true});if(img.complete&&!img.naturalWidth)fail();});}
function currentLevel(r){return r.latest?.level||r.levels?.find(x=>x.season)?.level||'—';}
function line(p,g){const s=g?.stat||{};return p.group==='pitching'?`${val(s.inningsPitched,'0')} IP · ${val(s.hits,0)} H · ${val(s.earnedRuns,0)} ER · ${val(s.baseOnBalls,0)} BB · ${val(s.strikeOuts,0)} K${s.battersFaced!=null?` · ${s.battersFaced} BF`:''}`:`${val(s.hits,0)}-${val(s.atBats,0)}${s.plateAppearances!=null?` · ${s.plateAppearances} PA`:''} · ${num(s.homeRuns)?`${s.homeRuns} HR · `:''}${num(s.rbi)?`${s.rbi} RBI`:''}`.replace(/ · $/,'');}
function season(p,s={}){return p.group==='pitching'?`ERA ${val(s.era)} / ${val(s.inningsPitched,'0')} IP / ${val(s.strikeOuts,0)} K / ${val(s.whip)} WHIP`:`${val(s.avg)} AVG / ${val(s.homeRuns,0)} HR / ${val(s.rbi,0)} RBI / ${val(s.ops)} OPS`;}
function ratio(a,b,digits=2){return a!=null&&b!=null&&num(b)>0?(num(a)/num(b)).toFixed(digits):'—';}
function rate(n,pa){return n!=null&&pa!=null&&num(pa)>0?`${(num(n)/num(pa)*100).toFixed(1)}%`:'—';}
function hitterMetrics(s={}){const doubles=s.doubles,triples=s.triples,hr=s.homeRuns,hasXbh=[doubles,triples,hr].every(x=>x!=null);let iso='—';if(s.slg!=null&&s.avg!=null&&!Number.isNaN(Number(s.slg))&&!Number.isNaN(Number(s.avg)))iso=(Number(s.slg)-Number(s.avg)).toFixed(3).replace(/^0/,'');return [['AVG',s.avg],['OBP',s.obp],['SLG',s.slg],['OPS',s.ops],['HR',hr],['RBI',s.rbi],['H',s.hits],['2B',doubles],['3B',triples],['XBH',hasXbh?num(doubles)+num(triples)+num(hr):null],['BB',s.baseOnBalls],['SO',s.strikeOuts],['BB/K',ratio(s.baseOnBalls,s.strikeOuts)],['BB%',rate(s.baseOnBalls,s.plateAppearances)],['K%',rate(s.strikeOuts,s.plateAppearances)],['ISO',iso]];}
function pitcherMetrics(s={}){return [['ERA',s.era],['WHIP',s.whip],['W-L',s.wins!=null&&s.losses!=null?`${s.wins}-${s.losses}`:null],['IP',s.inningsPitched],['H',s.hits],['ER',s.earnedRuns],['HR',s.homeRuns],['BB',s.baseOnBalls],['SO',s.strikeOuts],['K/9',s.strikeoutsPer9Inn],['BB/9',s.walksPer9Inn],['K/BB',s.strikeoutWalkRatio],['H/9',s.hitsPer9Inn],['HR/9',s.homeRunsPer9]];}
function metricGrid(p,s){const metrics=p.group==='pitching'?pitcherMetrics(s):hitterMetrics(s);return `<div class="metric-grid">${metrics.map(([label,value])=>`<div><span>${label}</span><strong>${val(value)}</strong></div>`).join('')}</div>`;}
function opponent(g){const o=g.opponent?.name||g.opponent?.abbreviation||'—';return o.replace(/^(Detroit|Boston|Houston|Arizona|Los Angeles|St. Louis|San Francisco) /,'');}
function result(g){if(g.isWin===true)return '勝';if(g.isWin===false)return '敗';return g.game?.gamePk?'終場':'—';}
function gameRows(p,games){if(!games.length)return '<p class="empty">目前沒有近 5 場比賽資料</p>';const heads=p.group==='pitching'?['日期 / 對手','結果','IP','H','ER','BB','SO']:['日期 / 對手','結果','AB','H','HR','RBI','BB','SO'];return `<div class="game-table"><div class="game-row game-head">${heads.map(x=>`<span>${x}</span>`).join('')}</div>${games.slice(0,5).map(g=>{const s=g.stat||{},d=new Date(`${day(g.date)}T12:00:00Z`),date=`${d.getUTCMonth()+1}/${d.getUTCDate()}`,cells=p.group==='pitching'?[`${date} <b>${opponent(g)}</b>`,result(g),val(s.inningsPitched,0),val(s.hits,0),val(s.earnedRuns,0),val(s.baseOnBalls,0),val(s.strikeOuts,0)]:[`${date} <b>${opponent(g)}</b>`,result(g),val(s.atBats,0),val(s.hits,0),val(s.homeRuns,0),val(s.rbi,0),val(s.baseOnBalls,0),val(s.strikeOuts,0)];return `<div class="game-row">${cells.map(x=>`<span>${x}</span>`).join('')}</div>`}).join('')}</div>`;}
function summaryRow(p,r){const n=names(p),s=r.season||{},today=r.today?`${line(p,r.today)}${r.today.live?' · LIVE':''}`:(p.group==='pitching'?'今日無登板':'今日未出賽'),primary=p.group==='pitching'?s.era:s.avg,secondary=p.group==='pitching'?s.whip:s.ops;return `<a class="summary-row" href="#player-${p.id}" aria-label="查看 ${p.name} 詳細資料"><span class="summary-player"><strong>${n.zh}</strong><small>${n.en}</small></span><span class="summary-club"><b>${currentLevel(r)}</b><small>${p.org}</small></span><span class="summary-today">${today}</span><span class="summary-stat"><small>${p.group==='pitching'?'ERA':'AVG'}</small><b>${val(primary)}</b></span><span class="summary-stat"><small>${p.group==='pitching'?'WHIP':'OPS'}</small><b>${val(secondary)}</b></span><i aria-hidden="true">›</i></a>`;}
function summaryGroup(group,results){const hitters=group==='hitting',items=players.map((p,i)=>({p,r:results[i]})).filter(x=>x.p.group===group);return `<section class="summary-group ${group}" aria-labelledby="${group}-title"><header><h3 id="${group}-title">${hitters?'野手':'投手'} <span>${hitters?'HITTERS':'PITCHERS'}</span></h3><div class="column-labels"><span>球員</span><span>球隊 / 層級</span><span>${hitters?'今日戰況':'今日 / 登板'}</span><span>${hitters?'AVG':'ERA'}</span><span>${hitters?'OPS':'WHIP'}</span></div></header>${items.map(({p,r})=>summaryRow(p,r)).join('')}</section>`;}
function detail(p,r){const n=names(p),today=Boolean(r.today);return `<article class="player-detail" id="player-${p.id}"><header>${image(p,true)}<div><span class="level">${currentLevel(r)}</span><h3>${n.zh}</h3><b>${n.en}</b><p>${p.org} · ${p.role}</p></div></header><div class="today-detail"><span>今日賽事</span><strong>${today?(r.today.live?'LIVE · 已出賽':'已出賽'):'今日未出賽'}</strong><p>${today?line(p,r.today):(p.group==='pitching'?'尚無下次登板資訊':'等待下一場比賽')}</p></div><section class="last-five"><div class="subhead"><h4>${p.group==='pitching'?'近 5 次登板':'近 5 場比賽'}</h4><span>LAST 5</span></div>${gameRows(p,r.games||[])}</section><section class="season-stats"><div class="subhead"><h4>本季成績</h4><span>SEASON</span></div>${metricGrid(p,r.season)}</section></article>`;}
function liveAppearance(p,stat={}){return p.group==='pitching'?num(stat.battersFaced)>0||num(stat.pitchesThrown)>0||num(stat.inningsPitched)>0:num(stat.plateAppearances)>0||num(stat.atBats)>0||num(stat.runs)>0||num(stat.baseOnBalls)>0||num(stat.hitByPitch)>0||num(stat.sacFlies)>0||num(stat.sacBunts)>0;}
async function fetchPerson(p){try{return (await freshJson(`${API}/people/${p.id}?hydrate=currentTeam`)).people?.[0]||{}}catch(error){console.warn('Player profile unavailable',p.name,error);return {}}}
async function fetchOfficialToday(p,teamIds,level){
  const ids=[...new Set((Array.isArray(teamIds)?teamIds:[teamIds]).filter(Boolean))].slice(0,4);
  if(!ids.length)return null;
  const {start,end}=scheduleWindow();
  let scheduleChecks=0;
  let relevantGames=0;
  let boxscoreChecks=0;
  let lastError;
  const seenGames=new Set();
  for(const teamId of ids){
    try{
      const schedule=await freshJson(`${API}/schedule?teamId=${teamId}&startDate=${start}&endDate=${end}`);
      scheduleChecks+=1;
      const games=(schedule.dates||[]).flatMap(d=>d.games||[]).filter(g=>relevantTodayGame(g));
      const ordered=[...games].sort((a,b)=>{const rank=g=>g.status?.abstractGameState==='Live'?0:g.status?.abstractGameState==='Final'?1:2;return rank(a)-rank(b)||new Date(b.gameDate||0)-new Date(a.gameDate||0)});
      for(const g of ordered){
        if(!g.gamePk||g.status?.abstractGameState==='Preview'||seenGames.has(g.gamePk))continue;
        seenGames.add(g.gamePk);
        relevantGames+=1;
        try{
          const box=await freshJson(`${API}/game/${g.gamePk}/boxscore`);
          boxscoreChecks+=1;
          const key=`ID${p.id}`,bp=box.teams?.home?.players?.[key]||box.teams?.away?.players?.[key];
          if(!bp)continue;
          const stat=p.group==='pitching'?(bp.stats?.pitching||{}):(bp.stats?.batting||bp.stats?.hitting||{});
          if(liveAppearance(p,stat))return {date:gameTaiwanDate(g)||twToday(),level,stat,game:{gamePk:g.gamePk},live:g.status?.abstractGameState==='Live'};
        }catch(error){lastError=error;console.warn('Official boxscore unavailable',p.name,g.gamePk,error)}
      }
    }catch(error){lastError=error;console.warn('Official schedule unavailable',p.name,teamId,error)}
  }
  if(scheduleChecks===0)throw lastError||new Error('MLB schedule API unavailable');
  if(relevantGames>0&&boxscoreChecks===0&&lastError)throw lastError;
  return null;
}
async function fetchLevel(p,[sportId,level]){const base=`${API}/people/${p.id}/stats?group=${p.group}&season=${new Date().getFullYear()}&sportId=${sportId}`;try{const [sj,gj]=await Promise.all([stableJson(`${base}&stats=season`),freshJson(`${base}&stats=gameLog`)]);return {level,season:sj.stats?.[0]?.splits?.[0]?.stat||null,games:(gj.stats?.[0]?.splits||[]).map(g=>({...g,level}))};}catch(error){console.warn('Stats unavailable',p.name,level,error);return {level,season:null,games:[],failed:true}}}
async function load(p){const [levels,person]=await Promise.all([Promise.all(LEVELS.map(l=>fetchLevel(p,l))),fetchPerson(p)]),games=gamesSorted(levels.flatMap(x=>x.games)),latest=games[0],active=levels.find(x=>x.level===latest?.level)||levels.find(x=>x.season)||{},teamIds=[latest?.team?.id,...games.slice(0,5).map(g=>g.team?.id),person.currentTeam?.id],officialToday=await fetchOfficialToday(p,teamIds,active.level||latest?.level||'—');return {levels,games,latest,today:officialToday,season:active.season||{}};}
function meaningful(r){return Boolean(r?.today||r?.latest||r?.games?.length||r?.levels?.some(x=>x.season));}
function updateMetrics(results){const played=results.map((r,i)=>[r,players[i]]).filter(([r])=>r.today),hits=played.reduce((a,[r,p])=>a+(p.group==='hitting'?num(r.today.stat?.hits):0),0),ks=played.reduce((a,[r,p])=>a+(p.group==='pitching'?num(r.today.stat?.strikeOuts):0),0),hot=played.filter(([r,p])=>p.group==='hitting'?num(r.today.stat?.hits)>1||num(r.today.stat?.homeRuns):num(r.today.stat?.strikeOuts)>=4);document.querySelector('#player-count').textContent=players.length;document.querySelector('#today-count').textContent=played.length;document.querySelector('#highlight-count').textContent=hot.length;document.querySelector('#daily-total').textContent=`${hits} / ${ks}`;}
function snapshotSignature(results){return JSON.stringify({players:players.map(p=>[p.id,p.name,p.org,p.group]),results:results.map(r=>({today:r.today,latest:r.latest,season:r.season,games:(r.games||[]).slice(0,5)}))});}
function persistSnapshot(results,savedAt=Date.now()){lastPlayers=structuredClone(players);lastResults=structuredClone(results);lastSignature=snapshotSignature(results);lastSuccessAt=savedAt;try{localStorage.setItem(CACHE_KEY,JSON.stringify({savedAt,players:lastPlayers,results:lastResults}))}catch(error){console.warn('Could not persist last-good snapshot',error)}}
function paint(results,statusText){const summary=document.querySelector('#player-summary'),details=document.querySelector('#player-details');summary.innerHTML=summaryGroup('hitting',results)+summaryGroup('pitching',results);details.innerHTML=players.map((p,i)=>detail(p,results[i])).join('');updateMetrics(results);wireImages();document.querySelector('#last-update').textContent=statusText||`MLB API 已更新 · ${formatTime(lastSuccessAt||Date.now())}`;document.dispatchEvent(new CustomEvent('tracker:players-loaded',{detail:players}));}
function restoreSnapshot(){try{const cached=JSON.parse(localStorage.getItem(CACHE_KEY)||'null');if(!cached||!Array.isArray(cached.players)||!Array.isArray(cached.results)||cached.players.length!==cached.results.length)return false;setTrackedPlayers(cached.players);lastPlayers=structuredClone(cached.players);lastResults=structuredClone(cached.results);lastSignature=snapshotSignature(lastResults);lastSuccessAt=Number(cached.savedAt)||0;paint(lastResults,`最後有效資料 · ${formatTime(lastSuccessAt)}`);return true}catch(error){console.warn('Could not restore last-good snapshot',error);return false}}
async function collectResults(){
  const previousById=new Map(lastPlayers.map((p,i)=>[Number(p.id),lastResults[i]]));
  const fresh=[];
  for(let i=0;i<players.length;i+=3){
    const chunk=players.slice(i,i+3);
    const settled=await Promise.allSettled(chunk.map(load));
    fresh.push(...settled.map(entry=>entry.status==='fulfilled'?{result:entry.value,failed:false}:{result:null,failed:true,error:entry.reason}));
  }
  let freshCount=0,failedCount=0;
  const merged=fresh.map((entry,i)=>{
    if(!entry.failed&&meaningful(entry.result)){freshCount+=1;return entry.result}
    if(entry.failed)failedCount+=1;
    return previousById.get(Number(players[i].id))||entry.result||{levels:[],games:[],latest:null,today:null,season:{}};
  });
  if(!freshCount&&lastResults.length)throw new Error('MLB / MiLB API 暫時無法更新');
  return {results:merged,failedCount};
}
async function refreshData({list=null,reason='manual'}={}){
  const summary=document.querySelector('#player-summary'),lastUpdate=document.querySelector('#last-update');
  lastCheckAt=Date.now();
  if(lastResults.length)lastUpdate.textContent='正在向 MLB / MiLB 官方資料更新…';else if(!summary.children.length)summary.innerHTML='<div class="loading">正在讀取 MLB / MiLB 官方資料…</div>';
  try{
    if(list)setTrackedPlayers(list);else await loadTrackedPlayers();
    const {results,failedCount}=await collectResults(),sig=snapshotSignature(results),now=Date.now();
    const changed=sig!==lastSignature||players.length!==lastPlayers.length;
    persistSnapshot(results,now);
    if(changed)paint(results,failedCount?`部分球員 API 暫時無法更新 · 已保留舊資料 · ${formatTime(now)}`:`MLB API 已更新 · ${formatTime(now)}`);
    else lastUpdate.textContent=failedCount?`部分球員 API 暫時無法更新 · 舊資料保留 · ${formatTime(now)}`:`MLB API 已確認 · 無資料變更 · ${formatTime(now)}`;
    return results;
  }catch(error){
    console.error(error);
    if(lastResults.length){setTrackedPlayers(lastPlayers);lastUpdate.textContent=`MLB API 暫時無法更新 · 上次成功 ${formatTime(lastSuccessAt)}`;return lastResults}
    summary.innerHTML=`<div class="loading">${error.message}</div>`;
    throw error;
  }
}
window.applyTrackedPlayers=async list=>{if(!Array.isArray(list)||!list.length)throw new Error('觀察名單格式錯誤');return refreshData({list,reason:'watchlist'})};
document.querySelector('#today-date').textContent=new Intl.DateTimeFormat('zh-TW',{timeZone:'Asia/Taipei',month:'numeric',day:'numeric',weekday:'short'}).format(new Date());
document.querySelector('#refresh-btn').addEventListener('click',async e=>{e.currentTarget.disabled=true;try{await refreshData({reason:'button'})}finally{e.currentTarget.disabled=false}});
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&Date.now()-lastCheckAt>=AUTO_RECHECK_MS)refreshData({reason:'resume'}).catch(()=>{})});
const restored=restoreSnapshot();if(!restored)document.querySelector('#player-summary').innerHTML='<div class="loading">正在讀取 MLB / MiLB 官方資料…</div>';refreshData({reason:'startup'}).catch(()=>{});
