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
  // MLB/MiLB central snapshot is the cold-start truth. Never let a browser runtime
  // cache with a newer timestamp hide corrected official data on the next page load.
  try{localStorage.setItem(CACHE_KEY,JSON.stringify(central));}
  catch(error){console.warn('Could not seed browser from central MLB snapshot',error);}
})();
