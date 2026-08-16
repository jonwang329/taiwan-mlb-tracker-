const stateKey = env => `eddie-sandbox:${env.EDDIE_TEST_ID}:jon`;
const defaultState = () => ({ studentId:'jon', name:'Jon', offers:['Tue 17:00–18:00','Wed 17:00–18:00'], confirmed:null, updatedAt:new Date().toISOString() });
async function readState(env){ return await env.OBSERVATION_LIST.get(stateKey(env),'json') || defaultState(); }
async function writeState(env,s){ s.updatedAt=new Date().toISOString(); await env.OBSERVATION_LIST.put(stateKey(env),JSON.stringify(s)); }
const json=(x,status=200)=>new Response(JSON.stringify(x),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});

function page(state,token){
  const body=state.confirmed
    ? `<div class="confirmed">✓ Confirmed<br>${state.confirmed}</div><p class="muted">其他候選時段已自動釋放。</p>`
    : `${state.offers.map(x=>`<button class="slot" data-x="${x}">${x}</button>`).join('')}<button class="confirm" id="confirm" disabled>Confirm</button>`;
  return `<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Eddie Student Test</title><style>body{font-family:system-ui;background:#f5f7fa;margin:0;color:#172033}.wrap{max-width:560px;margin:auto;padding:18px}.card{background:white;border-radius:18px;padding:20px;box-shadow:0 8px 28px #0001}.tag{font-size:12px;font-weight:800;color:#8b3d59}.slot{display:block;width:100%;text-align:left;padding:15px;margin:10px 0;border:1px solid #e2a9bb;background:#fff1f5;border-radius:12px;font-size:16px}.slot.on{outline:3px solid #173b66}.confirm{width:100%;padding:14px;border:0;border-radius:12px;background:#173b66;color:#fff;font-weight:800;font-size:16px;margin-top:12px}.confirmed{padding:16px;background:#edf7ee;border-radius:12px;color:#477454;font-weight:800}.muted{color:#6b7788;font-size:13px}</style></head><body><div class="wrap"><div class="card"><div class="tag">EDDIE · STUDENT PORTAL · TEST</div><h2>Hi Jon 👋</h2><p class="muted">請選一個教練提供的時段。按 Confirm 後，另一個候選時段會自動釋放。</p><div id="app">${body}</div></div></div>${state.confirmed?'':`<script>const token=${JSON.stringify(token)};let chosen='';document.querySelectorAll('.slot').forEach(b=>b.onclick=()=>{chosen=b.dataset.x;document.querySelectorAll('.slot').forEach(x=>x.classList.toggle('on',x===b));document.getElementById('confirm').disabled=false});document.getElementById('confirm').onclick=async()=>{const r=await fetch('/?token='+encodeURIComponent(token)+'&action=confirm',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({slot:chosen})});if(!r.ok){alert('Confirm failed');return}location.reload()};</script>`}</body></html>`;
}

export default { async fetch(request,env){
  const url=new URL(request.url);
  if(url.pathname==='/health') return json({ok:true,testId:env.EDDIE_TEST_ID});
  const token=url.searchParams.get('token');
  if(!token || token!==env.EDDIE_TEST_TOKEN) return json({error:'unauthorized'},401);
  if(request.method==='POST' && url.searchParams.get('action')==='confirm'){
    const body=await request.json().catch(()=>({})); const s=await readState(env);
    if(!s.offers.includes(body.slot)) return json({error:'invalid slot'},400);
    s.confirmed=body.slot; s.offers=[]; await writeState(env,s); return json({ok:true,state:s});
  }
  const s=await readState(env);
  if(url.searchParams.get('format')==='json') return json(s);
  return new Response(page(s,token),{headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-store'}});
} };