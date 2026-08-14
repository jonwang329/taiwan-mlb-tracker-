const TRUSTED_ORIGINS = new Set(['https://jonwang329.github.io']);
const MLB_API = 'https://statsapi.mlb.com';

function cors(request){
  const origin=request.headers.get('Origin')||'';
  return {
    'Access-Control-Allow-Origin': TRUSTED_ORIGINS.has(origin)?origin:'null',
    'Access-Control-Allow-Headers': 'content-type, cache-control',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Vary': 'Origin',
    'Cache-Control': 'no-store'
  };
}

function json(request,body,status=200){
  return new Response(JSON.stringify(body),{status,headers:{...cors(request),'Content-Type':'application/json; charset=utf-8'}});
}

async function mlbFetch(url){
  const response=await fetch(url,{
    cache:'no-store',
    headers:{Accept:'application/json','User-Agent':'Taiwan-MLB-Tracker/1.0'}
  });
  if(!response.ok)return{ok:false,status:response.status,data:null};
  return{ok:true,status:response.status,data:await response.json()};
}

function normalized(gamePk,data,source){
  const plays=Array.isArray(data?.allPlays)?data.allPlays:(data?.liveData?.plays?.allPlays||[]);
  return{
    gamePk,
    source,
    allPlays:Array.isArray(plays)?plays:[],
    currentPlay:data?.currentPlay||data?.liveData?.plays?.currentPlay||null,
    scoringPlays:Array.isArray(data?.scoringPlays)?data.scoringPlays:(data?.liveData?.plays?.scoringPlays||[])
  };
}

export default {
  async fetch(request){
    if(request.method==='OPTIONS')return new Response(null,{status:204,headers:cors(request)});
    const url=new URL(request.url);
    if(request.method==='GET'&&url.pathname==='/health')return json(request,{ok:true,source:'mlb-stats-api',mode:'pitch-proxy-v2'});

    const match=url.pathname.match(/^\/mlb\/playbyplay\/(\d+)$/);
    if(request.method==='GET'&&match){
      const gamePk=Number(match[1]);
      if(!Number.isSafeInteger(gamePk)||gamePk<=0)return json(request,{error:'invalid gamePk'},400);
      try{
        const primary=await mlbFetch(`${MLB_API}/api/v1/game/${gamePk}/playByPlay`);
        if(primary.ok)return json(request,normalized(gamePk,primary.data,'v1-playByPlay'));

        const fallback=await mlbFetch(`${MLB_API}/api/v1.1/game/${gamePk}/feed/live`);
        if(fallback.ok)return json(request,normalized(gamePk,fallback.data,'v1.1-feed-live-fallback'));

        return json(request,{
          error:'MLB pitch endpoints unavailable',
          gamePk,
          primaryStatus:primary.status,
          fallbackStatus:fallback.status
        },502);
      }catch(error){
        return json(request,{error:'MLB playByPlay unavailable',detail:String(error?.message||error),gamePk},502);
      }
    }

    return json(request,{error:'not found'},404);
  }
};
