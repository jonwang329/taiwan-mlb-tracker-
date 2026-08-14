const TRUSTED_ORIGINS = new Set(['https://jonwang329.github.io']);
const MLB_API = 'https://statsapi.mlb.com/api/v1';

function cors(request){
  const origin=request.headers.get('Origin')||'';
  return {
    'Access-Control-Allow-Origin': TRUSTED_ORIGINS.has(origin)?origin:'null',
    'Access-Control-Allow-Headers': 'content-type',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Vary': 'Origin',
    'Cache-Control': 'no-store'
  };
}

function json(request,body,status=200){
  return new Response(JSON.stringify(body),{status,headers:{...cors(request),'Content-Type':'application/json; charset=utf-8'}});
}

export default {
  async fetch(request){
    if(request.method==='OPTIONS')return new Response(null,{status:204,headers:cors(request)});
    const url=new URL(request.url);
    if(request.method==='GET'&&url.pathname==='/health')return json(request,{ok:true,source:'mlb-stats-api',mode:'pitch-proxy-v1'});

    const match=url.pathname.match(/^\/mlb\/playbyplay\/(\d+)$/);
    if(request.method==='GET'&&match){
      const gamePk=Number(match[1]);
      if(!Number.isSafeInteger(gamePk)||gamePk<=0)return json(request,{error:'invalid gamePk'},400);
      try{
        const upstream=await fetch(`${MLB_API}/game/${gamePk}/playByPlay?_=${Date.now()}`,{
          cache:'no-store',
          headers:{Accept:'application/json','Cache-Control':'no-cache'}
        });
        if(!upstream.ok)return json(request,{error:`MLB API ${upstream.status}`,gamePk},upstream.status);
        const data=await upstream.json();
        return json(request,{
          gamePk,
          allPlays:Array.isArray(data?.allPlays)?data.allPlays:[],
          currentPlay:data?.currentPlay||null,
          scoringPlays:Array.isArray(data?.scoringPlays)?data.scoringPlays:[]
        });
      }catch(error){
        return json(request,{error:'MLB playByPlay unavailable',detail:String(error?.message||error),gamePk},502);
      }
    }

    return json(request,{error:'not found'},404);
  }
};
