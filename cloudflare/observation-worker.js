const KEY = 'players';
const OWNER_KEY_SHA256 = '560c461085566629688dd105c9c940f7be6f7542a0d24860643cf44c89840f6a';
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

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Cache-Control': 'no-store'
};
const json = (body, status=200) => new Response(JSON.stringify(body), {status, headers:{...cors,'Content-Type':'application/json; charset=utf-8'}});
async function readPlayers(env){
  let players = await env.OBSERVATION_LIST.get(KEY, 'json');
  if (!Array.isArray(players)) {
    players = DEFAULT_PLAYERS;
    await env.OBSERVATION_LIST.put(KEY, JSON.stringify(players));
  }
  return players;
}
async function sha256Hex(value){
  const bytes=new TextEncoder().encode(value);
  const digest=await crypto.subtle.digest('SHA-256',bytes);
  return [...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,'0')).join('');
}
async function authorized(request){
  const header=request.headers.get('authorization')||'';
  const token=header.startsWith('Bearer ')?header.slice(7):'';
  if(!token)return false;
  return (await sha256Hex(token))===OWNER_KEY_SHA256;
}
async function mlbPlayer(id){
  const response=await fetch(`https://statsapi.mlb.com/api/v1/people/${id}?hydrate=currentTeam`);
  if(!response.ok)return null;
  const person=(await response.json()).people?.[0];
  if(!person?.id||!person?.fullName)return null;
  const role=person.primaryPosition?.abbreviation||person.primaryPosition?.name||'—';
  const group=person.primaryPosition?.type==='Pitcher'||person.primaryPosition?.name==='Pitcher'?'pitching':'hitting';
  return {id:Number(person.id),name:String(person.fullName),role:String(role),org:String(person.currentTeam?.name||'MLB / MiLB'),group};
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return new Response(null, {status:204, headers:cors});
    const url = new URL(request.url);
    if (request.method === 'GET' && url.pathname === '/health') return json({ok:true, storage:'Cloudflare Workers KV', ownerWrite:true});
    if (request.method === 'GET' && (url.pathname === '/' || url.pathname === '/players')) {
      const players = await readPlayers(env);
      return json({players, count:players.length, updatedAt:new Date().toISOString()});
    }
    if (!(await authorized(request))) return json({error:'unauthorized'}, 401);
    if (request.method === 'POST' && url.pathname === '/players') {
      const body=await request.json().catch(()=>null);
      const id=Number(body?.id);
      if(!Number.isInteger(id)||id<=0)return json({error:'invalid player id'},400);
      const players=await readPlayers(env);
      if(players.some(p=>Number(p.id)===id))return json({error:'already tracked'},409);
      const player=await mlbPlayer(id);
      if(!player)return json({error:'MLB player not found'},404);
      const next=[...players,player];
      await env.OBSERVATION_LIST.put(KEY,JSON.stringify(next));
      return json({ok:true,player,players:next},201);
    }
    const match=url.pathname.match(/^\/players\/(\d+)$/);
    if(request.method==='DELETE'&&match){
      const id=Number(match[1]);
      const players=await readPlayers(env);
      const next=players.filter(p=>Number(p.id)!==id);
      if(next.length===players.length)return json({error:'not tracked'},404);
      await env.OBSERVATION_LIST.put(KEY,JSON.stringify(next));
      return json({ok:true,players:next});
    }
    return json({error:'not found'},404);
  }
};
