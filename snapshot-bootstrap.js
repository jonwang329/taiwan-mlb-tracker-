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
    const centralSaved=Number(central.savedAt||0);
    const localSaved=Number(local?.savedAt||0);

    // Snapshot is display fallback only. It may seed a cold browser or replace an
    // older cache, but it must never overwrite newer MLB/MiLB last-good data that
    // this browser already confirmed during a live refresh.
    if(!local||localSaved<centralSaved){
      localStorage.setItem(CACHE_KEY,JSON.stringify(central));
    }
  }catch(error){
    console.warn('Could not seed last-good cache from dashboard snapshot',error);
  }
})();
