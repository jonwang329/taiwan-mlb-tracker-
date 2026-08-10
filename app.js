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
const value=v=>v??'—';
function splitName(name){const parts=name.split(' ');return {zh:parts[0],en:parts.slice(1).join(' ')};}
function advancedStats(group,s={}){return group==='pitching'?[[value(s.era),'ERA'],[value(s.whip),'WHIP'],[value(s.strikeOuts),'K'],[value(s.inningsPitched),'IP']]:[[value(s.avg),'AVG'],[value(s.obp),'OBP'],[value(s.slg),'SLG'],[value(s.ops),'OPS']];}
function gameLine(group,s={}){return group==='pitching'?`${s.inningsPitched??'0'} IP · ${s.strikeOuts??0} K · ${s.baseOnBalls??0} BB · ${s.earnedRuns??0} ER`:`${s.hits??0}-${s.atBats??0} · ${s.rbi??0} RBI · ${s.homeRuns??0} HR`;}
function dateKey(v){return v?String(v).slice(0,10):'';}
function todayInTaiwan(){const p=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());const g=t=>p.find(x=>x.type===t)?.value;return `${g('year')}-${g('month')}-${g('day')}`;}
function sortedGames(g=[]){return [...g].filter(x=>x?.date).sort((a,b)=>new Date(b.date)-new Date(a.date));}
function highlight(player,last,season={}){
 if(!last)return {score:0,label:'',summary:''}; const s=last.stat||{}; let score=0,reasons=[];
 if(player.group==='hitting'){if(num(s.hits)>=1){score++;reasons.push(`${s.hits} 安打`);}if(num(s.hits)>=2)score++;if(num(s.homeRuns)>=1){score+=3;reasons.push(`${s.homeRuns} HR`);}if(num(s.rbi)>=2){score+=2;reasons.push(`${s.rbi} RBI`);}}
 else {const ip=num(s.inningsPitched),k=num(s.strikeOuts),er=num(s.earnedRuns);if(k>=4){score++;reasons.push(`${k} K`);}if(k>=6)score+=2;if(ip>=5&&er<=2){score+=2;reasons.push(`${s.inningsPitched} IP / ${er} ER`);}}
 const context=player.group==='hitting'?(season.ops?`球季 OPS ${season.ops}`:''):(season.era?`球季 ERA ${season.era}`:'');
 return {score,label:score>=4?'本日亮點':score>=1?'表現出色':'',summary:[reasons.join(' · '),context].filter(Boolean).join(' ｜ ')};
}
function recentCompact(g=[]){const recent=sortedGames(g).slice(0,5);if(!recent.length)return '—';return recent.map(x=>{const s=x.stat||{};return x.group==='pitching'?`${s.inningsPitched??0}IP`:`${s.hits??0}/${s.atBats??0}`;}).join(' · ');}
function initials(player){return player.name.split(' ').slice(-2).map(x=>x[0]).join('').toUpperCase();}
function photoHtml(player){return `<div class="player-photo"><img src="${playerPhoto(player.id)}" alt="${player.name} 球員照片" loading="lazy" decoding="async"><span>${initials(player)}</span></div>`;}
function wirePhotoFallbacks(root=document){root.querySelectorAll('.player-photo img:not([data-ready])').forEach(img=>{img.dataset.ready='true';const fallback=()=>img.closest('.player-photo')?.classList.add('photo-fallback');img.addEventListener('error',fallback,{once:true});if(img.complete&&!img.naturalWidth)fallback();});}
function displayLevel(result,player){return result.last?.level||player.role;}
function todayText(result,player){return dateKey(result.last?.date)===todayInTaiwan()?gameLine(player.group,result.last.stat||{}):'今日未出賽';}
function playerCard(player,result){const n=splitName(player.name),stats=advancedStats(player.group,result.season);return `<article class="player-card">
  <div class="identity-row">${photoHtml(player)}<div class="identity"><h3>${n.zh}</h3><b>${n.en}</b><p>${player.org}</p><span>${player.role} · ${displayLevel(result,player)}</span></div></div>
  <section class="today-box"><small>TODAY'S GAME</small><strong>${todayText(result,player)}</strong></section>
  <div class="season-stats">${stats.map(([v,l])=>`<div><b>${v}</b><span>${l}</span></div>`).join('')}</div>
  <div class="mobile-detail"><p class="card-insight"><b>INSIGHT</b><span>${result.insight?.summary||'目前沒有可用的表現洞察'}</span></p><p class="last-five"><b>LAST 5</b><span>${recentCompact(result.games)}</span></p></div>
 </article>`;}
