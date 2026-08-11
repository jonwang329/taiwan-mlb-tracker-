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
  'Access-Control-Allow-Headers': 'content-type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
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

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return new Response(null, {status:204, headers:cors});
    const url = new URL(request.url);
    if (request.method === 'GET' && url.pathname === '/health') return json({ok:true, storage:'Cloudflare Workers KV'});
    if (request.method === 'GET' && (url.pathname === '/' || url.pathname === '/players')) {
      const players = await readPlayers(env);
      return json({players, count:players.length, updatedAt:new Date().toISOString()});
    }
    if (request.method !== 'GET') return json({error:'read only'}, 405);
    return json({error:'not found'}, 404);
  }
};
