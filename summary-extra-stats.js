(()=>{
  const num=v=>Number(v||0);
  const pctNumber=(n,d)=>d!=null&&num(d)>0?(num(n)/num(d)*100).toFixed(1):'—';
  function dataPairs(){
    if(typeof players==='undefined'||typeof lastResults==='undefined'||!Array.isArray(players)||!Array.isArray(lastResults))return [];
    return players.map((player,index)=>({player,result:lastResults[index]}));
  }
  function addTodayEvent(row,pair,pitching){
    if(pitching)return;
    const gameStat=pair.result?.today?.stat||{};
    const sb=num(gameStat.stolenBases);
    const cs=num(gameStat.caughtStealing);
    if(!sb&&!cs)return;
    const today=row.querySelector('.summary-today');
    if(!today)return;
    let text=today.textContent||'';
    if(sb&&!/\bSB\b/.test(text))text+=` · ${sb} SB`;
    if(cs&&!/\bCS\b/.test(text))text+=` · ${cs} CS`;
    today.textContent=text.replace(/^\s+|\s+$/g,'');
  }
  function seasonRates(pitching,seasonStat){
    const denominator=pitching?seasonStat.battersFaced:seasonStat.plateAppearances;
    return [
      ['K%',pctNumber(seasonStat.strikeOuts,denominator)],
      ['BB%',pctNumber(seasonStat.baseOnBalls,denominator)]
    ];
  }
  function currentLeagueId(result){
    return result?.today?.league?.id||result?.latest?.league?.id||result?.games?.[0]?.league?.id||null;
  }
  function leagueContext(pair,pitching){
    const leagueId=currentLeagueId(pair.result);
    const benchmark=leagueId&&window.LEAGUE_BENCHMARKS?.leagues?.[String(leagueId)];
    if(!benchmark||num(benchmark.teams)<2)return null;
    const season=pair.result?.season||{};
    const playerValue=Number(pitching?season.era:season.avg);
    const leagueValue=Number(pitching?benchmark.era:benchmark.avg);
    if(!Number.isFinite(playerValue)||!Number.isFinite(leagueValue)||leagueValue<=0)return null;
    const advantage=pitching?(leagueValue-playerValue)/leagueValue:(playerValue-leagueValue)/leagueValue;
    const magnitude=Math.abs(advantage)*100;
    let text='≈ LG';
    if(magnitude>=2)text=`${advantage>0?'+':'-'}${Math.round(magnitude)}% vs LG`;
    return {text,leagueName:benchmark.leagueName||'league',leagueValue};
  }
  function addLeagueContext(row,pair,pitching){
    row.querySelectorAll('.league-context').forEach(el=>el.remove());
    const context=leagueContext(pair,pitching);
    if(!context)return;
    const primary=row.querySelector('.summary-stat:not(.summary-extra-stat)');
    if(!primary)return;
    const note=document.createElement('em');
    note.className='league-context';
    note.textContent=context.text;
    note.title=`${context.leagueName} average: ${pitching?context.leagueValue.toFixed(2):context.leagueValue.toFixed(3)}`;
    primary.appendChild(note);
  }
  function sync(){
    const pairs=dataPairs();
    if(!pairs.length)return;
    const byId=new Map(pairs.map(x=>[Number(x.player.id),x]));
    document.querySelectorAll('.summary-group.hitting,.summary-group.pitching').forEach(group=>{
      const pitching=group.classList.contains('pitching');
      group.classList.add('with-extra-stats');
      const extraLabels=['K%','BB%'];
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
        addTodayEvent(row,pair,pitching);
        const seasonStat=pair.result?.season||{};
        const values=seasonRates(pitching,seasonStat);
        const arrow=row.querySelector(':scope > i');
        values.forEach(([label,value])=>{
          const span=document.createElement('span');
          span.className='summary-stat summary-extra-stat';
          span.innerHTML=`<small>${label}</small><b>${value}</b>`;
          row.insertBefore(span,arrow||null);
        });
        addLeagueContext(row,pair,pitching);
      });
    });
  }
  let timer;
  const schedule=()=>{clearTimeout(timer);timer=setTimeout(sync,60)};
  document.addEventListener('tracker:players-loaded',schedule);
  window.addEventListener('tracker:authoritative-live-refresh',schedule);
  window.addEventListener('tracker:live-fast-refresh',schedule);
  window.addEventListener('tracker:league-benchmarks-loaded',schedule);
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',schedule);else schedule();
})();
