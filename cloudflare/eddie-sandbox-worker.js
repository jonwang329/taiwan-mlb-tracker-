const latestLineUserKey = 'line:latest-user';
const latestWebhookAttemptKey = 'line:webhook:last-attempt';
const coachStateKey = 'coach:current-offer';
const confirmAttemptKey = 'confirm:last-attempt';
const COACH_PIN_SHA256 = '82df3b192bcd6c205e694b66ad9f8b89bf3226b6f7068724f9b60672462f6ae7';

const json = (x, status = 200) => new Response(JSON.stringify(x), {
  status,
  headers: {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store'
  }
});

function decodeBase64(value) {
  try { return Uint8Array.from(atob(value), c => c.charCodeAt(0)); }
  catch { return null; }
}

function randomToken() {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return [...bytes].map(b => b.toString(16).padStart(2, '0')).join('');
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

async function sha256Hex(text) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
}

async function isCoachAuthorized(request) {
  const url = new URL(request.url);
  const pin = request.headers.get('x-eddie-coach-pin') || url.searchParams.get('pin') || '';
  if (!pin) return false;
  return (await sha256Hex(pin)) === COACH_PIN_SHA256;
}

async function verifyLineSignature(rawBody, signature, channelSecret) {
  if (!signature || !channelSecret) return false;
  const signatureBytes = decodeBase64(signature);
  if (!signatureBytes) return false;
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw', encoder.encode(channelSecret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']
  );
  return crypto.subtle.verify('HMAC', key, signatureBytes, encoder.encode(rawBody));
}

async function fetchLineProfile(env, userId) {
  if (!env.LINE_CHANNEL_ACCESS_TOKEN || !userId) return null;
  try {
    const r = await fetch(`https://api.line.me/v2/bot/profile/${encodeURIComponent(userId)}`, {
      headers: { Authorization: `Bearer ${env.LINE_CHANNEL_ACCESS_TOKEN}` }
    });
    if (!r.ok) return null;
    const p = await r.json();
    return { displayName: p.displayName || '', pictureUrl: p.pictureUrl || '' };
  } catch { return null; }
}

