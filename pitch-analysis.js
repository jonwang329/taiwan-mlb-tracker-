(() => {
  const V11='https://statsapi.mlb.com/api/v1.1';
  const feedCache=new Map();
  const eligible=level=>level==='MLB'||level==='AAA';
  const finite=v=>Number.isFinite(Number(v));
  const fmt=(v,d=1)=>finite(v)?Number(v).toFixed(d):'—';
  const esc=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const detailRoot=document.querySelector('#player-details');
  let renderToken=0;
  let renderTimer=null;

  function levelFor(result){
    try{if(typeof currentLevel==='function')return currentLevel(result)}catch(_){}
    return result?.latest?.level||result?.levels?.find(x=>x.season)?.level||'—';
  }

  function gameFor(result,level){
    if(result?.today?.game?.gamePk&&result.today.level===level)return{gamePk:result.today.game.gamePk,date:result.today.date,live:Boolean(result.today.live)};
    const same=(result?.games||[]).find(g=>g?.game?.gamePk&&g.level===level);
    const fallback=same||(result?.games||[]).find(g=>g?.game?.gamePk);
    return fallback?{gamePk:fallback.game.gamePk,date:fallback.date,live:false}:null;
  }

  async function fetchFeed(gamePk){
    if(feedCache.has(gamePk))return feedCache.get(gamePk);
    const task=fetch(`${V11}/game/${gamePk}/feed/live?_=${Date.now()}`,{cache:'no-store',headers:{Accept:'application/json','Cache-Control':'no-cache'}})
      .then(r=>{if(!r.ok)throw new Error(`MLB game feed ${r.status}`);return r.json()})
      .catch(error=>{feedCache.delete(gamePk);throw error});
    feedCache.set(gamePk,task);return task;
  }

  function normalizePitch(event,sequence,pa){
    const pd=event?.pitchData||{},coordinates=pd.coordinates||{},hitData=event?.hitData||null,description=event?.details?.description||'';
    const contact=Boolean(hitData)||Boolean(event?.details?.isInPlay)||/foul|in play/i.test(description);
    return{
      pa,sequence,pitchNumber:event?.pitchNumber??sequence,
      type:event?.details?.type?.description||event?.details?.type?.code||'Pitch',
      description,speed:pd.startSpeed??null,pX:coordinates.pX??null,pZ:coordinates.pZ??null,
      szTop:pd.strikeZoneTop??null,szBottom:pd.strikeZoneBottom??null,
      balls:event?.count?.balls??null,strikes:event?.count?.strikes??null,contact,
      inPlay:Boolean(event?.details?.isInPlay)||Boolean(hitData),
      hit:hitData?{exitVelocity:hitData.launchSpeed??null,launchAngle:hitData.launchAngle??null,distance:hitData.totalDistance??null,trajectory:hitData.trajectory||''}:null
    };
  }

  function plateAppearances(feed,playerId){
    return(feed?.liveData?.plays?.allPlays||[])
      .filter(pa=>Number(pa?.matchup?.batter?.id)===Number(playerId))
      .map((pa,index)=>({
        pa:index+1,inning:pa?.about?.inning??'—',half:pa?.about?.halfInning||'',result:pa?.result?.event||pa?.result?.description||'—',pitcher:pa?.matchup?.pitcher?.fullName||'—',
        pitches:(pa?.playEvents||[]).filter(e=>e?.isPitch).map((e,i)=>normalizePitch(e,i+1,index+1))
      }));
  }

  const allPitches=pas=>pas.flatMap(pa=>pa.pitches.map(p=>({...p,inning:pa.inning,half:pa.half,result:pa.result,pitcher:pa.pitcher})));

  function zoneBounds(pitches){
    const tops=pitches.map(p=>Number(p.szTop)).filter(Number.isFinite),bottoms=pitches.map(p=>Number(p.szBottom)).filter(Number.isFinite);
    const avg=v=>v.length?v.reduce((a,b)=>a+b,0)/v.length:null;
    return{top:avg(tops)??3.5,bottom:avg(bottoms)??1.5};
  }

  function factualSummary(pas){
    const pitches=allPitches(pas),contacts=pitches.filter(p=>p.contact),inPlay=pitches.filter(p=>p.inPlay),velos=pitches.map(p=>Number(p.speed)).filter(Number.isFinite);
    const evs=inPlay.map(p=>Number(p.hit?.exitVelocity)).filter(Number.isFinite);
    const parts=[`本場 ${pas.length} PA、看了 ${pitches.length} 球`,`有接觸 ${contacts.length} 球`,`打進場內 ${inPlay.length} 球`];
    if(velos.length)parts.push(`遇到最快 ${Math.max(...velos).toFixed(1)} mph`);
    if(evs.length)parts.push(`最高擊球初速 ${Math.max(...evs).toFixed(1)} mph`);
    return parts.join('；')+'。';
  }

  function mapSvg(pas){
    const pitches=allPitches(pas).filter(p=>finite(p.pX)&&finite(p.pZ));
    if(!pitches.length)return'<div class="pitch-map unavailable">本場沒有可用的投球位置座標</div>';
    const bounds=zoneBounds(pitches),w=210,h=230,left=18,right=192,top=12,bottom=216,xMin=-1.5,xMax=1.5,zMin=.5,zMax=4.5;
    const sx=x=>left+(Number(x)-xMin)/(xMax-xMin)*(right-left),sy=z=>bottom-(Number(z)-zMin)/(zMax-zMin)*(bottom-top);
    const zx1=sx(-.83),zx2=sx(.83),zy1=sy(bounds.top),zy2=sy(bounds.bottom);
    return`<div class="pitch-map"><svg viewBox="0 0 ${w} ${h}" role="img" aria-label="Strike zone 與本場投球位置">
      <rect class="zone-box" x="${zx1}" y="${zy1}" width="${zx2-zx1}" height="${zy2-zy1}"></rect>
      <line class="zone-grid" x1="${zx1+(zx2-zx1)/3}" y1="${zy1}" x2="${zx1+(zx2-zx1)/3}" y2="${zy2}"></line>
      <line class="zone-grid" x1="${zx1+2*(zx2-zx1)/3}" y1="${zy1}" x2="${zx1+2*(zx2-zx1)/3}" y2="${zy2}"></line>
      <line class="zone-grid" x1="${zx1}" y1="${zy1+(zy2-zy1)/3}" x2="${zx2}" y2="${zy1+(zy2-zy1)/3}"></line>
      <line class="zone-grid" x1="${zx1}" y1="${zy1+2*(zy2-zy1)/3}" x2="${zx2}" y2="${zy1+2*(zy2-zy1)/3}"></line>
      ${pitches.map((p,i)=>`<g class="pitch-point ${p.inPlay?'inplay':p.contact?'contact':'normal'}"><circle cx="${sx(p.pX)}" cy="${sy(p.pZ)}" r="${p.contact?9:7}"></circle><text x="${sx(p.pX)}" y="${sy(p.pZ)+3}" text-anchor="middle">${i+1}</text><title>${i+1}. ${esc(p.type)} ${finite(p.speed)?`${fmt(p.speed)} mph`:''} ${esc(p.description)}</title></g>`).join('')}
    </svg><div class="pitch-map-legend"><span><i class="normal"></i>一般投球</span><span><i class="contact"></i>有接觸</span><span><i class="inplay"></i>打進場內</span></div></div>`;
  }

  function contactTable(pas){
    const contacts=allPitches(pas).filter(p=>p.contact);
    if(!contacts.length)return'<p class="pitch-empty">這場沒有記錄到打者碰到球的投球。</p>';
    return`<div class="contact-table"><div class="contact-row contact-head"><span>PA</span><span>球種</span><span>球速</span><span>Count</span><span>位置</span><span>打擊結果</span></div>${contacts.map(p=>{
      const half=p.half==='top'?'上':p.half==='bottom'?'下':'';
      const hit=[];
      if(p.hit&&finite(p.hit.exitVelocity))hit.push(`EV ${fmt(p.hit.exitVelocity)} mph`);
      if(p.hit&&finite(p.hit.launchAngle))hit.push(`LA ${fmt(p.hit.launchAngle,0)}°`);
      if(p.hit&&finite(p.hit.distance))hit.push(`${fmt(p.hit.distance,0)} ft`);
      if(p.hit?.trajectory)hit.push(esc(p.hit.trajectory.replaceAll('_',' ')));
      const detail=hit.length?`<small>${hit.join(' · ')}</small>`:'';
      return`<div class="contact-row"><span><b>${p.inning}局${half} · ${p.pa}</b><small>#${p.pitchNumber}</small></span><span><b>${esc(p.type)}</b><small>vs ${esc(p.pitcher)}</small></span><span>${finite(p.speed)?`${fmt(p.speed)} mph`:'—'}</span><span>${p.balls??'—'}-${p.strikes??'—'}</span><span>${finite(p.pX)&&finite(p.pZ)?`x ${fmt(p.pX,2)} · z ${fmt(p.pZ,2)}`:'—'}</span><span><b>${esc(p.description||p.result)}</b>${detail}</span></div>`;
    }).join('')}</div>`;
  }

  function sectionHtml(result,game,pas){
    const pitches=allPitches(pas),contacts=pitches.filter(p=>p.contact),inPlay=pitches.filter(p=>p.inPlay),date=game?.date?String(game.date).slice(0,10):'最近一場';
    const savant=`https://baseballsavant.mlb.com/gamefeed?gamePk=${encodeURIComponent(game.gamePk)}`,gameday=`https://www.mlb.com/gameday/${encodeURIComponent(game.gamePk)}/`;
    return`<section class="pitch-analysis" data-game-pk="${game.gamePk}"><div class="pitch-analysis-head"><div><span>STRIKE ZONE + CONTACT · ${esc(levelFor(result))}</span><h4>逐球打擊圖</h4><p>${esc(date)}${game.live?' · LIVE':''}</p></div><div class="pitch-source-links"><a href="${gameday}" target="_blank" rel="noopener">MLB Gameday ↗</a><a href="${savant}" target="_blank" rel="noopener">Savant ↗</a></div></div>
      <div class="pitch-kpis"><div><span>PA</span><b>${pas.length}</b></div><div><span>看球數</span><b>${pitches.length}</b></div><div><span>碰到球</span><b>${contacts.length}</b></div><div><span>打進場內</span><b>${inPlay.length}</b></div></div>
      <div class="pitch-readout"><b>本場客觀摘要</b><p>${esc(factualSummary(pas))}</p></div>
      <div class="pitch-analysis-grid">${mapSvg(pas)}<div><div class="contact-title"><b>被打到的球</b><span>只列有接觸的投球</span></div>${contactTable(pas)}</div></div>
      <p class="pitch-method-note">只呈現 MLB / Triple-A 官方逐球可取得的球種、球速、位置與擊球資料；不判定「失投」，也暫不做 AI 配球分析。</p></section>`;
  }

  function statusHtml(level,game,message){return`<section class="pitch-analysis pitch-status"><div class="pitch-analysis-head"><div><span>STRIKE ZONE + CONTACT · ${esc(level)}</span><h4>逐球打擊圖</h4></div></div><p>${esc(message)}</p>${game?.gamePk?`<a href="https://baseballsavant.mlb.com/gamefeed?gamePk=${encodeURIComponent(game.gamePk)}" target="_blank" rel="noopener">查看 Baseball Savant 官方 Gamefeed ↗</a>`:''}</section>`}

  function mount(detail,html){
    detail.querySelector('.pitch-analysis')?.remove();
    const anchor=detail.querySelector('.today-detail');
    if(anchor)anchor.insertAdjacentHTML('afterend',html);else detail.insertAdjacentHTML('beforeend',html);
  }

  async function renderOne(player,result,token){
    const detail=document.querySelector(`#player-${player.id}`);if(!detail||player.group!=='hitting'||token!==renderToken)return;
    const level=levelFor(result);if(!eligible(level))return;
    const game=gameFor(result,level);if(!game?.gamePk){mount(detail,statusHtml(level,null,'目前找不到 MLB / Triple-A 可分析的最近一場 gamePk。'));return}
    mount(detail,statusHtml(level,game,'正在讀取官方逐球資料…'));
    try{
      const feed=await fetchFeed(game.gamePk);if(token!==renderToken)return;
      const currentDetail=document.querySelector(`#player-${player.id}`);if(!currentDetail)return;
      const pas=plateAppearances(feed,player.id);
      mount(currentDetail,pas.length?sectionHtml(result,game,pas):statusHtml(level,game,'官方 game feed 已取得，但這場沒有找到此打者的逐球打席資料。'));
    }catch(error){
      console.warn('Pitch analysis unavailable',player.name,game.gamePk,error);if(token!==renderToken)return;
      const currentDetail=document.querySelector(`#player-${player.id}`);if(currentDetail)mount(currentDetail,statusHtml(level,game,'逐球資料目前暫時無法讀取；主站 box score 與 season 資料不受影響。'));
    }
  }

  function primaryRefreshBusy(){
    const text=document.querySelector('#last-update')?.textContent||'';
    return text.includes('正在向 MLB')||text.includes('正在讀取 MLB');
  }

  async function renderPitchAnalysis(){
    const token=++renderToken;
    if(primaryRefreshBusy()){
      scheduleRender(180);
      return;
    }
    if(typeof players==='undefined'||typeof lastResults==='undefined')return;
    const sourcePlayers=Array.isArray(players)?[...players]:[];
    const sourceResults=Array.isArray(lastResults)?[...lastResults]:[];
    const jobs=sourcePlayers.map((player,i)=>({player,result:sourceResults[i]})).filter(x=>x.result&&x.player?.group==='hitting'&&eligible(levelFor(x.result)));
    for(const job of jobs){if(token!==renderToken)return;await renderOne(job.player,job.result,token)}
  }

  function scheduleRender(delay=80){
    clearTimeout(renderTimer);
    renderTimer=setTimeout(()=>renderPitchAnalysis().catch(()=>{}),delay);
  }

  document.addEventListener('tracker:players-loaded',()=>scheduleRender(120));
  if(detailRoot)new MutationObserver(mutations=>{
    if(mutations.some(m=>m.target===detailRoot))scheduleRender(140);
  }).observe(detailRoot,{childList:true});
  window.addEventListener('pageshow',()=>scheduleRender(220),{once:true});
  scheduleRender(220);
})();
