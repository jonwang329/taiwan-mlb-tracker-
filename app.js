const players = [
  { id: 701678, name: "李灝宇 Hao-Yu Lee", role: "2B", org: "Detroit Tigers · MLB", group: "hitting", status: "MLB", sportId: 1 },
  { id: 691907, name: "鄭宗哲 Tsung-Che Cheng", role: "SS", org: "Boston Red Sox · MLB/AAA", group: "hitting", status: "40-MAN", sportId: 1 },
  { id: 678906, name: "鄧愷威 Kai-Wei Teng", role: "RHP", org: "Houston Astros · MLB", group: "pitching", status: "MLB", sportId: 1 },
  { id: 827734, name: "林維恩 Wei-En Lin", role: "LHP", org: "Athletics · AAA", group: "pitching", status: "PROSPECT", sportId: 11 },
  { id: null, name: "賴謙凡 Chien-Fan Lai", role: "RHP", org: "New York Yankees · DSL", group: "pitching", status: "NEW SIGNEE", sportId: 16 },
  { id: 801179, name: "林昱珉 Yu-Min Lin", role: "LHP", org: "Arizona Diamondbacks · AAA", group: "pitching", status: "PROSPECT", sportId: 11 },
  { id: 828667, name: "柯敬賢 Ching-Hsien Ko", role: "OF", org: "Los Angeles Dodgers · MiLB", group: "hitting", status: "PROSPECT", sportId: 12 },
  { id: 813820, name: "林振瑋 Chen-Wei Lin", role: "RHP", org: "St. Louis Cardinals · AA", group: "pitching", status: "PROSPECT", sportId: 12 },
  { id: 800018, name: "莊陳仲敖 Chen Zhong-Ao Zhuang", role: "RHP", org: "Athletics · AAA / 40-man", group: "pitching", status: "40-MAN", sportId: 11 },
  { id: 808486, name: "李晨薰 Chen-Hsun Lee", role: "RHP", org: "San Francisco Giants · A", group: "pitching", status: "PROSPECT", sportId: 13 }
];

const API='https://statsapi.mlb.com/api/v1';

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

function card(player,stats=loadingStats(),latest='正在連接 MLB/MiLB 資料…'){
 return `<article class="player-card">
   <div class="player-top"><div><p>${player.org}</p><h3>${player.name}</h3><p>${player.role}</p></div><span class="status">${player.status}</span></div>
   <div class="stats">${stats.map(([v,l])=>`<div class="stat"><b>${v}</b><span>${l}</span></div>`).join('')}</div>
   <div class="placeholder">${latest}</div>
 </article>`;
}

async function getPlayerData(player){
 if(!player.id) return {stats:statTriplet(player.group),latest:'2026 新簽約 · 尚待 MLB/MiLB Stats ID 建立'};
 const sport=`&sportId=${player.sportId||1}`;
 const seasonUrl=`${API}/people/${player.id}/stats?stats=season&group=${player.group}&season=2026${sport}`;
 const logUrl=`${API}/people/${player.id}/stats?stats=gameLog&group=${player.group}&season=2026${sport}`;
 const [seasonRes,logRes]=await Promise.all([fetch(seasonUrl),fetch(logUrl)]);
 if(!seasonRes.ok||!logRes.ok) throw new Error('MLB API unavailable');
 const season=await seasonRes.json(); const log=await logRes.json();
 const seasonStat=season.stats?.[0]?.splits?.[0]?.stat||{};
 const games=log.stats?.[0]?.splits||[];
 const last=games.length?games[games.length-1]:null;
 const latest=last ? `最近一場 ${last.date||''} · ${gameLine(player.group,last.stat||{})}` : '2026 尚無可用比賽紀錄';
 return {stats:statTriplet(player.group,seasonStat),latest};
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