async function fetchLevel(player,level){const base=`${API}/people/${player.id}/stats?group=${player.group}&season=2026&sportId=${level.sportId}`;try{const [a,b]=await Promise.all([fetch(`${base}&stats=season`),fetch(`${base}&stats=gameLog`)]);if(!a.ok||!b.ok)return null;const [season,log]=await Promise.all([a.json(),b.json()]);return {level:level.label,seasonStat:season.stats?.[0]?.splits?.[0]?.stat||null,games:(log.stats?.[0]?.splits||[]).map(g=>({...g,group:player.group,level:level.label}))};}catch(e){return null;}}
async function getPlayerData(player){const levels=(await Promise.all(LEVELS.map(l=>fetchLevel(player,l)))).filter(Boolean),games=sortedGames(levels.flatMap(r=>r.games||[])),last=games[0]||null,current=levels.find(r=>r.level===last?.level),season=current?.seasonStat||{};return {season,games,last,insight:highlight(player,last,season)};}
function renderTable(results){document.querySelector('#stats-body').innerHTML=players.map((p,i)=>{const r=results[i],n=splitName(p.name),played=dateKey(r.last?.date)===todayInTaiwan(),s=r.season||{};return `<tr><td><b>${n.zh}</b><span>${n.en}</span></td><td><em>${displayLevel(r,p)}</em></td><td class="today-cell">${played?gameLine(p.group,r.last.stat||{}):'DNP'}</td><td>${value(p.group==='pitching'?s.era:s.avg)}</td><td>${value(p.group==='pitching'?s.whip:s.ops)}</td><td>${value(p.group==='pitching'?s.strikeOuts:s.homeRuns)}</td><td class="last-cell">${recentCompact(r.games)}</td></tr>`;}).join('');}
function renderInsights(results){const ranked=results.map((r,i)=>({...r,player:players[i]})).filter(x=>x.last).sort((a,b)=>(b.insight?.score||0)-(a.insight?.score||0));const best=ranked[0],recent=ranked.sort((a,b)=>new Date(b.last.date)-new Date(a.last.date))[0];const items=[];if(best?.insight?.score)items.push(['🔥','本日亮點',splitName(best.player.name).zh,best.insight.summary]);if(recent)items.push(['⚾','最近出賽',splitName(recent.player.name).zh,`${dateKey(recent.last.date)} · ${gameLine(recent.player.group,recent.last.stat||{})}`]);items.push(['💡','持續關注','完整旅美名單',`目前追蹤 ${players.length} 位 MLB / MiLB 台灣球員`]);document.querySelector('#insights').innerHTML=items.map(x=>`<article><i>${x[0]}</i><div><small>${x[1]}</small><b>${x[2]}</b><p>${x[3]}</p></div></article>`).join('');}
function updateSummary(results){const today=todayInTaiwan(),played=results.map((result,i)=>({result,player:players[i]})).filter(x=>dateKey(x.result.last?.date)===today),highlights=played.filter(x=>x.result.insight?.score>=1),hits=played.reduce((a,x)=>a+(x.player.group==='hitting'?num(x.result.last.stat?.hits):0),0),ks=played.reduce((a,x)=>a+(x.player.group==='pitching'?num(x.result.last.stat?.strikeOuts):0),0);document.querySelector('#player-count').textContent=players.length;document.querySelector('#today-count').textContent=played.length;document.querySelector('#highlight-count').textContent=highlights.length;document.querySelector('#mlb-count').textContent=results.filter(r=>r.last?.level==='MLB').length;document.querySelector('#daily-total').textContent=`${hits} / ${ks}`;}
async function renderPlayers(){const root=document.querySelector('#player-overview');root.innerHTML=players.map(p=>playerCard(p,{season:{},games:[],last:null,insight:null})).join('');wirePhotoFallbacks(root);const results=await Promise.all(players.map(p=>getPlayerData(p).catch(()=>({season:{},games:[],last:null,insight:null}))));root.innerHTML=players.map((p,i)=>playerCard(p,results[i])).join('');wirePhotoFallbacks(root);renderTable(results);renderInsights(results);updateSummary(results);const now=new Intl.DateTimeFormat('zh-TW',{timeZone:'Asia/Taipei',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date());document.querySelector('#last-update').textContent=now;document.querySelector('#side-update').textContent=`Last update ${now}`;}
document.querySelector('#today-date').textContent=todayInTaiwan();
document.querySelector('#refresh-btn').addEventListener('click',async e=>{const button=e.currentTarget;button.disabled=true;button.textContent='更新中…';await renderPlayers();button.textContent='✓ 已更新';setTimeout(()=>{button.textContent='↻ 更新資料';button.disabled=false;},1400);});
renderPlayers();
