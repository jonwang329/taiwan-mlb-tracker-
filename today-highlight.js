(()=>{
  const CACHE_KEY='taiwan-mlb-tracker:last-good:v2';
  const HERO_ROTATE_MS=6500;
  const esc=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[ch]));
  const num=value=>Number(value||0), ip=value=>Number(value||0);
  const identities=window.TaiwanPlayerIdentities;
  const name=player=>identities?.label(player)||String(player?.name||'');
  const shortName=player=>name(player).split(/\s+/)[0]||name(player);
  let heroIndex=0,heroTimer=null,lastHeroCount=0;
  function readSnapshot(){
    if(typeof players!=='undefined'&&typeof lastResults!=='undefined'&&Array.isArray(players)&&Array.isArray(lastResults)&&players.length===lastResults.length&&players.length){return {players,results:lastResults};}
    const central=window.CENTRAL_DASHBOARD_SNAPSHOT;
    if(central&&Array.isArray(central.players)&&Array.isArray(central.results)&&central.players.length===central.results.length)return central;
    try{const c=JSON.parse(localStorage.getItem(CACHE_KEY)||'null');if(c&&Array.isArray(c.players)&&Array.isArray(c.results)&&c.players.length===c.results.length)return c;}catch{}
    return null;
  }
  function hitter(player,result){
    const s=result?.today?.stat||{},hits=num(s.hits),hr=num(s.homeRuns),rbi=num(s.rbi),sb=num(s.stolenBases),ab=num(s.atBats),bb=num(s.baseOnBalls),hbp=num(s.hitByPitch),pa=num(s.plateAppearances);
    const timesOnBase=hits+bb+hbp;
    const tags=[];let score=0;
    if(hits>=4){tags.push(`${hits}-hit game`);score+=110}else if(hits>=3){tags.push('3-hit game');score+=90}
    if(timesOnBase>=4){tags.push(`${timesOnBase} TIMES ON BASE`);score+=75}
    if(hr>=2){tags.push(`${hr} HR`);score+=90}else if(hr===1){tags.push('HOME RUN');score+=55}
    if(rbi>=4){tags.push(`${rbi} RBI`);score+=55}else if(rbi>=3){tags.push(`${rbi} RBI`);score+=35}
    if(sb>=2){tags.push(`${sb} SB`);score+=30}
    return tags.length?{player,score,title:shortName(player),headline:[...new Set(tags)].slice(0,2).join(' · '),detail:`${hits}-for-${ab}${pa?` · ${pa} PA`:''}${bb?` · ${bb} BB`:''}${hbp?` · ${hbp} HBP`:''}${rbi?` · ${rbi} RBI`:''}${sb?` · ${sb} SB`:''}`,href:`#player-${player.id}`}:null;
  }
  function pitcher(player,result){
    const s=result?.today?.stat||{},innings=ip(s.inningsPitched),er=num(s.earnedRuns),k=num(s.strikeOuts),bb=num(s.baseOnBalls),h=num(s.hits),sv=num(s.saves),holds=num(s.holds);
    const starter=num(s.gamesStarted)>0||result?.today?.probableStarter===true;
    const tags=[];let score=0;
    if(starter){
      if(innings>=7&&er<=2){tags.push('DOMINANT START');score+=85}
      if(innings>=6&&er<=3){tags.push('QUALITY START');score+=60}
      else if(innings>=5&&er<=2){tags.push('STRONG START');score+=45}
      if(k>=10){tags.push(`${k} K`);score+=80}else if(k>=8){tags.push(`${k} K`);score+=55}else if(k>=6){tags.push(`${k} K`);score+=32}
      if(innings>=5&&er===0){tags.push('SCORELESS');score+=45}
    }else{
      if(sv>0){tags.push('SAVE');score+=65}
      if(holds>0){tags.push('HOLD');score+=38}
      if(innings>=2&&er===0){tags.push('DOMINANT RELIEF');score+=65}
      else if(innings>=1&&er===0&&k>=2){tags.push('SHUTDOWN RELIEF');score+=48}
      else if(innings>=1&&er===0&&h+bb<=1){tags.push('SCORELESS RELIEF');score+=36}
      if(k>=4){tags.push(`${k} K`);score+=52}else if(k>=3){tags.push(`${k} K`);score+=38}else if(k>=2&&innings<=2.1){tags.push(`${k} K`);score+=24}
    }
    return tags.length?{player,score,title:shortName(player),headline:[...new Set(tags)].slice(0,2).join(' · '),detail:`${s.inningsPitched??0} IP · ${h} H · ${er} ER · ${bb} BB · ${k} K`,href:`#player-${player.id}`}:null;
  }
  function buildHighlights(snapshot){return snapshot.players.map((player,i)=>({player,result:snapshot.results[i]})).filter(x=>x.result?.today).map(x=>x.player.group==='pitching'?pitcher(x.player,x.result):hitter(x.player,x.result)).filter(Boolean).sort((a,b)=>b.score-a.score);}
  function pulse(snapshot){return snapshot.players.map((player,i)=>{const r=snapshot.results[i],s=r?.today?.stat||{};if(r?.today){if(player.group==='pitching')return `${shortName(player)} ${s.inningsPitched??0} IP · ${num(s.strikeOuts)} K · ${num(s.earnedRuns)} ER`;return `${shortName(player)} ${num(s.hits)}-${num(s.atBats)}${s.plateAppearances!=null?` · ${num(s.plateAppearances)} PA`:''}${num(s.baseOnBalls)?` · ${num(s.baseOnBalls)} BB`:''}${num(s.homeRuns)?` · ${num(s.homeRuns)} HR`:''}${num(s.rbi)?` · ${num(s.rbi)} RBI`:''}`;}const status=r?.currentStatus;const level=status?.level||r?.latest?.level||r?.levels?.find?.(x=>x?.season)?.level||'';return `${shortName(player)} ${level?`${level} · `:''}今日暫無出賽`;});}
  function armHeroRotation(count){clearInterval(heroTimer);lastHeroCount=count;if(count<=1){heroIndex=0;return;}heroIndex%=count;heroTimer=setInterval(()=>{heroIndex=(heroIndex+1)%Math.max(lastHeroCount,1);render({preserveIndex:true});},HERO_ROTATE_MS);}
  function render({preserveIndex=false}={}){const root=document.querySelector('#today-highlight');if(!root)return;const snapshot=readSnapshot();if(!snapshot){root.hidden=true;return;}const highlights=buildHighlights(snapshot),played=snapshot.results.filter(r=>r?.today).length;if(!preserveIndex&&highlights.length!==lastHeroCount)heroIndex=0;let hero;if(highlights.length)hero=highlights[heroIndex%highlights.length];else if(played)hero={title:'TODAY WATCH',headline:`今天已有 ${played} 位追蹤球員出賽`,detail:'目前沒有達到 Highlight 門檻的特殊表現，持續等待賽事更新。',href:'#summary-title'};else hero={title:'TODAY WATCH',headline:'等待今日旅美球員賽事',detail:'有重要表現時，這裡會自動顯示今日最值得注意的球員。',href:'#summary-title'};const tickerItems=pulse(snapshot);const heroCount=highlights.length;root.hidden=false;root.innerHTML=`<a class="highlight-hero" href="${esc(hero.href)}"><span class="highlight-kicker">今日重點 · TODAY’S HIGHLIGHT${heroCount>1?` · ${heroIndex%heroCount+1}/${heroCount}`:''}</span><strong>${esc(hero.title)}</strong><h2>${esc(hero.headline)}</h2><p>${esc(hero.detail)}</p><i aria-hidden="true">›</i></a><div class="highlight-ticker" aria-label="所有追蹤球員今日動態"><span>LIVE PULSE</span><div class="highlight-ticker-window"><div class="highlight-ticker-track">${tickerItems.map(text=>`<b>${esc(text)}</b>`).join('<em>•</em>')}</div></div></div>`;if(!preserveIndex)armHeroRotation(heroCount);}
  let timer;const schedule=()=>{clearTimeout(timer);timer=setTimeout(()=>render(),80)};
  document.addEventListener('tracker:players-loaded',schedule);
  window.addEventListener('tracker:authoritative-live-refresh',schedule);
  window.addEventListener('tracker:live-fast-refresh',schedule);
  window.addEventListener('tracker:gameday-universe',schedule);
  window.addEventListener('tracker:single-source-reconciled',schedule);
  window.addEventListener('storage',e=>{if(e.key===CACHE_KEY)schedule()});
  document.addEventListener('visibilitychange',()=>{if(document.hidden)clearInterval(heroTimer);else schedule();});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',schedule);else schedule();
})();
