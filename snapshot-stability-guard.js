(()=>{
  const CACHE_KEY='taiwan-mlb-tracker:last-good:v2';
  const BAD_PLAYER=player=>{
    const name=String(player?.name||'').toLowerCase();
    const org=String(player?.org||'').toLowerCase();
    return name.includes('林昌勇') || ((name.includes('chang-yong')||name.includes('chang yo')||name.includes('chang-yo'))&&name.includes('lim')) || (name.includes('chang')&&name.includes('lim')&&org.includes('chicago cubs'));
  };
  const todayTaiwan=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  const hasAppearance=t=>Boolean(t&&(t.scheduled||t.onGame||t.live||Number(t.stat?.plateAppearances||0)>0||Number(t.stat?.atBats||0)>0||Number(t.stat?.battersFaced||0)>0||Number(t.stat?.pitchesThrown||0)>0));
  const strength=t=>{
    if(!t)return 0;
    if(t.onGame||t.live)return 4;
    if(Number(t.stat?.plateAppearances||0)>0||Number(t.stat?.atBats||0)>0||Number(t.stat?.battersFaced||0)>0||Number(t.stat?.pitchesThrown||0)>0)return 3;
    if(t.scheduled)return 2;
    return 1;
  };
  const sanitize=snapshot=>{
    if(!snapshot||!Array.isArray(snapshot.players)||!Array.isArray(snapshot.results))return snapshot;
    const pairs=snapshot.players.map((player,index)=>({player,result:snapshot.results[index]})).filter(({player})=>!BAD_PLAYER(player));
    return {...snapshot,players:pairs.map(x=>x.player),results:pairs.map(x=>x.result)};
  };
  const mergeLastGood=snapshot=>{
    snapshot=sanitize(snapshot);
    if(!snapshot?.players?.length||snapshot.players.length!==snapshot.results?.length)return snapshot;
    let local=null;
    try{local=sanitize(JSON.parse(localStorage.getItem(CACHE_KEY)||'null'));}catch(_error){}
    if(!local?.players?.length||local.players.length!==local.results?.length)return snapshot;
    const localById=new Map(local.players.map((player,index)=>[Number(player.id),local.results[index]]));
    const tw=todayTaiwan();
    const results=snapshot.results.map((result,index)=>{
      const previous=localById.get(Number(snapshot.players[index]?.id));
      const oldToday=previous?.today,newToday=result?.today;
      if(oldToday&&String(oldToday.date||'')===tw&&hasAppearance(oldToday)&&strength(oldToday)>strength(newToday))return {...result,today:oldToday};
      return result;
    });
    return {...snapshot,results};
  };

  if(window.CENTRAL_DASHBOARD_SNAPSHOT)window.CENTRAL_DASHBOARD_SNAPSHOT=mergeLastGood(window.CENTRAL_DASHBOARD_SNAPSHOT);

  const nativeFetch=window.fetch.bind(window);
  window.fetch=async(input,init)=>{
    const response=await nativeFetch(input,init);
    const url=String(typeof input==='string'?input:input?.url||'');
    if(url.includes('data/dashboard-snapshot.js')){
      try{
        const text=await response.clone().text();
        const match=text.match(/window\.CENTRAL_DASHBOARD_SNAPSHOT\s*=\s*(.*);\s*$/s);
        if(!match)return response;
        const snapshot=mergeLastGood(JSON.parse(match[1]));
        const body=`window.CENTRAL_DASHBOARD_SNAPSHOT=${JSON.stringify(snapshot)};`;
        return new Response(body,{status:response.status,statusText:response.statusText,headers:response.headers});
      }catch(error){console.warn('Central snapshot stability guard failed',error);return response;}
    }
    if(/\/players(?:\?|$)/.test(url)){
      try{
        const payload=await response.clone().json();
        const list=Array.isArray(payload)?payload:payload?.players;
        if(!Array.isArray(list))return response;
        const filtered=list.filter(player=>!BAD_PLAYER(player));
        const body=JSON.stringify(Array.isArray(payload)?filtered:{...payload,players:filtered});
        const headers=new Headers(response.headers);headers.set('content-type','application/json');
        return new Response(body,{status:response.status,statusText:response.statusText,headers});
      }catch(_error){return response;}
    }
    return response;
  };
})();