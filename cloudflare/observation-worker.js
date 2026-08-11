const KEY = 'players';
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
function authorized(request, env){
  if (!env.ADMIN_TOKEN) return false;
  return request.headers.get('authorization') === `Bearer ${env.ADMIN_TOKEN}`;
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return new Response(null, {status:204, headers:cors});
    const url = new URL(request.url);
    if (request.method === 'GET' && url.pathname === '/health') return json({ok:true, storage:'Cloudflare Workers KV'});
    if (request.method === 'GET' && (url.pathname === '/' || url.pathname === '/players')) {
      const players = await readPlayers(env);
      return json({players, count:players.length, updatedAt:new Date().toISOString()});
    }
    if (!authorized(request, env)) return json({error:'unauthorized'}, 401);
    if (request.method === 'POST' && url.pathname === '/players') {
      const player = await request.json().catch(()=>null);
      if (!player || !Number.isInteger(Number(player.id)) || !player.name || !['hitting','pitching'].includes(player.group)) return json({error:'invalid player'}, 400);
      const players = await readPlayers(env);
      if (players.some(p=>Number(p.id)===Number(player.id))) return json({error:'already tracked'}, 409);
      const next = [...players, {id:Number(player.id),name:String(player.name),role:String(player.role||'—'),org:String(player.org||'MLB / MiLB'),group:player.group}];
      await env.OBSERVATION_LIST.put(KEY, JSON.stringify(next));
      return json({ok:true, players:next}, 201);
    }
    const match = url.pathname.match(/^\/players\/(\d+)$/);
    if (request.method === 'DELETE' && match) {
      const id = Number(match[1]);
      const players = await readPlayers(env);
      const next = players.filter(p=>Number(p.id)!==id);
      if (next.length === players.length) return json({error:'not tracked'}, 404);
      await env.OBSERVATION_LIST.put(KEY, JSON.stringify(next));
      return json({ok:true, players:next});
    }
    return json({error:'not found'}, 404);
  }
};
