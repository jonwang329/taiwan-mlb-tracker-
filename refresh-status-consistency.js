(()=>{
  const lastUpdate=document.querySelector('#last-update');
  if(!lastUpdate)return;
  const formatTime=ts=>new Intl.DateTimeFormat('zh-TW',{timeZone:'Asia/Taipei',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(ts));
  const finishConfirmation=()=>{
    if(typeof initialConfirmationPending!=='undefined')initialConfirmationPending=false;
    if(typeof paint==='function'&&typeof lastResults!=='undefined'&&Array.isArray(lastResults)&&lastResults.length){
      paint(lastResults,`資料已更新 · ${formatTime(Date.now())}`);
      return;
    }
    lastUpdate.textContent=`資料已更新 · ${formatTime(Date.now())}`;
  };
  // Normal terminal state: one successful official schedule response is enough.
  window.addEventListener('tracker:gameday-universe',event=>{
    if(Number(event.detail?.scheduleSuccesses||0)===0)return;
    queueMicrotask(finishConfirmation);
  });
  // Mobile/Safari can restore the last-good snapshot before or after the Gameday event.
  // Never let a valid dashboard stay overwritten by "正在確認" indefinitely.
  setTimeout(()=>{
    const pending=lastUpdate.textContent.includes('確認')||[...document.querySelectorAll('.summary-today')].some(node=>node.textContent.includes('確認'));
    if(pending)finishConfirmation();
  },15000);
})();