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
    const hits=num(gameStat.hits);
    const hr=num(gameStat.homeRuns);
    const bb=num(gameStat.baseOnBalls);
    const k=num(gameStat.strikeOuts);
    const sb=num(gameStat.stolenBases);
    const cs=num(gameStat.caughtStealing);
    const today=row.querySelector('.summary-today');
    if(!today)return;
    let text=today.textContent||'';
    if(bb&&!/\bBB\b/.test(text))text+=` · ${bb} BB`;
    if(k&&!/\bK\b/.test(text))text+=` · ${k} K`;
    if(sb&&!/\bSB\b/.test(text))text+=` · ${sb} SB`;
    if(cs&&!/\bCS\b/.test(text))text+=` · ${cs} CS`;
    today.textContent=text.replace(/^\s+|\s+$/g,'');
    today.classList.toggle('today-positive',hr>0||hits>=2||bb>=2||sb>0);
    today.classList.toggle('today-warning',k>=2);
    today.dataset.todayHits=String(hits);
    today.dataset.todayHr=String(hr);
    today.dataset.todayK=String(k);
  }
  function seasonRates(pitching,seasonStat){
    const denominator=pitching?seasonStat.battersFaced:seasonStat.plateAppearances;
    return [
      ['K%',pctNumber(seasonStat.strikeOuts,denominator)],
      ['BB%',pctNumber(seasonStat.baseOnBalls,denominator)]
    ];
  }
  function sameSeasonStat(a={},b={},pitching=false){
    if(pitching){
      return String(a.era??'')===String(b.era??'')&&String(a.inningsPitched??'')===String(b.inningsPitched??'')&&num(a.gamesPitched)===num(b.gamesPitched);
    }
    return String(a.avg??'')===String(b.avg??'')&&num(a.plateAppearances)===num(b.plateAppearances)&&num(a.gamesPlayed)===num(b.gamesPlayed);
  }
  function activeLevel(result,pitching){
    const season=result?.season||{};
    const levels=Array.isArray(result?.levels)?result.levels:[];
    const matched=levels.find(level=>level?.season&&sameSeasonStat(level.season,season,pitching));
    return matched?.level||result?.latest?.level||result?.games?.[0]?.level||null;
  }
  function currentLeagueId(result,pitching){
    const level=activeLevel(result,pitching);
    const games=Array.isArray(result?.games)?result.games:[];
    const sameLevelGames=level?games.filter(game=>game?.level===level&&game?.league?.id):[];
    if(sameLevelGames.length)return sameLevelGames[0].league.id;
    return result?.today?.league?.id||result?.latest?.league?.id||games.find(game=>game?.league?.id)?.league?.id||null;
  }
  function leagueContext(pair,pitching){
    const leagueId=currentLeagueId(pair.result,pitching);
    const benchmark=leagueId&&window.LEAGUE_BENCHMARKS?.leagues?.[String(leagueId)];
    if(!benchmark||num(benchmark.teams)<2)return null;
    const season=pair.result?.season||{};
    const playerValue=Number(pitching?season.era:season.avg);
    const leagueValue=Number(pitching?benchmark.era:benchmark.avg);
    if(!Number.isFinite(playerValue)||!Number.isFinite(leagueValue)||leagueValue<=0)return null;
    const advantage=pitching?(leagueValue-playerValue)/leagueValue:(playerValue-leagueValue)/leagueValue;
    return {text:`${advantage>0?'+':''}${Math.round(advantage*100)}%`,leagueName:benchmark.leagueName||'league',leagueValue,leagueId};
  }
  function benchmarkDate(){
    const stamp=window.LEAGUE_BENCHMARKS?.generatedAt;
    if(!stamp)return '';
    const d=new Date(stamp);
    if(Number.isNaN(d.getTime()))return '';
    return new Intl.DateTimeFormat('zh-TW',{timeZone:'Asia/Taipei',month:'numeric',day:'numeric'}).format(d);
  }
  function removeLegacyLeagueNotes(primary){
    if(!primary)return;
    primary.querySelectorAll('.league-context,.rate-league-context,.league-gap').forEach(el=>el.remove());
    [...primary.childNodes].forEach(node=>{
      if(node.nodeType!==Node.TEXT_NODE)return;
      if(/vs\s*LG|·\s*LG|≈\s*LG/i.test(node.textContent||''))node.remove();
    });
    [...primary.children].forEach(el=>{
      if(el.matches('small,b'))return;
      const text=(el.textContent||'').trim();
      if(/vs\s*LG|·\s*LG|≈\s*LG/i.test(text))el.remove();
    });
  }
  function addLeagueContext(row,pair,pitching){
    const primary=row.querySelector('.summary-stat:not(.summary-extra-stat)');
    if(!primary)return;
    removeLegacyLeagueNotes(primary);
    const context=leagueContext(pair,pitching);
    const note=document.createElement('em');
    note.className='league-context league-gap';
    note.textContent=context?.text||'—';
    if(context){
      note.title=`${context.leagueName} average: ${pitching?context.leagueValue.toFixed(2):context.leagueValue.toFixed(3)}`;
      note.dataset.leagueId=String(context.leagueId);
    }
    primary.appendChild(note);
  }
  function addLeagueKey(group){
    const header=group.querySelector(':scope > header');
    if(!header)return;
    header.querySelector('h3 .league-key')?.remove();
    let key=header.querySelector(':scope > .league-key');
    if(!key){
      key=document.createElement('small');
      key.className='league-key';
      header.appendChild(key);
    }
    const date=benchmarkDate();
    key.textContent=`LG%＝vs 球員所屬聯盟平均${date?` · ${date}`:''}`;
  }
  function sync(){
    const pairs=dataPairs();
    if(!pairs.length)return;
    const byId=new Map(pairs.map(x=>[Number(x.player.id),x]));
    document.querySelectorAll('.summary-group.hitting,.summary-group.pitching').forEach(group=>{
      const pitching=group.classList.contains('pitching');
      group.classList.add('with-extra-stats');
      addLeagueKey(group);
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