async function pushLineText(env, userId, text) {
  if (!env.LINE_CHANNEL_ACCESS_TOKEN || !userId) {
    return { ok: false, status: 0, reason: 'missing-token-or-user' };
  }
  const r = await fetch('https://api.line.me/v2/bot/message/push', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.LINE_CHANNEL_ACCESS_TOKEN}`,
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      to: userId,
      messages: [{ type: 'text', text }]
    })
  });
  return { ok: r.ok, status: r.status };
}

async function recordLineEvent(env, event) {
  const userId = event?.source?.userId;
  if (!userId) return;
  const key = `line:user:${userId}`;
  const previous = await env.EDDIE_KV.get(key, 'json');
  const now = new Date().toISOString();
  const profile = event.type === 'unfollow' ? null : await fetchLineProfile(env, userId);
  const record = {
    userId,
    displayName: profile?.displayName || previous?.displayName || '',
    pictureUrl: profile?.pictureUrl || previous?.pictureUrl || '',
    sourceType: event?.source?.type || previous?.sourceType || 'user',
    status: event.type === 'unfollow' ? 'blocked' : 'active',
    firstSeenAt: previous?.firstSeenAt || now,
    lastSeenAt: now,
    lastEventType: event.type || 'unknown'
  };
  await Promise.all([
    env.EDDIE_KV.put(key, JSON.stringify(record)),
    env.EDDIE_KV.put(latestLineUserKey, JSON.stringify(record))
  ]);
}

async function handleWebhook(request, env, ctx) {
  if (request.method !== 'POST') return json({ error: 'method not allowed' }, 405);
  const rawBody = await request.text();
  const signature = request.headers.get('x-line-signature') || '';
  const valid = await verifyLineSignature(rawBody, signature, env.LINE_CHANNEL_SECRET);
  await env.EDDIE_KV.put(latestWebhookAttemptKey, JSON.stringify({
    receivedAt: new Date().toISOString(),
    signaturePresent: Boolean(signature),
    signatureValid: Boolean(valid)
  }));
  if (!valid) return json({ error: 'invalid signature' }, 401);
  let payload;
  try { payload = JSON.parse(rawBody); }
  catch { return json({ error: 'invalid json' }, 400); }
  const events = Array.isArray(payload.events) ? payload.events : [];
  const work = Promise.all(events.map(event => recordLineEvent(env, event)));
  if (events.length && ctx?.waitUntil) ctx.waitUntil(work); else if (events.length) await work;
  return json({ ok: true, received: events.length });
}

async function publicLineWebhookConfig(request, env) {
  if (!env.LINE_CHANNEL_ACCESS_TOKEN) return json({ ok: false, reason: 'token-missing' }, 503);
  try {
    const r = await fetch('https://api.line.me/v2/bot/channel/webhook/endpoint', {
      headers: { Authorization: `Bearer ${env.LINE_CHANNEL_ACCESS_TOKEN}` }
    });
    const body = await r.json().catch(() => ({}));
    const expected = `${new URL(request.url).origin}/webhook`;
    return json({ ok: r.ok, active: body.active === true, endpointMatchesExpected: body.endpoint === expected, httpStatus: r.status }, r.ok ? 200 : 502);
  } catch { return json({ ok: false, reason: 'line-api-unreachable' }, 502); }
}

function normalizeOffers(input) {
  const unique = [...new Set((Array.isArray(input) ? input : []).map(x => String(x).trim()).filter(Boolean))];
  return unique.filter(x => /^週[一二三四五] \d{2}:00–\d{2}:00$/.test(x)).slice(0, 3);
}

async function sendOffer(request, env) {
  if (request.method !== 'POST') return json({ error: 'method not allowed' }, 405);
  if (!(await isCoachAuthorized(request))) return json({ error: 'unauthorized' }, 401);
  const body = await request.json().catch(() => ({}));
  const offers = normalizeOffers(body.offers);
  if (!offers.length) return json({ error: 'choose at least one slot' }, 400);

  const lineUser = await env.EDDIE_KV.get(latestLineUserKey, 'json');
  if (!lineUser?.userId || lineUser.status !== 'active') return json({ error: 'no active LINE student captured' }, 409);

  const token = randomToken();
  const now = new Date().toISOString();
  const state = {
    name: lineUser.displayName || 'Student',
    lineUserId: lineUser.userId,
    status: 'offered',
    offers,
    confirmed: null,
    released: [],
    linePushPolicy: 'offer-only',
    createdAt: now,
    updatedAt: now
  };
  await Promise.all([
    env.EDDIE_KV.put(`portal:${token}`, JSON.stringify(state), { expirationTtl: 60 * 60 * 24 * 7 }),
    env.EDDIE_KV.put(coachStateKey, JSON.stringify({ ...state, lineUserId: undefined, portalToken: token }))
  ]);

  const origin = new URL(request.url).origin;
  const studentUrl = `${origin}/student/${token}`;
  const text = `Eddie Training｜本週排課\n\nHi ${state.name} 👋\n請從以下時段選擇：\n${offers.map(x => `• ${x}`).join('\n')}\n\n點這裡選擇並 Confirm：\n${studentUrl}`;
  const line = await pushLineText(env, lineUser.userId, text);
  if (!line.ok) {
    state.status = 'send_failed';
    state.updatedAt = new Date().toISOString();
    await env.EDDIE_KV.put(coachStateKey, JSON.stringify({ ...state, lineUserId: undefined, portalToken: token }));
    return json({ ok: false, lineStatus: line.status }, 502);
  }
  return json({ ok: true, recipient: state.name, offers: state.offers, lineStatus: line.status });
}

async function dashboardState(env) {
  const [latest, state] = await Promise.all([
    env.EDDIE_KV.get(latestLineUserKey, 'json'),
    env.EDDIE_KV.get(coachStateKey, 'json')
  ]);
  return json({
    student: latest ? { name: latest.displayName || 'Student', status: latest.status, lastSeenAt: latest.lastSeenAt } : null,
    schedule: state ? {
      name: state.name,
      status: state.status,
      offers: state.offers || [],
      confirmed: state.confirmed || null,
      released: state.released || [],
      updatedAt: state.updatedAt || null
    } : null,
    linePushPolicy: 'offer-only'
  });
}

function studentPage(state, token) {
  const confirmed = state.status === 'confirmed';
  const safeName = escapeHtml(state.name || 'Student');
  const body = confirmed
    ? `<div class="confirmed"><div class="check">✓</div><div><small>已確認</small><strong>${escapeHtml(state.confirmed)}</strong></div></div><p class="muted">其他候選時段已自動釋放。你不用再回 LINE。</p>`
    : `<form method="post" action="/student/${token}/confirm-form">${state.offers.map((x, i) => `<label class="slot"><input type="radio" name="slot" value="${escapeHtml(x)}" ${i === 0 ? 'required' : ''}><span>${escapeHtml(x)}</span></label>`).join('')}<button class="confirm" type="submit">Confirm</button></form>`;
  return `<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Eddie Training</title><style>
  :root{--navy:#102a43;--ink:#172033;--muted:#718096;--line:#e8edf3;--pink:#fff2f6;--pink2:#f7d8e3;--green:#edf8f0}
  *{box-sizing:border-box}body{margin:0;background:#f6f8fb;color:var(--ink);font-family:Inter,ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif}.wrap{max-width:580px;margin:auto;padding:24px 16px}.brand{font-size:11px;font-weight:900;letter-spacing:.13em;color:#9a4963;margin-bottom:12px}.card{background:#fff;border:1px solid var(--line);border-radius:24px;padding:24px;box-shadow:0 18px 50px rgba(16,42,67,.08)}h1{font-size:28px;margin:0 0 8px}.muted{font-size:14px;color:var(--muted);line-height:1.6}.slot{display:flex;align-items:center;gap:14px;border:1px solid #ead0d9;background:var(--pink);padding:17px;border-radius:16px;margin:10px 0;font-weight:750}.slot input{width:21px;height:21px}.slot:has(input:checked){outline:3px solid #183b66;background:#fff}.confirm{width:100%;border:0;background:var(--navy);color:#fff;padding:16px;border-radius:14px;font-size:16px;font-weight:850;margin-top:14px}.confirmed{display:flex;align-items:center;gap:14px;background:var(--green);border:1px solid #cfe8d4;padding:18px;border-radius:18px}.confirmed .check{width:42px;height:42px;border-radius:50%;background:#fff;display:grid;place-items:center;font-size:22px;color:#39704b}.confirmed small{display:block;color:#62806b;margin-bottom:3px}.confirmed strong{font-size:18px}
  </style></head><body><div class="wrap"><div class="brand">EDDIE TRAINING</div><div class="card"><h1>Hi ${safeName} 👋</h1><p class="muted">選一個適合你的時段。只有按 Confirm 才會正式完成。</p>${body}</div></div></body></html>`;
}

async function applyConfirmation(env, token, slot, mode) {
  const key = `portal:${token}`;
  const state = await env.EDDIE_KV.get(key, 'json');
  await env.EDDIE_KV.put(confirmAttemptKey, JSON.stringify({ receivedAt: new Date().toISOString(), mode, linkFound: Boolean(state), slotPresent: Boolean(slot) }));
  if (!state) return { ok: false, status: 404, error: '排課連結已失效或不存在。' };
  if (state.status === 'confirmed') return { ok: true, state };
  if (!slot || !state.offers.includes(slot)) return { ok: false, status: 400, error: '請先選擇一個有效時段。' };
  const originalOffers = [...state.offers];
  state.confirmed = slot;
  state.released = originalOffers.filter(x => x !== slot);
  state.offers = [slot];
  state.status = 'confirmed';
  state.updatedAt = new Date().toISOString();
  await Promise.all([
    env.EDDIE_KV.put(key, JSON.stringify(state), { expirationTtl: 60 * 60 * 24 * 7 }),
    env.EDDIE_KV.put(coachStateKey, JSON.stringify({ ...state, lineUserId: undefined, portalToken: token }))
  ]);
  return { ok: true, state };
}

function coachPage() {
return `<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Eddie Coach</title><style>
:root{--navy:#102a43;--navy2:#173b66;--ink:#1f2937;--muted:#748094;--line:#e7ecf2;--bg:#f5f7fa;--pink:#fff2f6;--pinkB:#ebc9d5;--pinkI:#91445d;--green:#edf8f0;--greenI:#427051;--blue:#eef5fb;--shadow:0 18px 50px rgba(16,42,67,.08)}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font-family:Inter,ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif}.app{max-width:1420px;margin:auto;padding:18px}.shell{background:#fff;border:1px solid var(--line);border-radius:24px;overflow:hidden;box-shadow:var(--shadow)}
.top{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:20px 22px;border-bottom:1px solid var(--line);background:linear-gradient(180deg,#fff,#fbfcfe)}.brand small{font-size:10px;font-weight:900;letter-spacing:.16em;color:#9b4d65}.brand h1{margin:4px 0 0;font-size:25px;color:var(--navy)}.topRight{display:flex;align-items:center;gap:10px}.pill{padding:7px 10px;border-radius:999px;background:#f1f5f9;font-size:11px;font-weight:800;color:#526170}.dot{width:8px;height:8px;border-radius:50%;display:inline-block;background:#45a06f;margin-right:6px}.layout{display:grid;grid-template-columns:minmax(0,1fr) 320px;min-height:720px}.main{min-width:0}.side{border-left:1px solid var(--line);background:#fbfcfe;padding:20px}
.metrics{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;padding:16px 18px;border-bottom:1px solid var(--line)}.metric{border:1px solid var(--line);border-radius:16px;padding:13px 14px;background:#fff}.metric small{font-size:10px;color:var(--muted);font-weight:800}.metric b{display:block;margin-top:4px;font-size:18px;color:var(--navy)}
.calWrap{padding:14px 16px 20px;overflow:auto}.weekbar{display:flex;justify-content:space-between;align-items:center;margin:2px 0 12px}.weekbar b{color:var(--navy);font-size:14px}.weekbar span{font-size:11px;color:var(--muted)}.cal{display:grid;grid-template-columns:64px repeat(5,minmax(130px,1fr));border-top:1px solid var(--line);border-left:1px solid var(--line);min-width:760px}.head,.time,.slot{border-right:1px solid var(--line);border-bottom:1px solid var(--line)}.head{height:46px;display:grid;place-items:center;background:#fbfcfe;font-size:11px;font-weight:850;color:#526170}.time{padding-top:16px;text-align:center;color:#8792a3;font-size:10px;background:#fbfcfe}.slot{min-height:62px;padding:5px;background:#fff}.cell{height:100%;min-height:50px;border-radius:10px;display:flex;flex-direction:column;justify-content:center;padding:8px;cursor:pointer;transition:.12s ease;border:1px solid transparent}.cell:hover{background:#f8fafc}.cell.selected{background:var(--pink);border-color:var(--pinkB);box-shadow:inset 0 0 0 1px #fff}.cell.selected b{color:var(--pinkI)}.cell.confirmed{background:var(--green);border-color:#cce5d2}.cell.confirmed b{color:var(--greenI)}.cell.coach{background:var(--blue);color:#5e7490}.cell b{font-size:11px}.cell small{font-size:9px;color:var(--muted);margin-top:2px}
.sideTitle{font-size:10px;font-weight:900;letter-spacing:.12em;color:#8a96a6;margin-bottom:10px}.studentCard{background:#fff;border:1px solid var(--line);border-radius:18px;padding:16px;margin-bottom:14px}.studentTop{display:flex;align-items:center;gap:12px}.avatar{width:42px;height:42px;border-radius:14px;background:linear-gradient(135deg,#163d68,#2d6ba3);color:#fff;display:grid;place-items:center;font-weight:900}.studentTop h3{margin:0;font-size:17px}.studentTop p{margin:3px 0 0;color:var(--muted);font-size:11px}.status{margin-top:14px;border-top:1px solid var(--line);padding-top:13px;display:flex;justify-content:space-between;align-items:center}.statusLabel{font-size:11px;color:var(--muted)}.statusValue{font-size:11px;font-weight:900;padding:5px 8px;border-radius:999px;background:#f1f5f9}.statusValue.confirmed{background:var(--green);color:var(--greenI)}.statusValue.offered{background:var(--pink);color:var(--pinkI)}
.actionCard{border:1px solid var(--line);background:#fff;border-radius:18px;padding:16px}.actionCard h3{margin:0 0 6px;font-size:15px;color:var(--navy)}.actionCard p{margin:0 0 14px;color:var(--muted);font-size:11px;line-height:1.55}.selectedList{min-height:44px;margin-bottom:12px}.choice{display:flex;justify-content:space-between;align-items:center;background:var(--pink);border:1px solid var(--pinkB);border-radius:10px;padding:8px 10px;font-size:11px;margin-top:6px}.send{width:100%;border:0;background:var(--navy);color:#fff;border-radius:12px;padding:13px;font-weight:850}.send:disabled{opacity:.35}.ghost{width:100%;border:1px solid var(--line);background:#fff;color:#526170;border-radius:12px;padding:10px;font-weight:800;margin-top:8px}.note{margin-top:12px;font-size:10px;line-height:1.55;color:var(--muted)}.toast{position:fixed;right:20px;bottom:20px;background:#102a43;color:#fff;padding:12px 15px;border-radius:12px;font-size:12px;box-shadow:var(--shadow);opacity:0;transform:translateY(8px);transition:.18s}.toast.show{opacity:1;transform:none}.pinGate{display:none;margin-bottom:14px;border:1px dashed #cbd5e1;border-radius:14px;padding:12px;background:#fff}.pinGate input{width:100%;border:1px solid var(--line);border-radius:10px;padding:10px;margin-top:8px}.pinGate button{margin-top:8px;width:100%;border:0;border-radius:10px;padding:10px;background:#173b66;color:#fff;font-weight:800}
@media(max-width:900px){.layout{grid-template-columns:1fr}.side{border-left:0;border-top:1px solid var(--line)}.metrics{grid-template-columns:repeat(2,1fr)}.app{padding:8px}.shell{border-radius:16px}}
</style></head><body><div class="app"><div class="shell"><div class="top"><div class="brand"><small>EDDIE TRAINING · COACH</small><h1>Weekly Schedule</h1></div><div class="topRight"><span class="pill"><span class="dot"></span>LINE connected</span><span class="pill" id="syncPill">Syncing…</span></div></div><div class="layout"><main class="main"><div class="metrics"><div class="metric"><small>STUDENT</small><b id="mStudent">—</b></div><div class="metric"><small>STATUS</small><b id="mStatus">—</b></div><div class="metric"><small>CONFIRMED</small><b id="mConfirmed">—</b></div><div class="metric"><small>LINE PUSH</small><b>Offer only</b></div></div><div class="calWrap"><div class="weekbar"><b>This week</b><span>Tap 1–3 time slots, then Send</span></div><div class="cal" id="calendar"></div></div></main><aside class="side"><div class="sideTitle">CURRENT STUDENT</div><div class="studentCard"><div class="studentTop"><div class="avatar" id="avatar">K</div><div><h3 id="studentName">Kevin</h3><p>LINE paired</p></div></div><div class="status"><span class="statusLabel">This week</span><span class="statusValue" id="statusBadge">Ready</span></div></div><div class="pinGate" id="pinGate"><b>Coach PIN</b><div class="note">Enter once on this device to enable Send.</div><input id="pinInput" type="password" autocomplete="off" placeholder="Coach PIN"><button id="unlockBtn">Unlock</button></div><div class="actionCard"><h3>Offer times</h3><p>Keep it simple: select the times you can offer. Student chooses one in LINE.</p><div class="selectedList" id="selectedList"></div><button class="send" id="sendBtn">Send to LINE</button><button class="ghost" id="clearBtn">Clear selection</button><div class="note">Confirm updates this dashboard automatically. No extra LINE message is sent after confirmation.</div></div></aside></div></div></div><div class="toast" id="toast"></div>
<script>
const D=['Mon','Tue','Wed','Thu','Fri']; const ZH=['週一','週二','週三','週四','週五']; const H=[12,13,14,15,16,17,18,19,20];
let selected=[]; let state=null; let pin=localStorage.getItem('eddie-coach-pin')||'';
const $=id=>document.getElementById(id); const hh=n=>String(n).padStart(2,'0')+':00';
function slotLabel(d,h){return ZH[d]+' '+hh(h)+'–'+hh(h+1)}
function toast(t){const el=$('toast');el.textContent=t;el.classList.add('show');setTimeout(()=>el.classList.remove('show'),2200)}
function renderCal(){let html='<div class="head"></div>'+D.map(x=>'<div class="head">'+x+'</div>').join(''); const conf=state?.schedule?.confirmed||''; for(const h of H){html+='<div class="time">'+hh(h)+'</div>';for(let d=0;d<5;d++){const label=slotLabel(d,h),isSel=selected.includes(label),isConf=conf===label,isCoach=h===18&&!isSel&&!isConf;html+='<div class="slot"><div class="cell '+(isConf?'confirmed':isSel?'selected':isCoach?'coach':'')+'" data-slot="'+label+'"><b>'+(isConf?'Confirmed':isSel?'Selected':isCoach?'Coach time':'')+'</b><small>'+hh(h)+'–'+hh(h+1)+'</small></div></div>'}} $('calendar').innerHTML=html; document.querySelectorAll('[data-slot]').forEach(el=>el.onclick=()=>{const label=el.dataset.slot;if(state?.schedule?.status==='confirmed'&&state.schedule.confirmed===label)return;if(selected.includes(label))selected=selected.filter(x=>x!==label);else if(selected.length<3)selected=[...selected,label];renderCal();renderSelected()})}
function renderSelected(){const box=$('selectedList');box.innerHTML=selected.length?selected.map(x=>'<div class="choice"><span>'+x+'</span><b>✓</b></div>').join(''):'<div class="note">No time selected yet.</div>'; $('sendBtn').disabled=!selected.length||!pin}
function renderState(){const s=state?.student,sc=state?.schedule; const name=s?.name||sc?.name||'—'; $('studentName').textContent=name;$('avatar').textContent=(name[0]||'S').toUpperCase();$('mStudent').textContent=name;$('mStatus').textContent=sc?.status?sc.status[0].toUpperCase()+sc.status.slice(1):'Ready';$('mConfirmed').textContent=sc?.confirmed||'—';const b=$('statusBadge');b.textContent=sc?.status||'Ready';b.className='statusValue '+(sc?.status||'');$('syncPill').textContent='Live'; if(sc?.status==='offered'&&selected.length===0)selected=[...(sc.offers||[])]; renderCal();renderSelected(); $('pinGate').style.display=pin?'none':'block'}
async function refresh(){try{const r=await fetch('/api/dashboard',{cache:'no-store'});state=await r.json();renderState()}catch{$('syncPill').textContent='Offline'}}
$('clearBtn').onclick=()=>{selected=[];renderCal();renderSelected()}; $('unlockBtn').onclick=()=>{const v=$('pinInput').value.trim();if(!v)return;pin=v;localStorage.setItem('eddie-coach-pin',pin);$('pinGate').style.display='none';renderSelected();toast('Coach controls unlocked')};
$('sendBtn').onclick=async()=>{if(!selected.length||!pin)return; $('sendBtn').disabled=true;$('sendBtn').textContent='Sending…';try{const r=await fetch('/api/send-offer',{method:'POST',headers:{'content-type':'application/json','x-eddie-coach-pin':pin},body:JSON.stringify({offers:selected})});const out=await r.json();if(!r.ok){if(r.status===401){pin='';localStorage.removeItem('eddie-coach-pin');$('pinGate').style.display='block';toast('Wrong Coach PIN')}else toast(out.error||'Send failed')}else{toast('Sent to '+out.recipient);await refresh()}}catch{toast('Network error')}finally{$('sendBtn').textContent='Send to LINE';renderSelected()}};
refresh();setInterval(refresh,4000);
</script></body></html>`;
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname === '/') return Response.redirect(`${url.origin}/coach`, 302);
    if (url.pathname === '/coach') return new Response(coachPage(), { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } });
    if (url.pathname === '/health') return json({ ok: true, webhook: true, confirmMode: 'native-form', linePushPolicy: 'offer-only', coachUi: 'v16', storage: 'eddie-kv' });
    if (url.pathname === '/webhook') return handleWebhook(request, env, ctx);
    if (url.pathname === '/line-webhook-config') return publicLineWebhookConfig(request, env);
    if (url.pathname === '/api/dashboard') return dashboardState(env);
    if (url.pathname === '/api/send-offer') return sendOffer(request, env);
    if (url.pathname === '/coach-status') return dashboardState(env);

    if (url.pathname.startsWith('/student/')) {
      const parts = url.pathname.split('/').filter(Boolean);
      const token = parts[1] || '';
      if (!/^[a-f0-9]{48}$/.test(token)) return json({ error: 'invalid link' }, 404);
      if (parts[2] === 'confirm-form') {
        if (request.method !== 'POST') return json({ error: 'method not allowed' }, 405);
        const form = await request.formData().catch(() => null);
        const slot = form ? String(form.get('slot') || '') : '';
        const result = await applyConfirmation(env, token, slot, 'form');
        if (!result.ok) return new Response(`<h2>無法確認</h2><p>${escapeHtml(result.error)}</p>`, { status: result.status, headers: { 'content-type': 'text/html; charset=utf-8' } });
        return Response.redirect(`${url.origin}/student/${token}`, 303);
      }
      if (request.method !== 'GET') return json({ error: 'method not allowed' }, 405);
      const state = await env.EDDIE_KV.get(`portal:${token}`, 'json');
      if (!state) return new Response('This scheduling link has expired.', { status: 404 });
      return new Response(studentPage(state, token), { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } });
    }
    return json({ service: 'Eddie Training', ok: true }, 200);
  }
};