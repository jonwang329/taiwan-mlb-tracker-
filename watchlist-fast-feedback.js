(()=>{
  const original=window.applyTrackedPlayers;
  if(typeof original!=='function')return;
  window.applyTrackedPlayers=list=>{
    if(!Array.isArray(list)||!list.length)return Promise.reject(new Error('觀察名單格式錯誤'));
    window.trackedPlayers=list;
    document.dispatchEvent(new CustomEvent('tracker:players-loaded',{detail:list}));
    Promise.resolve().then(()=>original(list)).catch(error=>console.warn('[watchlist] background stats refresh failed after list update',error));
    return Promise.resolve(list);
  };
})();
