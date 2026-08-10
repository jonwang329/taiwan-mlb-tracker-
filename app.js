const players = [
  { id: 701678, name: "李灝宇 Hao-Yu Lee", role: "2B", org: "Detroit Tigers", group: "hitting", status: "TRACKING" },
  { id: 691907, name: "鄭宗哲 Tsung-Che Cheng", role: "SS", org: "Boston Red Sox", group: "hitting", status: "TRACKING" },
  { id: 678906, name: "鄧愷威 Kai-Wei Teng", role: "RHP", org: "Houston Astros", group: "pitching", status: "TRACKING" },
  { id: 827734, name: "林維恩 Wei-En Lin", role: "LHP", org: "Athletics", group: "pitching", status: "PROSPECT" },
  { id: 801179, name: "林昱珉 Yu-Min Lin", role: "LHP", org: "Arizona Diamondbacks", group: "pitching", status: "PROSPECT" },
  { id: 828667, name: "柯敬賢 Ching-Hsien Ko", role: "OF", org: "Los Angeles Dodgers", group: "hitting", status: "PROSPECT" },
  { id: 813820, name: "林振瑋 Chen-Wei Lin", role: "RHP", org: "St. Louis Cardinals", group: "pitching", status: "PROSPECT" },
  { id: 800018, name: "莊陳仲敖 Chen Zhong-Ao Zhuang", role: "RHP", org: "Athletics", group: "pitching", status: "TRACKING" },
  { id: 808486, name: "李晨薰 Chen-Hsun Lee", role: "RHP", org: "San Francisco Giants", group: "pitching", status: "PROSPECT" }
];
const API='https://statsapi.mlb.com/api/v1';
const playerPhoto=id=>`https://img.mlbstatic.com/mlb-photos/image/upload/w_640,q_auto:best,f_auto/v1/people/${id}/headshot/67/current`;
const LEVELS=[{sportId:1,label:'MLB'},{sportId:11,label:'AAA'},{sportId:12,label:'AA'},{sportId:13,label:'High-A'},{sportId:14,label:'Single-A'},{sportId:16,label:'Rookie'}];
const num=v=>Number(v||0);
function loadingStats(){return [["…","Loading"],["…","Live"],["…","Data"]];}
function advancedStats(group,s={}){
 if(group==='pitching'){
  const ip=num(s.inningsPitched),bb=num(s.baseOnBalls),k=num(s.strikeOuts);
  const k9=ip?((k*9)/ip).toFixed(1):'—',bb9=ip?((bb*9)/ip).toFixed(1):'—',kbb=bb?(k/bb).toFixed(2):(k?`${k}.00`:'—');
  return [[s.era??'—','ERA'],[s.whip??'—','WHIP'],[s.inningsPitched??'—','IP'],[s.strikeOuts??'—','K'],[s.baseOnBalls??'—','BB'],[k9,'K/9'],[bb9,'BB/9'],[kbb,'K/BB']];
 }
 return [[s.avg??'—','AVG'],[s.obp??'—','OBP'],[s.slg??'—','SLG'],[s.ops??'—','OPS'],[s.homeRuns??'—','HR'],[s.rbi??'—','RBI'],[s.baseOnBalls??'—','BB'],[s.strikeOuts??'—','K']];
}
function gameLine(group,s={}){return group==='pitching'?`${s.inningsPitched??'0'} IP · ${s.strikeOuts??0} K · ${s.baseOnBalls??0} BB · ${s.earnedRuns??0} ER`:`${s.hits??0}-for-${s.atBats??0} · ${s.rbi??0} RBI · ${s.homeRuns??0} HR`;}
function dateKey(v){return v?String(v).slice(0,10):'';}
function todayInTaiwan(){const p=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());const g=t=>p.find(x=>x.type===t)?.value;return `${g('year')}-${g('month')}-${g('day')}`;}
function sortedGames(g=[]){return [...g].filter(x=>x?.date).sort((a,b)=>new Date(b.date)-new Date(a.date));}
function highlight(player,last,season={}){
 if(!last)return {score:0,label:'',summary:''}; const s=last.stat||{}; let score=0,reasons=[];
 if(player.group==='hitting'){
  if(num(s.hits)>=1){score+=1;reasons.push(`${s.hits} 安打`);} if(num(s.hits)>=2)score+=1;
  if(num(s.homeRuns)>=1){score+=3;reasons.push(`${s.homeRuns} HR`);} if(num(s.rbi)>=2){score+=2;reasons.push(`${s.rbi} RBI`);} if(num(s.stolenBases)>=1){score+=1;reasons.push(`${s.stolenBases} SB`);}
 } else {
  const ip=num(s.inningsPitched),k=num(s.strikeOuts),er=num(s.earnedRuns),bb=num(s.baseOnBalls);
  if(k>=4){score+=1;reasons.push(`${k} K`);} if(k>=6)score+=2; if(ip>=5&&er<=2){score+=2;reasons.push(`${s.inningsPitched} IP / ${er} ER`);} if(ip>=6&&er===0)score+=2; if(bb===0&&ip>=3){score+=1;reasons.push('0 BB');}
 }
 const label=score>=4?'🔥 HIGHLIGHT':score>=1?'👍 GOOD':'';
 const context=player.group==='hitting'?(season.ops?`Season OPS ${season.ops}`:''):(season.era?`Season ERA ${season.era}${season.whip?` · WHIP ${season.whip}`:''}`:'');
 return {score,label,summary:[reasons.join(' · '),context].filter(Boolean).join(' ｜ ')};
}
function activityLabel(last){if(!last)return '2026 尚無可用比賽紀錄';const d=dateKey(last.date);return d===todayInTaiwan()?`TODAY · ${last.level} · ${gameLine(last.group,last.stat||{})}`:`TODAY · DID NOT PLAY ｜ Latest ${d} · ${last.level} · ${gameLine(last.group,last.stat||{})}`;}
function recentResult(game){const s=game.stat||{};return game.group==='pitching'?`${s.inningsPitched??'0'} IP`:`${s.hits??0}/${s.atBats??0}`;}
function recentKeyStats(game){const s=game.stat||{};return game.group==='pitching'?`${s.strikeOuts??0} K · ${s.earnedRuns??0} ER`:`${s.rbi??0} RBI · ${s.homeRuns??0} HR`;}
function recentGamesHtml(g=[]){const r=sortedGames(g).slice(0,5);return `<section class="recent-games"><div class="subsection-title"><span>Last 5 games</span><span>近五場</span></div>${r.length?`<div class="recent-table"><div class="recent-row recent-head"><span>Date</span><span>Level</span><span>Result</span><span>Key stats</span></div>${r.map(x=>`<div class="recent-row"><time datetime="${dateKey(x.date)}">${dateKey(x.date).slice(5).replace('-','/')}</time><span>${x.level}</span><strong>${recentResult(x)}</strong><span>${recentKeyStats(x)}</span></div>`).join('')}</div>`:'<p class="recent-empty">尚無比賽資料</p>'}</section>`;}
function initials(player){return player.name.split(' ').slice(-2).map(x=>x[0]).join('').toUpperCase();}
function photoHtml(player,priority=false){return `<div class="player-photo"><img src="${playerPhoto(player.id)}" alt="${player.name} 球員照片" ${priority?'fetchpriority="high"':'loading="lazy"'} decoding="async"><span aria-hidden="true">${initials(player)}</span></div>`;}
function wirePhotoFallbacks(root=document){root.querySelectorAll('.player-photo img:not([data-ready])').forEach(img=>{img.dataset.ready='true';const fallback=()=>img.closest('.player-photo')?.classList.add('photo-fallback');img.addEventListener('error',fallback,{once:true});if(img.complete&&!img.naturalWidth)fallback();});}
function identityHtml(player,level=player.role){return `<div class="player-top"><div class="player-identity"><h3>${player.name}</h3><p><span class="team-badge">${player.org}</span><span class="position">${level}</span></p></div><span class="status">${player.status}</span></div>`;}
function card(player,stats=loadingStats(),latest='正在連接 MLB/MiLB 資料…',games=[],insight=null){return `<article class="player-card">${photoHtml(player)}<div class="player-content">${identityHtml(player)}<section class="today-block"><div class="game-label">Today's game</div><div class="today-line">${latest}</div>${insight?.label?`<span class="performance-tag">${insight.label}</span>`:''}</section><div class="stats">${stats.map(([v,l])=>`<div class="stat"><b>${v}</b><span>${l}</span></div>`).join('')}</div>${insight?.summary?`<section class="insight"><b>Insight</b><p>${insight.summary}</p></section>`:''}${recentGamesHtml(games)}</div></article>`;}
async function fetchLevel(player,level){const base=`${API}/people/${player.id}/stats?group=${player.group}&season=2026&sportId=${level.sportId}`;try{const [a,b]=await Promise.all([fetch(`${base}&stats=season`),fetch(`${base}&stats=gameLog`)]);if(!a.ok||!b.ok)return null;const [season,log]=await Promise.all([a.json(),b.json()]);return {level:level.label,seasonStat:season.stats?.[0]?.splits?.[0]?.stat||null,games:(log.stats?.[0]?.splits||[]).map(g=>({...g,group:player.group,level:level.label}))};}catch(e){return null;}}
async function getPlayerData(player){const levels=(await Promise.all(LEVELS.map(l=>fetchLevel(player,l)))).filter(Boolean),games=sortedGames(levels.flatMap(r=>r.games||[])),last=games[0]||null;if(!last)return {stats:advancedStats(player.group),latest:'2026 尚無可用比賽紀錄',games:[],last:null,insight:null};const current=levels.find(r=>r.level===last.level),season=current?.seasonStat||{};return {stats:advancedStats(player.group,season),latest:activityLabel(last),games,last,insight:highlight(player,last,season)};}
function renderToday(results){const today=todayInTaiwan(),played=results.map((r,i)=>({result:r,player:players[i]})).filter(x=>dateKey(x.result.last?.date)===today);document.querySelector('#today-count').textContent=played.length;document.querySelector('#today-date').textContent=today;const root=document.querySelector('#today-summary');if(!played.length){root.innerHTML='<article class="player-card empty-today"><div class="fallback-ball" aria-hidden="true">TW</div><div><b>今天目前沒有追蹤球員的已完成出賽紀錄。</b><br><span>稍後按「重新整理」即可再次查詢。</span></div></article>';return;}root.innerHTML=played.map(x=>`<article class="player-card today-player">${photoHtml(x.player,true)}<div class="player-content">${identityHtml(x.player,x.result.last.level)}<div class="game-label">TODAY'S PERFORMANCE</div><div class="today-performance">${gameLine(x.player.group,x.result.last.stat||{})}</div>${x.result.insight?.summary?`<p class="today-insight">${x.result.insight.summary}</p>`:''}</div></article>`).join('');wirePhotoFallbacks(root);}
async function renderPlayers(){const root=document.querySelector('#players');root.innerHTML=players.map(p=>card(p)).join('');wirePhotoFallbacks(root);document.querySelector('#player-count').textContent=players.length;const results=await Promise.all(players.map(async p=>{try{return await getPlayerData(p)}catch(e){return {stats:advancedStats(p.group),latest:'⚠️ MLB/MiLB data 暫時無法載入',games:[],last:null,insight:null}}}));root.innerHTML=players.map((p,i)=>card(p,results[i].stats,results[i].latest,results[i].games,results[i].insight)).join('');wirePhotoFallbacks(root);renderToday(results);}
document.querySelector('#refresh-btn').addEventListener('click',async()=>{const b=document.querySelector('#refresh-btn');b.textContent='更新中…';await renderPlayers();b.textContent='已更新資料 ✓';setTimeout(()=>b.textContent='重新整理',1400);});renderPlayers();
