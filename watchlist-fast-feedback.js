(()=>{
  const original=window.applyTrackedPlayers;
  if(typeof original!=='function')return;

  function names(player){
    const parts=String(player?.name||'Unknown player').split(' ');
    return {zh:parts.shift()||'—',en:parts.join(' ')||'—'};
  }

  function showOptimisticPlayers(list){
    const summary=document.querySelector('#player-summary');
    if(!summary)return;
    const renderedIds=new Set([...summary.querySelectorAll('[href^="#player-"]')].map(link=>Number(String(link.getAttribute('href')||'').replace('#player-',''))).filter(Boolean));
    for(const player of list){
      const id=Number(player?.id);
      if(!id||renderedIds.has(id))continue;
      const group=player.group==='hitting'?'hitting':'pitching';
      const section=summary.querySelector(`.summary-group.${group}`);
      if(!section)continue;
      const n=names(player);
      const primary=group==='pitching'?'ERA':'AVG';
      const secondary=group==='pitching'?'WHIP':'OPS';
      const row=document.createElement('a');
      row.className='summary-row optimistic-player';
      row.href=`#player-${id}`;
      row.setAttribute('aria-label',`查看 ${player.name} 詳細資料`);
      row.innerHTML=`<span class="summary-player"><strong>${n.zh}</strong><small>${n.en}</small></span><span class="summary-club"><b>更新中</b><small>${player.org||'MLB / MiLB'}</small></span><span class="summary-today">資料更新中…</span><span class="summary-stat"><small>${primary}</small><b>—</b></span><span class="summary-stat"><small>${secondary}</small><b>—</b></span><i aria-hidden="true">›</i>`;
      section.appendChild(row);
      renderedIds.add(id);
    }
    const count=document.querySelector('#player-count');
    if(count)count.textContent=list.length;
    const lastUpdate=document.querySelector('#last-update');
    if(lastUpdate)lastUpdate.textContent='名單已更新 · 正在補 MLB / MiLB 成績…';
  }

  window.applyTrackedPlayers=list=>{
    if(!Array.isArray(list)||!list.length)return Promise.reject(new Error('觀察名單格式錯誤'));
    window.trackedPlayers=list;
    showOptimisticPlayers(list);
    document.dispatchEvent(new CustomEvent('tracker:players-loaded',{detail:list}));
    Promise.resolve().then(()=>original(list)).catch(error=>console.warn('[watchlist] background stats refresh failed after list update',error));
    return Promise.resolve(list);
  };
})();
