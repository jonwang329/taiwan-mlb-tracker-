const stateKey = env => `student:${env.EDDIE_TEST_ID || 'live-test'}:jon`;
const latestLineUserKey = 'line:latest-user';
const latestWebhookAttemptKey = 'line:webhook:last-attempt';
const defaultState = () => ({ studentId:'jon', name:'Jon', offers:['Tue 17:00–18:00','Wed 17:00–18:00'], confirmed:null, updatedAt:new Date().toISOString() });

async function readState(env){ return await env.EDDIE_KV.get(stateKey(env),'json') || defaultState(); }
async function writeState(env,s){ s.updatedAt=new Date().toISOString(); await env.EDDIE_KV.put(stateKey(env),JSON.stringify(s)); }
const json=(x,status=200)=>new Response(JSON.stringify(x),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});

function decodeBase64(value){
  try { return Uint8Array.from(atob(value), c => c.charCodeAt(0)); }
  catch { return null; }
}

async function verifyLineSignature(rawBody, signature, channelSecret){
  if(!signature || !channelSecret) return false;
  const signatureBytes=decodeBase64(signature);
  if(!signatureBytes) return false;
  const encoder=new TextEncoder();
  const key=await crypto.subtle.importKey(
    'raw', encoder.encode(channelSecret),
    {name:'HMAC', hash:'SHA-256'}, false, ['verify']
  );
  return crypto.subtle.verify('HMAC', key, signatureBytes, encoder.encode(rawBody));
}

async function fetchLineProfile(env,userId){
  if(!env.LINE_CHANNEL_ACCESS_TOKEN || !userId) return null;
  try{
    const r=await fetch(`https://api.line.me/v2/bot/profile/${encodeURIComponent(userId)}`,{
      headers:{Authorization:`Bearer ${env.LINE_CHANNEL_ACCESS_TOKEN}`}
    });
    if(!r.ok) return null;
    const p=await r.json();
    return {displayName:p.displayName||'', pictureUrl:p.pictureUrl||''};
  }catch{return null;}
}

async function recordLineEvent(env,event){
  const userId=event?.source?.userId;
  if(!userId) return;
  const key=`line:user:${userId}`;
  const previous=await env.EDDIE_KV.get(key,'json');
  const now=new Date().toISOString();
  const profile=event.type==='unfollow' ? null : await fetchLineProfile(env,userId);
  const record={
    userId,
    displayName:profile?.displayName || previous?.displayName || '',
    pictureUrl:profile?.pictureUrl || previous?.pictureUrl || '',
    sourceType:event?.source?.type || previous?.sourceType || 'user',
    status:event.type==='unfollow' ? 'blocked' : 'active',
    firstSeenAt:previous?.firstSeenAt || now,
    lastSeenAt:now,
    lastEventType:event.type || 'unknown'
  };
  await Promise.all([
    env.EDDIE_KV.put(key,JSON.stringify(record)),
    env.EDDIE_KV.put(latestLineUserKey,JSON.stringify(record))
  ]);
}

async function handleWebhook(request,env,ctx){
  if(request.method!=='POST') return json({error:'method not allowed'},405);
  const rawBody=await request.text();
  const signature=request.headers.get('x-line-signature') || '';
  const valid=await verifyLineSignature(rawBody,signature,env.LINE_CHANNEL_SECRET);

  await env.EDDIE_KV.put(latestWebhookAttemptKey,JSON.stringify({
    receivedAt:new Date().toISOString(),
    signaturePresent:Boolean(signature),
    signatureValid:Boolean(valid),
    channelSecretConfigured:Boolean(env.LINE_CHANNEL_SECRET),
    contentType:request.headers.get('content-type') || ''
  }));

  if(!valid) return json({error:'invalid signature'},401);

  let payload;
  try{ payload=JSON.parse(rawBody); }
  catch{ return json({error:'invalid json'},400); }

  const events=Array.isArray(payload.events)?payload.events:[];
  if(events.length && ctx?.waitUntil){
    ctx.waitUntil(Promise.all(events.map(event=>recordLineEvent(env,event))));
  }else if(events.length){
    await Promise.all(events.map(event=>recordLineEvent(env,event)));
  }
  return json({ok:true,received:events.length});
}

async function publicWebhookStatus(env){
  const [attempt,user] = await Promise.all([
    env.EDDIE_KV.get(latestWebhookAttemptKey,'json'),
    env.EDDIE_KV.get(latestLineUserKey,'json')
  ]);
  return json({
    webhookReached:Boolean(attempt?.receivedAt),
    receivedAt:attempt?.receivedAt || null,
    signaturePresent:Boolean(attempt?.signaturePresent),
    signatureValid:Boolean(attempt?.signatureValid),
    channelSecretConfigured:Boolean(env.LINE_CHANNEL_SECRET),
    lineTokenConfigured:Boolean(env.LINE_CHANNEL_ACCESS_TOKEN),
    lineUserCaptured:Boolean(user?.userId)
  });
}

