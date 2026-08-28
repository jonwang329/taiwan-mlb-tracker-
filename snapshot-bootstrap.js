(()=>{
  const CACHE_KEY='taiwan-mlb-tracker:last-good:v2';
  const identities=window.TaiwanPlayerIdentities;

  const normalizeSnapshot=snapshot=>{
    if(!snapshot||!Array.isArray(snapshot.players)||!Array.isArray(snapshot.results)||snapshot.players.length!==snapshot.results.length)return null;
    return identities?{...snapshot,players:identities.apply(snapshot.players)}:snapshot;
  };

  const central=normalizeSnapshot(window.CENTRAL_DASHBOARD_SNAPSHOT);
  if(central)window.CENTRAL_DASHBOARD_SNAPSHOT=central;
  if(!central||!central.players.length)return;

  try{
    const local=normalizeSnapshot(JSON.parse(localStorage.getItem(CACHE_KEY)||'null'));
    const centralIds=new Set(central.players.map(player=>Number(player?.id)).filter(Boolean));
    const localIds=new Set((local?.players||[]).map(player=>Number(player?.id)).filter(Boolean));
    const localHasFullRoster=local&&local.players.length===central.players.length&&[...centralIds].every(id=>localIds.has(id));

    // The central MLB/MiLB snapshot defines the complete tracked roster on cold start.
    // A newer browser cache may contain fresher stats, but it must never be allowed
    // to hide players. If roster coverage is incomplete, immediately repair it from
    // central truth. Only a complete local roster is eligible to survive by timestamp.
    if(!localHasFullRoster||Number(local.savedAt||0)<Number(central.savedAt||0)){
      localStorage.setItem(CACHE_KEY,JSON.stringify(central));
    }
  }catch(error){
    console.warn('Could not reconcile browser last-good cache with central MLB snapshot',error);
    try{localStorage.setItem(CACHE_KEY,JSON.stringify(central));}catch(_error){}
  }
})();
