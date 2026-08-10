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
const LEVELS=[
  {sportId:1,label:'MLB'},
  {sportId:11,label:'AAA'},
  {sportId:12,label:'AA'},
  {sportId:13,label:'High-A'},
  {sportId:14,label:'Single-A'},
  {sportId:16,label:'Rookie'}
];

function loadingStats(){ return [["…","Loading"],["…","Live"],["…","Data"]]; }
function statTriplet(group,s={}){
  return group==='pitching'
    ? [[s.era??'—','ERA'],[s.strikeOuts??'—','SO'],[s.inningsPitched??'—','IP']]
    : [[s.avg??'—','AVG'],[s.homeRuns??'—','HR'],[s.ops??'—','OPS']];
}
function gameLine(group,s={}){
  if(group==='pitching') return `${s.inningsPitched??'0'} IP · ${s.strikeOuts??0} K · ${s.earnedRuns??0} ER`;
  return `${s.hits??0}-for-${s.atBats??0} · ${s.rbi??0} RBI · ${s.homeRuns??0} HR`;
}
function dateKey(value){ return value ? String(value).slice(0,10) : ''; }
function todayInTaiwan(){
  const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
  const get=t=>parts.find(p=>p.type===t)?.value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}
function newestGame(games=[]){
  return [...games].filter(g=>g?.date).sort((a,b)=>new Date(b.date)-new Date(a.date))[0]||null;
}
function activityLabel(last){
  if(!last) return '2026 尚無可用比賽紀錄';
  const lastDate=dateKey(last.date);
  const line=gameLine(last.group,last.stat||{});
  const prefix=lastDate===todayInTaiwan()?'TODAY':'TODAY · DID NOT PLAY';
  const latest=lastDate===todayInTaiwan()?'':` ｜ Latest ${lastDate}`;
  return `${prefix}${latest} · ${last.level} · ${line}`;
}
function card(player,stats=loadingStats(),latest='正在連接 MLB/MiLB 資料…'){
 return `<article class="player-card">
   <div class="player-top"><div><p>${player.org}</p><h3>${player.name}</h3><p>${player.role}</p></div><span class="status">${player.status}</span></div>
   <div class="stats">${stats.map(([v,l])=>`<div class="stat"><b>${v}</b><span>${l}</span></div>`).join('')}</div>
   <div class="placeholder">${latest}</div>
 </article>`;
}
async function fetchLevel(player,level){
  const base=`${API}/people/${player.id}/stats?group=${player.group}&season=2026&sportId=${level.sportId}`;
  try{
    const [seasonRes,logRes]=await Promise.all([fetch(`${base}&stats=season`),fetch(`${base}&stats=gameLog`)]);
    if(!seasonRes.ok||!logRes.ok) return null;
    const [season,log]=await Promise.all([seasonRes.json(),logRes.json()]);
    const seasonStat=season.stats?.[0]?.splits?.[0]?.stat||null;
    const games=(log.stats?.[0]?.splits||[]).map(g=>({...g,group:player.group,level:level.label}));
    return {level:level.label,seasonStat,games};
  }catch(e){ return null; }
}
async function getPlayerData(player){
  const levelResults=(await Promise.all(LEVELS.map(level=>fetchLevel(player,level)))).filter(Boolean);
  const allGames=levelResults.flatMap(r=>r.games||[]);
  const last=newestGame(allGames);
  if(!last) return {stats:statTriplet(player.group),latest:'2026 尚無可用比賽紀錄'};

  // Season numbers follow the level of the player's most recent actual game.
  const currentLevel=levelResults.find(r=>r.level===last.level);
  return {
    stats:statTriplet(player.group,currentLevel?.seasonStat||{}),
    latest:activityLabel(last)
  };
}
async function renderPlayers(){
  const root=document.querySelector('#players');
  root.innerHTML=players.map(p=>card(p)).join('');
  document.querySelector('#player-count').textContent=players.length;
  const results=await Promise.all(players.map(async p=>{try{return await getPlayerData(p)}catch(e){return {stats:statTriplet(p.group),latest:'⚠️ MLB/MiLB data 暫時無法載入'}}}));
  root.innerHTML=players.map((p,i)=>card(p,results[i].stats,results[i].latest)).join('');
}
document.querySelector('#refresh-btn').addEventListener('click',async()=>{
  const button=document.querySelector('#refresh-btn'); button.textContent='更新中…';
  await renderPlayers(); button.textContent='已更新資料 ✓'; setTimeout(()=>button.textContent='重新整理',1400);
});
renderPlayers();
