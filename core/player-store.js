(()=>{
  let state=Object.freeze({players:[],results:[],savedAt:0,source:'empty'});
  const listeners=new Set();

  function valid(next){
    return Boolean(next&&Array.isArray(next.players)&&Array.isArray(next.results)&&next.players.length===next.results.length);
  }

  function snapshot(){
    return state;
  }

  function replace(next){
    if(!valid(next))throw new Error('Player store requires aligned players/results arrays');
    state=Object.freeze({
      players:[...next.players],
      results:[...next.results],
      savedAt:Number(next.savedAt||Date.now()),
      source:String(next.source||'official')
    });
    for(const listener of listeners){
      try{listener(state)}catch(error){console.error('Player store listener failed',error);}
    }
    return state;
  }

  function subscribe(listener){
    if(typeof listener!=='function')throw new TypeError('listener must be a function');
    listeners.add(listener);
    return ()=>listeners.delete(listener);
  }

  window.TaiwanMlbPlayerStore=Object.freeze({snapshot,replace,subscribe,valid});
})();
