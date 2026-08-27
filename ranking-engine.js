(()=>{
  const number=value=>{
    if(value==null||value==='')return null;
    const parsed=Number(value);
    return Number.isFinite(parsed)?parsed:null;
  };

  const METRICS={
    AVG:{group:'hitting',direction:'desc',read:r=>number(r?.season?.avg)},
    OPS:{group:'hitting',direction:'desc',read:r=>number(r?.season?.ops)},
    HR:{group:'hitting',direction:'desc',read:r=>number(r?.season?.homeRuns)},
    RBI:{group:'hitting',direction:'desc',read:r=>number(r?.season?.rbi)},
    'K%':{group:'hitting',direction:'asc',read:r=>{
      const so=number(r?.season?.strikeOuts),pa=number(r?.season?.plateAppearances);
      return so!=null&&pa>0?so/pa:null;
    }},
    'BB%':{group:'hitting',direction:'desc',read:r=>{
      const bb=number(r?.season?.baseOnBalls),pa=number(r?.season?.plateAppearances);
      return bb!=null&&pa>0?bb/pa:null;
    }},
    ERA:{group:'pitching',direction:'asc',read:r=>number(r?.season?.era)},
    WHIP:{group:'pitching',direction:'asc',read:r=>number(r?.season?.whip)},
    'K/9':{group:'pitching',direction:'desc',read:r=>number(r?.season?.strikeoutsPer9Inn)},
    'BB/9':{group:'pitching',direction:'asc',read:r=>number(r?.season?.walksPer9Inn)}
  };

  function rank(players=[],results=[],metric){
    const spec=METRICS[metric];
    if(!spec)return [];
    return players.map((player,index)=>({player,result:results[index],value:spec.read(results[index])}))
      .filter(row=>row.player?.group===spec.group&&row.value!=null)
      .sort((a,b)=>spec.direction==='asc'?a.value-b.value:b.value-a.value)
      .map((row,index)=>({...row,rank:index+1}));
  }

  window.TaiwanMlbRanking={metrics:Object.keys(METRICS),rank};
})();
