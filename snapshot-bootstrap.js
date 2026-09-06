(()=>{
  const CACHE_KEY='taiwan-mlb-tracker:last-good:v2';
  const identities=window.TaiwanPlayerIdentities;
  const BAD_PLAYER=player=>{
    const name=String(player?.name||'').toLowerCase();
    const org=String(player?.org||'').toLowerCase();
    return name.includes('林昌勇') || ((name.includes('chang-yong')||name.includes('chang yo')||name.includes('chang-yo'))&&name.includes('lim')) || (name.includes('chang')&&name.includes('lim')&&org.includes('chicago cubs'));
  };
  const taiwanToday=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  const appearanceStrength=t=>{
    if(!t)return 0;
    if(t.onGame||t.live)return 4;
    if(Number(t.stat?.plateAppearances||0)>0||Number(t.stat?.atBats||0)>0||Number(t.stat?.battersFaced||0)>0||Number(t.stat?.pitchesThrown||0)>0)return 3;
    if(t.scheduled)return 2;
    return 1;
  };

  const normalizeSnapshot=snapshot=>{
    if(!snapshot||!Array.isArray(snapshot.players)||!Array.isArray(snapshot.results)||snapshot.players.length!==snapshot.results.length)return null;
    const named=identities?identities.apply(snapshot.players):snapshot.players;
    const pairs=named.map((player,index)=>({player,result:snapshot.results[index]})).filter(({player})=>!BAD_PLAYER(player));
    return {...snapshot,players:pairs.map(x=>x.player),results:pairs.map(x=>x.result)};
  };

  const mergeConfirmedToday=(incoming,previous)=>{
    incoming=normalizeSnapshot(incoming);
    previous=normalizeSnapshot(previous);
    if(!incoming||!previous)return incoming;
    const oldById=new Map(previous.players.map((player,index)=>[Number(player.id),previous.results[index]]));
    const today=taiwanToday();
    const results=incoming.results.map((result,index)=>{
      const old=oldById.get(Number(incoming.players[index]?.id));
      const oldToday=old?.today,newToday=result?.today;
      if(oldToday&&String(oldToday.date||'')===today&&appearanceStrength(oldToday)>appearanceStrength(newToday))return {...result,today:oldToday};
      return result;
    });
    return {...incoming,results};
  };

  let local=null;
  try{local=normalizeSnapshot(JSON.parse(localStorage.getItem(CACHE_KEY)||'null'));}catch(_error){}
  let central=mergeConfirmedToday(window.CENTRAL_DASHBOARD_SNAPSHOT,local);
  if(central)window.CENTRAL_DASHBOARD_SNAPSHOT=central;

  if(central?.players?.length){
    try{
      const centralIds=new Set(central.players.map(player=>Number(player?.id)).filter(Boolean));
      const localIds=new Set((local?.players||[]).map(player=>Number(player?.id)).filter(Boolean));
      const localHasFullRoster=local&&local.players.length===central.players.length&&[...centralIds].every(id=>localIds.has(id));
      if(!localHasFullRoster||Number(local.savedAt||0)<Number(central.savedAt||0))localStorage.setItem(CACHE_KEY,JSON.stringify(central));
      else if(local) localStorage.setItem(CACHE_KEY,JSON.stringify(mergeConfirmedToday(local,central)));
    }catch(error){
      console.warn('Could not reconcile browser last-good cache with central MLB snapshot',error);
      try{localStorage.setItem(CACHE_KEY,JSON.stringify(central));}catch(_error){}
    }
  }

  // All later central-snapshot refreshes must obey the same monotonic rule:
  // once MLB Gameday has confirmed today's appearance, a slower snapshot can update
  // season data but can never erase today's line back to a dash / not-played state.
  const nativeFetch=window.fetch.bind(window);
  window.fetch=async(input,init)=>{
    const response=await nativeFetch(input,init);
    const url=String(typeof input==='string'?input:input?.url||'');
    if(url.includes('data/dashboard-snapshot.js')){
      try{
        const text=await response.clone().text();
        const match=text.match(/window\.CENTRAL_DASHBOARD_SNAPSHOT\s*=\s*(.*);\s*$/s);
        if(!match)return response;
        let cached=null;
        try{cached=JSON.parse(localStorage.getItem(CACHE_KEY)||'null');}catch(_error){}
        const snapshot=mergeConfirmedToday(JSON.parse(match[1]),cached);
        const body=`window.CENTRAL_DASHBOARD_SNAPSHOT=${JSON.stringify(snapshot)};`;
        return new Response(body,{status:response.status,statusText:response.statusText,headers:response.headers});
      }catch(error){console.warn('Central snapshot monotonic merge failed',error);return response;}
    }
    if(/\/players(?:\?|$)/.test(url)){
      try{
        const payload=await response.clone().json();
        const list=Array.isArray(payload)?payload:payload?.players;
        if(!Array.isArray(list))return response;
        const filtered=(identities?identities.apply(list):list).filter(player=>!BAD_PLAYER(player));
        const body=JSON.stringify(Array.isArray(payload)?filtered:{...payload,players:filtered});
        const headers=new Headers(response.headers);headers.set('content-type','application/json');
        return new Response(body,{status:response.status,statusText:response.statusText,headers});
      }catch(_error){return response;}
    }
    return response;
  };
})();