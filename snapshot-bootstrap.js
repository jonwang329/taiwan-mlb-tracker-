(()=>{
  const CACHE_KEY='taiwan-mlb-tracker:last-good:v2';
  const central=window.CENTRAL_DASHBOARD_SNAPSHOT;
  if(!central||!Array.isArray(central.players)||!Array.isArray(central.results)||central.players.length!==central.results.length||!central.players.length)return;
  try{
    const local=JSON.parse(localStorage.getItem(CACHE_KEY)||'null');
    const centralSaved=Number(central.savedAt||0);
    const localSaved=Number(local?.savedAt||0);
    if(local&&Array.isArray(local.players)&&Array.isArray(local.results)&&local.players.length===local.results.length&&localSaved>=centralSaved)return;
    localStorage.setItem(CACHE_KEY,JSON.stringify(central));
  }catch(error){
    console.warn('Could not seed local dashboard cache from central snapshot',error);
  }
})();
