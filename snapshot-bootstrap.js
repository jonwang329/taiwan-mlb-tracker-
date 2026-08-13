(()=>{
  const CACHE_KEY='taiwan-mlb-tracker:last-good:v2';
  const identities=window.TaiwanPlayerIdentities;
  const normalizeSnapshot=snapshot=>{
    if(!snapshot||!Array.isArray(snapshot.players)||!Array.isArray(snapshot.results)||snapshot.players.length!==snapshot.results.length)return snapshot;
    return identities?{...snapshot,players:identities.apply(snapshot.players)}:snapshot;
  };
  const central=normalizeSnapshot(window.CENTRAL_DASHBOARD_SNAPSHOT);
  if(central&&central!==window.CENTRAL_DASHBOARD_SNAPSHOT)window.CENTRAL_DASHBOARD_SNAPSHOT=central;
  if(!central||!Array.isArray(central.players)||!Array.isArray(central.results)||central.players.length!==central.results.length||!central.players.length)return;
  try{
    const rawLocal=JSON.parse(localStorage.getItem(CACHE_KEY)||'null');
    const local=normalizeSnapshot(rawLocal);
    if(local&&local!==rawLocal)localStorage.setItem(CACHE_KEY,JSON.stringify(local));
    const centralSaved=Number(central.savedAt||0);
    const localSaved=Number(local?.savedAt||0);
    if(local&&Array.isArray(local.players)&&Array.isArray(local.results)&&local.players.length===local.results.length&&localSaved>=centralSaved)return;
    localStorage.setItem(CACHE_KEY,JSON.stringify(central));
  }catch(error){
    console.warn('Could not seed local dashboard cache from central snapshot',error);
  }
})();
