(()=>{
  const num=v=>Number(v||0);
  function dataPairs(){
    if(typeof players==='undefined'||typeof lastResults==='undefined'||!Array.isArray(players)||!Array.isArray(lastResults))return [];
    return players.map((player,index)=>({player,result:lastResults[index]}));
  }
  function sync(){
    const pairs=dataPairs();
    if(!pairs.length)return;
    const byId=new Map(pairs.map(x=>[Number(x.player.id),x]));
    document.querySelectorAll('.summary-group.hitting,.summary-group.pitching').forEach(group=>{
      const pitching=group.classList.contains('pitching');
      group.classList.add('with-extra-stats');
      const extraLabels=pitching?['K/9','BB/9']:['BB','K'];
      const labels=group.querySelector('.column-labels');
      if(labels){
        while(labels.children.length>5)labels.lastElementChild.remove();
        if(labels.children.length===5)extraLabels.forEach(label=>{const node=document.createElement('span');node.textContent=label;labels.appendChild(node)});
      }
      group.querySelectorAll('.summary-row').forEach(row=>{
        const href=row.getAttribute('href')||'';
        const id=Number((href.match(/#player-(\d+)/)||[])[1]);
        const pair=byId.get(id); if(!pair)return;
        row.classList.add('with-extra-stats');
        row.querySelectorAll('.summary-extra-stat').forEach(el=>el.remove());
        const gameStat=pair.result?.today?.stat||{};
        const seasonStat=pair.result?.season||{};
        const values=pitching
          ? [['K/9',seasonStat.strikeoutsPer9Inn],['BB/9',seasonStat.walksPer9Inn]]
          : [['BB',num(gameStat.baseOnBalls)],['K',num(gameStat.strikeOuts)]];
        const arrow=row.querySelector(':scope > i');
        values.forEach(([label,value])=>{
          const span=document.createElement('span');
          span.className='summary-stat summary-extra-stat';
          span.innerHTML=`<small>${label}</small><b>${value??'—'}</b>`;
          row.insertBefore(span,arrow||null);
        });
      });
    });
  }
  let timer;
  const schedule=()=>{clearTimeout(timer);timer=setTimeout(sync,60)};
  document.addEventListener('tracker:players-loaded',schedule);
  window.addEventListener('tracker:authoritative-live-refresh',schedule);
  window.addEventListener('tracker:live-fast-refresh',schedule);
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',schedule);else schedule();
})();
