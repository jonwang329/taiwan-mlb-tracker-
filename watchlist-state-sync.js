(()=>{
  const modal=document.querySelector('#watchlist-modal');
  let pending=null;

  document.addEventListener('click',event=>{
    const button=event.target.closest('[data-watch-action]');
    if(!button)return;
    const action=button.dataset.watchAction;
    const id=Number(button.dataset.playerId||0);
    if(!id||!['add','remove'].includes(action))return;
    pending={action,id,startedAt:Date.now()};
  },true);

  async function waitForAuthoritativeList(action,id){
    const base=String(window.OBSERVATION_API_URL||'').replace(/\/$/,'');
    if(!base)return;
    for(let attempt=0;attempt<6;attempt++){
      try{
        const r=await fetch(`${base}/players?_=${Date.now()}`,{cache:'no-store',headers:{Accept:'application/json','Cache-Control':'no-cache'}});
        if(r.ok){
          const payload=await r.json();
          const list=Array.isArray(payload)?payload:payload.players;
          if(Array.isArray(list)){
            const present=list.some(player=>Number(player.id)===id);
            const confirmed=action==='add'?present:!present;
            if(confirmed){
              window.trackedPlayers=list;
              window.location.reload();
              return;
            }
          }
        }
      }catch(error){console.warn('[watchlist] authoritative read retry failed',error);}
      await new Promise(resolve=>setTimeout(resolve,700));
    }
  }

  document.addEventListener('tracker:players-loaded',event=>{
    if(!pending)return;
    const list=Array.isArray(event.detail)?event.detail:(window.trackedPlayers||[]);
    const present=list.some(player=>Number(player.id)===pending.id);
    const completed=pending.action==='add'?present:!present;
    if(!completed)return;

    const completedMutation=pending;
    pending=null;
    if(modal&&!modal.hidden){
      modal.hidden=true;
      document.body.classList.remove('modal-open');
    }
    // The POST response updates the UI immediately. Then wait until a fresh
    // Cloudflare read confirms the same mutation before reloading the dashboard.
    // This avoids both stale-KV reloads and app.js falling back to lastPlayers.
    waitForAuthoritativeList(completedMutation.action,completedMutation.id);
  });

  window.addEventListener('pageshow',()=>{pending=null;});
})();
