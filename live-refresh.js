(() => {
  const btn=document.querySelector('#refresh-btn');
  const lastUpdate=document.querySelector('#last-update');
  if(!btn)return;

  const LIVE_API='https://statsapi.mlb.com/api/v1.1';
  const LIVE_MS=75*1000;
  let refreshing=false;
  let timer=null;
  const num=value=>Number(value||0);
  const val=(value,fallback='—')=>value??fallback;
  const formatTime=ts=>new Intl.DateTimeFormat('zh-TW',{timeZone:'Asia/Taipei',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(ts));

  function currentPairs(){
    if(typeof players!=='undefined'&&typeof lastResults!=='undefined'&&Array.isArray(players)&&Array.isArray(lastResults)){
      return players.map((player,index)=>({player,result:lastResults[index]})).filter(({result})=>result);
    }
    const snapshot=window.CENTRAL_DASHBOARD_SNAPSHOT;
    if(!snapshot||!Array.isArray(snapshot.players)||!Array.isArray(snapshot.results))return [];
    return snapshot.players.map((player,index)=>({player,result:snapshot.results[index]})).filter(({result})=>result);
  }

  function knownGameIds(){
    return [...new Set(currentPairs().map(({result})=>Number(result?.today?.game?.gamePk)).filter(Boolean))];
  }

  function liveAppearance(player,stat={}){
    return player.group==='pitching'
      ? num(stat.battersFaced)>0||num(stat.pitchesThrown)>0||num(stat.inningsPitched)>0
      : num(stat.plateAppearances)>0||num(stat.atBats)>0||num(stat.runs)>0||num(stat.baseOnBalls)>0||num(stat.hitByPitch)>0||num(stat.sacFlies)>0||num(stat.sacBunts)>0;
  }

  function line(player,stat={}){
    return player.group==='pitching'
      ? `${val(stat.inningsPitched,'0')} IP · ${val(stat.hits,0)} H · ${val(stat.earnedRuns,0)} ER · ${val(stat.baseOnBalls,0)} BB · ${val(stat.strikeOuts,0)} K${stat.battersFaced!=null?` · ${stat.battersFaced} BF`:''}`
      : `${val(stat.hits,0)}-${val(stat.atBats,0)}${stat.plateAppearances!=null?` · ${stat.plateAppearances} PA`:''} · ${num(stat.homeRuns)?`${stat.homeRuns} HR · `:''}${num(stat.rbi)?`${stat.rbi} RBI`:''}`.replace(/ · $/,'');
  }

  async function fetchFeed(gamePk){
    const controller=new AbortController();
    const timeout=setTimeout(()=>controller.abort(),7000);
    try{
      const response=await fetch(`${LIVE_API}/game/${gamePk}/feed/live?_=${Date.now()}`,{cache:'no-store',headers:{Accept:'application/json','Cache-Control':'no-cache'},signal:controller.signal});
      if(!response.ok)throw new Error(`MLB live ${response.status}`);
      return response.json();
    }finally{clearTimeout(timeout);}
  }

  function playerEntry(feed,player){
    const key=`ID${player.id}`;
    const home=feed?.liveData?.boxscore?.teams?.home?.players?.[key];
    if(home)return {boxPlayer:home,side:'home'};
    const away=feed?.liveData?.boxscore?.teams?.away?.players?.[key];
    if(away)return {boxPlayer:away,side:'away'};
    return null;
  }

  function mergeRecent(result,current){
    const gamePk=Number(current?.game?.gamePk);
    const old=Array.isArray(result.games)?result.games:[];
    result.games=[current,...old.filter(g=>Number(g?.game?.gamePk)!==gamePk)].slice(0,5);
    result.latest=result.games[0]||result.latest;
  }

  function applyFeed(player,result,feed){
    const entry=playerEntry(feed,player);
    if(!entry)return false;
    const stat=player.group==='pitching'?(entry.boxPlayer.stats?.pitching||{}):(entry.boxPlayer.stats?.batting||entry.boxPlayer.stats?.hitting||{});
    if(!liveAppearance(player,stat))return false;
    const gamePk=Number(feed?.gamePk||feed?.gameData?.game?.pk);
    if(!gamePk||Number(result?.today?.game?.gamePk)!==gamePk)return false;
    const state=feed?.gameData?.status?.abstractGameState;
    const isLive=state==='Live';
    result.today={...(result.today||{}),stat:{...stat},game:{gamePk},live:isLive};
    const home=feed?.gameData?.teams?.home,away=feed?.gameData?.teams?.away;
    const team=entry.side==='home'?home:away,opponent=entry.side==='home'?away:home;
    mergeRecent(result,{date:feed?.gameData?.datetime?.officialDate||result.today.date,level:result.today.level||result.latest?.level||'—',stat:{...stat},team:team?.id?{id:team.id,name:team.name}:undefined,opponent:opponent?.id?{id:opponent.id,name:opponent.name}:undefined,game:{gamePk},live:isLive});
    const summary=document.querySelector(`a[href="#player-${player.id}"] .summary-today`);
    if(summary)summary.textContent=`${line(player,stat)}${isLive?' · LIVE':''}`;
    const detail=document.querySelector(`#player-${player.id} .today-detail`);
    if(detail){const strong=detail.querySelector('strong'),p=detail.querySelector('p');if(strong)strong.textContent=isLive?'LIVE · 已出賽':'已出賽';if(p)p.textContent=line(player,stat);}
    if(typeof gameRows==='function'){
      const section=document.querySelector(`#player-${player.id} .last-five`),existing=section?.querySelector('.game-table, .empty');
      if(section){const holder=document.createElement('div');holder.innerHTML=gameRows(player,result.games||[]);const replacement=holder.firstElementChild;if(replacement){if(isLive){const first=replacement.querySelector('.game-row:not(.game-head) span:nth-child(2)');if(first)first.textContent='LIVE';}if(existing)existing.replaceWith(replacement);else section.appendChild(replacement);}}
    }
    return true;
  }

  async function refreshKnownGames({quiet=false}={}){
    const ids=knownGameIds();
    if(!ids.length){if(!quiet&&lastUpdate)lastUpdate.textContent='WAITING FOR MLB · canonical snapshot 尚未提供今日 gamePk';return false;}
    const settled=await Promise.allSettled(ids.map(async id=>[id,await fetchFeed(id)]));
    const feeds=new Map(settled.filter(x=>x.status==='fulfilled').map(x=>x.value));
    if(!feeds.size)throw new Error('MLB LIVE feed 暫時無法更新');
    let updated=0;
    for(const {player,result} of currentPairs()){
      const gamePk=Number(result?.today?.game?.gamePk),feed=feeds.get(gamePk);
      if(feed&&applyFeed(player,result,feed))updated+=1;
    }
    if(lastUpdate)lastUpdate.textContent=`LIVE · MLB synced ${formatTime(Date.now())}${updated?` · ${updated} player update${updated>1?'s':''}`:''}`;
    window.dispatchEvent(new CustomEvent('tracker:live-fast-refresh',{detail:{updated,games:feeds.size}}));
    return true;
  }

  btn.addEventListener('click',async event=>{
    event.preventDefault();event.stopImmediatePropagation();
    if(refreshing)return;
    refreshing=true;btn.disabled=true;btn.setAttribute('aria-busy','true');
    if(lastUpdate)lastUpdate.textContent='正在向 MLB 更新已確認的 LIVE game…';
    try{await refreshKnownGames({quiet:false});}
    catch(error){console.warn(error);if(lastUpdate)lastUpdate.textContent=`WAITING FOR MLB · ${error.message} · 保留最後 verified data`;}
    finally{refreshing=false;btn.disabled=false;btn.removeAttribute('aria-busy');}
  },true);

  function start(){clearInterval(timer);timer=setInterval(()=>{if(!document.hidden&&knownGameIds().length)refreshKnownGames({quiet:true}).catch(()=>{});},LIVE_MS);}
  document.addEventListener('visibilitychange',()=>{if(!document.hidden&&knownGameIds().length)refreshKnownGames({quiet:true}).catch(()=>{});});
  start();
  window.addEventListener('pagehide',()=>clearInterval(timer),{once:true});
})();
