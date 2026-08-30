(()=>{
  const lastUpdate=document.querySelector('#last-update');
  if(!lastUpdate)return;
  const formatTime=ts=>new Intl.DateTimeFormat('zh-TW',{timeZone:'Asia/Taipei',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(ts));
  window.addEventListener('tracker:gameday-universe',event=>{
    if(Number(event.detail?.scheduleSuccesses||0)===0)return;
    queueMicrotask(()=>{
      lastUpdate.textContent=`官方賽程已確認 · 球員資料保留最新完整快照 · ${formatTime(Date.now())}`;
    });
  });
})();