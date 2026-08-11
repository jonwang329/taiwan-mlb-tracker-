const DEFAULT_PLAYERS = [
  {id:701678,name:'李灝宇 Hao-Yu Lee',role:'2B',org:'Detroit Tigers',group:'hitting'},
  {id:691907,name:'鄭宗哲 Tsung-Che Cheng',role:'SS',org:'Boston Red Sox',group:'hitting'},
  {id:678906,name:'鄧愷威 Kai-Wei Teng',role:'RHP',org:'Houston Astros',group:'pitching'},
  {id:827734,name:'林維恩 Wei-En Lin',role:'LHP',org:'Athletics',group:'pitching'},
  {id:801179,name:'林昱珉 Yu-Min Lin',role:'LHP',org:'Arizona Diamondbacks',group:'pitching'},
  {id:828667,name:'柯敬賢 Ching-Hsien Ko',role:'OF',org:'Los Angeles Dodgers',group:'hitting'},
  {id:813820,name:'林振瑋 Chen-Wei Lin',role:'RHP',org:'St. Louis Cardinals',group:'pitching'},
  {id:800018,name:'莊陳仲敖 Chen Zhong-Ao Zhuang',role:'RHP',org:'Athletics',group:'pitching'},
  {id:808486,name:'李晨薰 Chen-Hsun Lee',role:'RHP',org:'San Francisco Giants',group:'pitching'}
];

const KEY='players';
const MLB='https://statsapi.mlb.com/api/v1';

function cors(request,env){
  const origin=request.headers.get('Origin')||'';
  const allowed=env.ALLOWED_ORIGIN||'*';
  return {
    'Access-Control-Allow-Origin': allowed==='*'?'*':(origin===allowed?origin:allowed),
    'Access-Control-Allow-Headers':'Content-Type, X-Owner-Pin',
    'Access-Control-Allow-Methods':'GET, POST, OPTIONS',
    'Cache-Control':'no-store',
    'Content-Type':'application/json; charset=utf-8'
  };
}
function json(request,env,body,status=200){return new Response(JSON.stringify(body),{status,headers:cors(request,env)});}
async function loadPlayers(env){
  const saved=await env.WATCHLIST.get(KEY,{type:'json'});
  if(Array.isArray(saved)) return saved;
  await env.WATCHLIST.put(KEY,JSON.stringify(DEFAULT_PLAYERS));
  return DEFAULT_PLAYERS;
}
function authorized(request,env){
  const supplied=request.headers.get('X-Owner-Pin')||'';
  return Boolean(env.OWNER_PIN)&&supplied===env.OWNER_PIN;
}
async function lookupPlayer(playerId){
  const response=await fetch(`${MLB}/people/${playerId}?hydrate=currentTeam`,{headers:{Accept:'application/json'}});
  if(!response.ok) throw new Error(`MLB lookup failed (${response.status})`);
  const person=(await response.json()).people?.[0];
  if(!person?.id||!person?.fullName) throw new Error('Player not found');
  const role=person.primaryPosition?.abbreviation||person.primaryPosition?.name||'—';
  const group=person.primaryPosition?.type==='Pitcher'||person.primaryPosition?.name==='Pitcher'?'pitching':'hitting';
  return {id:Number(person.id),name:person.fullName,role,org:person.currentTeam?.name||'MLB / MiLB',group};
}

export default {
  async fetch(request,env){
    if(request.method==='OPTIONS') return new Response(null,{status:204,headers:cors(request,env)});
    const url=new URL(request.url);
    if(url.pathname==='/health') return json(request,env,{ok:true});
    if(url.pathname==='/watchlist'&&request.method==='GET') return json(request,env,{players:await loadPlayers(env)});
    if((url.pathname==='/watchlist/add'||url.pathname==='/watchlist/remove')&&request.method==='POST'){
      if(!authorized(request,env)) return json(request,env,{error:'Owner authorization required'},401);
      let body; try{body=await request.json();}catch{return json(request,env,{error:'Invalid JSON'},400);}
      const playerId=Number(body?.playerId);
      if(!Number.isInteger(playerId)||playerId<=0) return json(request,env,{error:'Invalid MLB player ID'},400);
      const players=await loadPlayers(env);
      if(url.pathname.endsWith('/remove')){
        const next=players.filter(p=>Number(p.id)!==playerId);
        if(next.length===players.length) return json(request,env,{error:'Player is not tracked'},404);
        await env.WATCHLIST.put(KEY,JSON.stringify(next));
        return json(request,env,{players:next});
      }
      if(players.some(p=>Number(p.id)===playerId)) return json(request,env,{error:'Player is already tracked'},409);
      try{
        const player=await lookupPlayer(playerId);
        const next=[...players,player];
        await env.WATCHLIST.put(KEY,JSON.stringify(next));
        return json(request,env,{players:next,player},201);
      }catch(error){return json(request,env,{error:error.message||'MLB lookup failed'},502);}
    }
    return json(request,env,{error:'Not found'},404);
  }
};
