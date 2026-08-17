(()=>{
  const identities=window.TaiwanPlayerIdentities;
  const snapshot=window.CENTRAL_DASHBOARD_SNAPSHOT;
  if(!snapshot||!Array.isArray(snapshot.players)||!Array.isArray(snapshot.results)||snapshot.players.length!==snapshot.results.length)return;
  if(identities)window.CENTRAL_DASHBOARD_SNAPSHOT={...snapshot,players:identities.apply(snapshot.players)};
  try{localStorage.removeItem('taiwan-mlb-tracker:last-good:v2');}catch{}
})();
