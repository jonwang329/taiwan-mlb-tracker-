(()=>{
  const TARGETS=new Set([701678,678906]);
  const num=v=>Number(v||0);
  const pct=(n,d)=>d?num(n)/num(d)*100:null;
  const fmt=(v,d=1)=>Number.isFinite(v)?v.toFixed(d):'—';
  const mlbAverage=()=>{
    const leagues=window.LEAGUE_BENCHMARKS?.leagues||{};
    const al=leagues['103'],nl=leagues['104'];
    if(!al||!nl)return null;
    const mean=key=>{
      const values=[Number(al[key]),Number(nl[key])].filter(Number.isFinite);
      return values.length?values.reduce((a,b)=>a+b,0)/values.length:null;
    };
    const k=mean('hitterKPct'),bb=mean('hitterBBPct');
    return {
      avg:mean('avg'),
      hitterKPct:k,
      hitterBBPct:bb,
      hitterBBK:Number.isFinite(k)&&k>0&&Number.isFinite(bb)?bb/k:null,
      era:mean('era'),
      whip:mean('whip'),
      pitcherKPct:mean('pitcherKPct'),
      pitcherBBPct:mean('pitcherBBPct')
    };
  };
  const mlbSeason=result=>result?.levels?.find(level=>level?.level==='MLB'&&level?.season)?.season||result?.season||{};
  const compare=(value,base,higherBetter=true)=>{
    if(!Number.isFinite(value)||!Number.isFinite(base)||base===0)return {gap:'—',tone:'neutral'};
    const delta=(value-base)/base*100;
    const better=higherBetter?delta>0:delta<0;
    return {gap:`${delta>0?'+':''}${delta.toFixed(0)}%`,tone:Math.abs(delta)<2?'neutral':better?'better':'worse'};
  };
  const metric=(label,value,base,higherBetter,display,baseDisplay)=>{
    const result=compare(value,base,higherBetter);
    return `<div class="critical-compare-metric ${result.tone}"><span>${label}</span><strong>${display}</strong><small>MLB ${baseDisplay} · ${result.gap}</small></div>`;
  };
  function render(){
    const baseline=mlbAverage();
    if(!baseline||typeof players==='undefined'||typeof lastResults==='undefined')return;
    players.forEach((player,index)=>{
      if(!TARGETS.has(Number(player.id)))return;
      const card=document.getElementById(`player-${player.id}`);
      const result=lastResults[index];
      if(!card||!result)return;
      card.querySelector('.critical-mlb-compare')?.remove();
      const s=mlbSeason(result);
      let metrics='';
      if(Number(player.id)===701678){
        const k=pct(s.strikeOuts,s.plateAppearances),bb=pct(s.baseOnBalls,s.plateAppearances),bbk=num(s.strikeOuts)>0?num(s.baseOnBalls)/num(s.strikeOuts):null;
        metrics=[
          metric('AVG',Number(s.avg),baseline.avg,true,s.avg??'—',baseline.avg?.toFixed(3).replace(/^0/,'')),
          metric('K%',k,baseline.hitterKPct,false,`${fmt(k)}%`,`${fmt(baseline.hitterKPct)}%`),
          metric('BB%',bb,baseline.hitterBBPct,true,`${fmt(bb)}%`,`${fmt(baseline.hitterBBPct)}%`),
          metric('BB/K',bbk,baseline.hitterBBK,true,fmt(bbk,2),fmt(baseline.hitterBBK,2))
        ].join('');
      }else{
        const k=pct(s.strikeOuts,s.battersFaced),bb=pct(s.baseOnBalls,s.battersFaced);
        metrics=[
          metric('ERA',Number(s.era),baseline.era,false,s.era??'—',fmt(baseline.era,2)),
          metric('WHIP',Number(s.whip),baseline.whip,false,s.whip??'—',fmt(baseline.whip,2)),
          metric('K%',k,baseline.pitcherKPct,true,`${fmt(k)}%`,`${fmt(baseline.pitcherKPct)}%`),
          metric('BB%',bb,baseline.pitcherBBPct,false,`${fmt(bb)}%`,`${fmt(baseline.pitcherBBPct)}%`)
        ].join('');
      }
      const section=document.createElement('section');
      section.className='critical-mlb-compare';
      section.innerHTML=`<div class="subhead"><h4>MLB 全聯盟比較</h4><span>VS MLB · 2026</span></div><div class="critical-compare-grid">${metrics}</div><p>只針對目前大聯盟名單關鍵期的李灝宇與鄧愷威顯示；正負號代表相對 MLB 全聯盟平均的差距，不是排名。</p>`;
      const seasonSection=card.querySelector('.season-stats');
      if(seasonSection)seasonSection.insertAdjacentElement('afterend',section);else card.appendChild(section);
    });
  }
  let timer;
  const schedule=()=>{clearTimeout(timer);timer=setTimeout(render,80)};
  document.addEventListener('tracker:players-loaded',schedule);
  window.addEventListener('tracker:authoritative-live-refresh',schedule);
  window.addEventListener('tracker:live-fast-refresh',schedule);
  window.addEventListener('tracker:league-benchmarks-loaded',schedule);
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',schedule);else schedule();
})();