async function publicLineWebhookConfig(request,env){
  if(!env.LINE_CHANNEL_ACCESS_TOKEN) return json({ok:false,reason:'token-missing'},503);
  try{
    const r=await fetch('https://api.line.me/v2/bot/channel/webhook/endpoint',{
      headers:{Authorization:`Bearer ${env.LINE_CHANNEL_ACCESS_TOKEN}`}
    });
    const body=await r.json().catch(()=>({}));
    const expected=`${new URL(request.url).origin}/webhook`;
    return json({
      ok:r.ok,
      active:body.active === true,
      endpointConfigured:Boolean(body.endpoint),
      endpointMatchesExpected:body.endpoint === expected,
      httpStatus:r.status
    }, r.ok?200:502);
  }catch{
    return json({ok:false,reason:'line-api-unreachable'},502);
  }
}

function page(state,token){
  const body=state.confirmed
    ? `<div class="confirmed">✓ Confirmed<br>${state.confirmed}</div><p class="muted">其他候選時段已自動釋放。</p>`
    : `${state.offers.map(x=>`<button class="slot" data-x="${x}">${x}</button>`).join('')}<button class="confirm" id="confirm" disabled>Confirm</button>`;
  return `<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Eddie Student Test</title><style>body{font-family:system-ui;background:#f5f7fa;margin:0;color:#172033}.wrap{max-width:560px;margin:auto;padding:18px}.card{background:white;border-radius:18px;padding:20px;box-shadow:0 8px 28px #0001}.tag{font-size:12px;font-weight:800;color:#8b3d59}.slot{display:block;width:100%;text-align:left;padding:15px;margin:10px 0;border:1px solid #e2a9bb;background:#fff1f5;border-radius:12px;font-size:16px}.slot.on{outline:3px solid #173b66}.confirm{width:100%;padding:14px;border:0;border-radius:12px;background:#173b66;color:#fff;font-weight:800;font-size:16px;margin-top:12px}.confirmed{padding:16px;background:#edf7ee;border-radius:12px;color:#477454;font-weight:800}.muted{color:#6b7788;font-size:13px}</style></head><body><div class="wrap"><div class="card"><div class="tag">EDDIE · STUDENT PORTAL · TEST</div><h2>Hi Jon 👋</h2><p class="muted">請選一個教練提供的時段。按 Confirm 後，另一個候選時段會自動釋放。</p><div id="app">${body}</div></div></div>${state.confirmed?'':`<script>const token=${JSON.stringify(token)};let chosen='';document.querySelectorAll('.slot').forEach(b=>b.onclick=()=>{chosen=b.dataset.x;document.querySelectorAll('.slot').forEach(x=>x.classList.toggle('on',x===b));document.getElementById('confirm').disabled=false});document.getElementById('confirm').onclick=async()=>{const r=await fetch('/?token='+encodeURIComponent(token)+'&action=confirm',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({slot:chosen})});if(!r.ok){alert('Confirm failed');return}location.reload()};</script>`}</body></html>`;
}

export default { async fetch(request,env,ctx){
  const url=new URL(request.url);

  if(url.pathname==='/health') return json({
    ok:true,
    webhook:true,
    channelSecretConfigured:Boolean(env.LINE_CHANNEL_SECRET),
    lineTokenConfigured:Boolean(env.LINE_CHANNEL_ACCESS_TOKEN),
    storage:'eddie-kv'
  });

  if(url.pathname==='/webhook') return handleWebhook(request,env,ctx);
  if(url.pathname==='/webhook-status') return publicWebhookStatus(env);
  if(url.pathname==='/line-webhook-config') return publicLineWebhookConfig(request,env);

  const token=url.searchParams.get('token');
  if(!token || token!==env.EDDIE_TEST_TOKEN) return json({error:'unauthorized'},401);

  if(url.pathname==='/api/latest-line-user'){
    return json(await env.EDDIE_KV.get(latestLineUserKey,'json') || {userId:null});
  }

  if(url.pathname==='/api/webhook-debug'){
    return json(await env.EDDIE_KV.get(latestWebhookAttemptKey,'json') || {receivedAt:null});
  }

  if(request.method==='POST' && url.searchParams.get('action')==='confirm'){
    const body=await request.json().catch(()=>({}));
    const s=await readState(env);
    if(!s.offers.includes(body.slot)) return json({error:'invalid slot'},400);
    s.confirmed=body.slot;
    s.offers=[];
    await writeState(env,s);
    return json({ok:true,state:s});
  }

  const s=await readState(env);
  if(url.searchParams.get('format')==='json') return json(s);
  return new Response(page(s,token),{headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-store'}});
} };
