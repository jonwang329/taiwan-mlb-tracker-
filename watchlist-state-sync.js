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
    // Keep the successful POST response in the UI. An immediate reload can
    // re-read a briefly stale Cloudflare KV edge value and hide the new player.
  });

  window.addEventListener('pageshow',()=>{pending=null;});
})();
