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

  document.addEventListener('tracker:players-loaded',event=>{
    if(!pending)return;
    const list=Array.isArray(event.detail)?event.detail:(window.trackedPlayers||[]);
    const present=list.some(player=>Number(player.id)===pending.id);
    const completed=pending.action==='add'?present:!present;
    if(!completed)return;

    pending=null;
    if(modal&&!modal.hidden){
      modal.hidden=true;
      document.body.classList.remove('modal-open');
    }
    // Do not force an immediate reload here. Cloudflare KV can briefly serve
    // a stale edge read right after a successful write, which can make the
    // just-added player disappear. The POST /players response is authoritative
    // for this interaction and applyWatchlist already updates the UI immediately.
  });

  window.addEventListener('pageshow',()=>{pending=null;});
})();
