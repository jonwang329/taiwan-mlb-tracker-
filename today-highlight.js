(()=>{
  const CACHE_KEY='taiwan-mlb-tracker:last-good:v2';
  const esc=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[ch]));
  const num=value=>Number(value||0);
  const ipValue=value=>{const n=Number(value);return Number.isFinite(n)?n:0;};
  const shortName=player=>{
    const full=String(player?.name||'').trim();
    const first=full.split(/\s+/)[0]||full;
    return /[\u3400-\u9fff]/.test(first)?first:full;
  };
  function readSnapshot(){
    try{
      const cached=JSON.parse(localStorage.getItem(CACHE_KEY)||'null');
      if(cached&&Array.isArray(cached.players)&&Array.isArray(cached.results)&&cached.players.length===cached.results.length)return cached;
    }catch(error){console.warn('[highlight] cache unavailable',error);}
    const central=window.CENTRAL_DASHBOARD_SNAPSHOT;
    if(central&&Array.isArray(central.players)&&Array.isArray(central.results)&&central.players.length===central.results.length)return central;
    return null;
  }
  function hitterHighlights(player,result){
    const stat=result?.today?.stat||{};
    const hits=num(stat.hits),hr=num(stat.homeRuns),rbi=num(stat.rbi),sb=num(stat.stolenBases),bb=num(stat.baseOnBalls),ab=num(stat.atBats);
    const tags=[];
    let score=0;
    if(hits>=4){tags.push(`${hits}-hit game`);score+=110;}
    else if(hits>=3){tags.push('3-hit game');score+=90;}
    if(hr>=2){tags.push(`${hr} HR`);score+=90;}
    else if(hr===1){tags.push('HOME RUN');score+=55;}
    if(rbi>=4){tags.push(`${rbi} RBI`);score+=55;}
    else if(rbi>=3){tags.push(`${rbi} RBI`);score+=35;}
    if(sb>=2){tags.push(`${sb} SB`);score+=30;}
    if(bb>=3){tags.push(`${bb} BB`);score+=18;}
    if(!tags.length)return null;
    return {player,score,title:shortName(player),headline:tags.slice(0,2).join(' · '),detail:`${hits}-for-${ab}${rbi?` · ${rbi} RBI`:''}${sb?` · ${sb} SB`:''}`,href:`#player-${player.id}`};
  }
  function pitcherHighlights(player,result){
    const stat=result?.today?.stat||{};
    const ip=ipValue(stat.inningsPitched),er=num(stat.earnedRuns),k=num(stat.strikeOuts),bb=num(stat.baseOnBalls),h=num(stat.hits);
    const tags=[];
    let score=0;
    if(ip>=7&&er<=2){tags.push('DOMINANT START');score+=85;}
    else if(ip>=5&&er<=2){tags.push('QUALITY OUTING');score+=60;}
    if(k>=10){tags.push(`${k} K`);score+=80;}
    else if(k>=8){tags.push(`${k} K`);score+=55;}
    else if(k>=6){tags.push(`${k} K`);score+=32;}
    if(ip>=3&&er===0){tags.push('SCORELESS');score+=38;}
    if(!tags.length)return null;
    return {player,score,title:shortName(player),headline:[...new Set(tags)].slice(0,2).join(' · '),detail:`${stat.inningsPitched??0} IP · ${h} H · ${er} ER · ${bb} BB · ${k} K`,href:`#player-${player.id}`};
  }
  function buildHighlights(snapshot){
    return snapshot.players.map((player,index)=>({player,result:snapshot.results[index]})).filter(({result})=>result?.today).map(({player,result})=>player.group==='pitching'?pitcherHighlights(player,result):hitterHighlights(player,result)).filter(Boolean).sort((a,b)=>b.score-a.score);
  }
  function render(){
    const root=document.querySelector('#today-highlight');
    if(!root)return;
    const snapshot=readSnapshot();
    if(!snapshot){root.hidden=true;return;}
    const highlights=buildHighlights(snapshot);
    const played=snapshot.results.filter(result=>result?.today).length;
    let hero;
    if(highlights.length){hero=highlights[0];}
    else if(played){
      hero={title:'TODAY WATCH',headline:`今天已有 ${played} 位追蹤球員出賽`,detail:'目前沒有達到 Highlight 門檻的特殊表現，持續等待賽事更新。',href:'#summary-title'};
    }else{
      hero={title:'TODAY WATCH',headline:'等待今日旅美球員賽事',detail:'有重要表現時，這裡會自動顯示今日最值得注意的球員。',href:'#summary-title'};
    }
    const tickerItems=highlights.slice(0,4).map(item=>`${shortName(item.player)} ${item.headline}`);
    if(!tickerItems.length)tickerItems.push(played?`${played} 位球員今日已有出賽紀錄`:'今日焦點將隨 MLB / MiLB 官方資料自動更新');
    root.hidden=false;
    root.innerHTML=`<a class="highlight-hero" href="${esc(hero.href)}"><span class="highlight-kicker">${highlights.length?'TODAY’S HIGHLIGHT':'TODAY WATCH'}</span><strong>${esc(hero.title)}</strong><h2>${esc(hero.headline)}</h2><p>${esc(hero.detail)}</p><i aria-hidden="true">›</i></a><div class="highlight-ticker" aria-label="今日焦點快訊"><span>LIVE PULSE</span><div class="highlight-ticker-window"><div class="highlight-ticker-track">${tickerItems.map(text=>`<b>${esc(text)}</b>`).join('<em>•</em>')}</div></div></div>`;
  }
  let timer;
  const schedule=()=>{clearTimeout(timer);timer=setTimeout(render,80);};
  document.addEventListener('tracker:players-loaded',schedule);
  window.addEventListener('storage',event=>{if(event.key===CACHE_KEY)schedule();});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',schedule);else schedule();
})();
