const latestLineUserKey = 'line:latest-user';
const latestWebhookAttemptKey = 'line:webhook:last-attempt';
const coachLineUserKey = 'line:coach-user';
const coachStateKey = 'coach:student:jon';

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
  } catch {
    return null;
  }
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
    signatureValid: Boolean(valid),
    channelSecretConfigured: Boolean(env.LINE_CHANNEL_SECRET),
    contentType: request.headers.get('content-type') || ''
  }));

  if (!valid) return json({ error: 'invalid signature' }, 401);

  let payload;
  try { payload = JSON.parse(rawBody); }
  catch { return json({ error: 'invalid json' }, 400); }

  const events = Array.isArray(payload.events) ? payload.events : [];
  const work = Promise.all(events.map(event => recordLineEvent(env, event)));
  if (events.length && ctx?.waitUntil) ctx.waitUntil(work);
  else if (events.length) await work;

  return json({ ok: true, received: events.length });
}

async function publicWebhookStatus(env) {
  const [attempt, user, coach] = await Promise.all([
    env.EDDIE_KV.get(latestWebhookAttemptKey, 'json'),
    env.EDDIE_KV.get(latestLineUserKey, 'json'),
    env.EDDIE_KV.get(coachLineUserKey, 'json')
  ]);
  return json({
    webhookReached: Boolean(attempt?.receivedAt),
    receivedAt: attempt?.receivedAt || null,
    signaturePresent: Boolean(attempt?.signaturePresent),
    signatureValid: Boolean(attempt?.signatureValid),
    channelSecretConfigured: Boolean(env.LINE_CHANNEL_SECRET),
    lineTokenConfigured: Boolean(env.LINE_CHANNEL_ACCESS_TOKEN),
    lineUserCaptured: Boolean(user?.userId),
    coachPaired: Boolean(coach?.userId)
  });
}

async function publicLineWebhookConfig(request, env) {
  if (!env.LINE_CHANNEL_ACCESS_TOKEN) return json({ ok: false, reason: 'token-missing' }, 503);
  try {
    const r = await fetch('https://api.line.me/v2/bot/channel/webhook/endpoint', {
      headers: { Authorization: `Bearer ${env.LINE_CHANNEL_ACCESS_TOKEN}` }
    });
    const body = await r.json().catch(() => ({}));
    const expected = `${new URL(request.url).origin}/webhook`;
    return json({
      ok: r.ok,
      active: body.active === true,
      endpointConfigured: Boolean(body.endpoint),
      endpointMatchesExpected: body.endpoint === expected,
      httpStatus: r.status
    }, r.ok ? 200 : 502);
  } catch {
    return json({ ok: false, reason: 'line-api-unreachable' }, 502);
  }
}

function studentPage(state, token) {
  const confirmed = state.status === 'confirmed';
  const body = confirmed
    ? `<div class="confirmed">✓ 已確認<br><strong>${state.confirmed}</strong></div><p class="muted">另一個候選時段已自動釋放，系統也已自動通知教練。</p>`
    : `${state.offers.map(x => `<button class="slot" data-x="${x}">${x}</button>`).join('')}<button class="confirm" id="confirm" disabled>Confirm</button>`;

  return `<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Eddie Training</title><style>body{font-family:system-ui,-apple-system,sans-serif;background:#f5f7fa;margin:0;color:#172033}.wrap{max-width:560px;margin:auto;padding:18px}.card{background:#fff;border-radius:18px;padding:20px;box-shadow:0 8px 28px #0001}.tag{font-size:12px;font-weight:800;color:#8b3d59;letter-spacing:.04em}.slot{display:block;width:100%;text-align:left;padding:15px;margin:10px 0;border:1px solid #e2a9bb;background:#fff1f5;border-radius:12px;font-size:16px}.slot.on{outline:3px solid #173b66}.confirm{width:100%;padding:14px;border:0;border-radius:12px;background:#173b66;color:#fff;font-weight:800;font-size:16px;margin-top:12px}.confirm:disabled{opacity:.4}.confirmed{padding:16px;background:#edf7ee;border-radius:12px;color:#356443;font-weight:700}.muted{color:#6b7788;font-size:13px;line-height:1.6}</style></head><body><div class="wrap"><div class="card"><div class="tag">EDDIE TRAINING · 排課測試</div><h2>Hi ${state.name || 'Jon'} 👋</h2><p class="muted">請選一個 Eddie 教練提供的時段。只有按 Confirm 才會正式確認。</p><div id="app">${body}</div></div></div>${confirmed ? '' : `<script>let chosen='';document.querySelectorAll('.slot').forEach(b=>b.onclick=()=>{chosen=b.dataset.x;document.querySelectorAll('.slot').forEach(x=>x.classList.toggle('on',x===b));document.getElementById('confirm').disabled=false});document.getElementById('confirm').onclick=async()=>{const btn=document.getElementById('confirm');btn.disabled=true;btn.textContent='Confirming…';const r=await fetch('/student/${token}/confirm',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({slot:chosen})});if(!r.ok){btn.disabled=false;btn.textContent='Confirm';alert('確認失敗，請再試一次');return}location.reload()};</script>`}</body></html>`;
}

async function requireNonce(request, env) {
  const nonce = request.headers.get('x-eddie-deploy-nonce') || '';
  return Boolean(nonce && nonce === env.EDDIE_DEPLOY_NONCE);
}

async function pairLatestAsCoach(request, env) {
  if (request.method !== 'POST') return json({ error: 'method not allowed' }, 405);
  if (!(await requireNonce(request, env))) return json({ error: 'unauthorized' }, 401);
  const latest = await env.EDDIE_KV.get(latestLineUserKey, 'json');
  if (!latest?.userId || latest.status !== 'active') return json({ error: 'no active LINE user captured' }, 409);
  const coach = {
    userId: latest.userId,
    displayName: latest.displayName || 'Coach',
    pairedAt: new Date().toISOString()
  };
  await env.EDDIE_KV.put(coachLineUserKey, JSON.stringify(coach));
  return json({ ok: true, coach: coach.displayName, userIdStored: true });
}

async function handleDemoSend(request, env) {
  if (request.method !== 'POST') return json({ error: 'method not allowed' }, 405);
  if (!(await requireNonce(request, env))) return json({ error: 'unauthorized' }, 401);

  const lineUser = await env.EDDIE_KV.get(latestLineUserKey, 'json');
  if (!lineUser?.userId || lineUser.status !== 'active') {
    return json({ error: 'no active LINE student captured yet' }, 409);
  }

  const token = randomToken();
  const now = new Date().toISOString();
  const state = {
    studentId: 'jon',
    name: lineUser.displayName || 'Jon',
    lineUserId: lineUser.userId,
    status: 'offered',
    offers: ['週二 17:00–18:00', '週三 17:00–18:00'],
    confirmed: null,
    released: [],
    createdAt: now,
    updatedAt: now
  };

  await Promise.all([
    env.EDDIE_KV.put(`portal:${token}`, JSON.stringify(state), { expirationTtl: 60 * 60 * 24 * 7 }),
    env.EDDIE_KV.put(coachStateKey, JSON.stringify({ ...state, lineUserId: undefined, portalToken: token }))
  ]);

  const origin = new URL(request.url).origin;
  const studentUrl = `${origin}/student/${token}`;
  const text = `Eddie Training｜排課測試\n\nHi ${state.name} 👋\nEddie 教練提供兩個訓練時段：\n• 週二 17:00–18:00\n• 週三 17:00–18:00\n\n請點下面連結選一個時段並 Confirm：\n${studentUrl}\n\n[EDDIE TEST · STUDENT]`;
  const line = await pushLineText(env, lineUser.userId, text);

  if (!line.ok) {
    state.status = 'send_failed';
    state.updatedAt = new Date().toISOString();
    await env.EDDIE_KV.put(coachStateKey, JSON.stringify({ ...state, lineUserId: undefined, portalToken: token }));
    return json({ ok: false, lineStatus: line.status }, 502);
  }

  return json({ ok: true, recipient: state.name, offerCount: state.offers.length, lineStatus: line.status });
}

async function confirmStudent(request, env, token) {
  const key = `portal:${token}`;
  const state = await env.EDDIE_KV.get(key, 'json');
  if (!state) return json({ error: 'link expired or invalid' }, 404);
  if (state.status === 'confirmed') return json({ ok: true, state: { status: state.status, confirmed: state.confirmed } });

  const body = await request.json().catch(() => ({}));
  if (!state.offers.includes(body.slot)) return json({ error: 'invalid slot' }, 400);

  const originalOffers = [...state.offers];
  state.confirmed = body.slot;
  state.released = originalOffers.filter(x => x !== body.slot);
  state.offers = [body.slot];
  state.status = 'confirmed';
  state.updatedAt = new Date().toISOString();

  await Promise.all([
    env.EDDIE_KV.put(key, JSON.stringify(state), { expirationTtl: 60 * 60 * 24 * 7 }),
    env.EDDIE_KV.put(coachStateKey, JSON.stringify({ ...state, lineUserId: undefined, portalToken: token }))
  ]);

  const studentNotice = state.lineUserId
    ? await pushLineText(env, state.lineUserId, `✅ Eddie Training｜學員確認\n${state.confirmed}\n\n其他候選時段已自動釋放。`)
    : { ok: false, status: 0, reason: 'student-not-paired' };

  const coach = await env.EDDIE_KV.get(coachLineUserKey, 'json');
  const coachNotice = coach?.userId
    ? await pushLineText(env, coach.userId, `🔔 Eddie Training｜教練通知\n\n${state.name} 已確認訓練時段：\n${state.confirmed}\n\n已釋放：${state.released.join('、') || '無'}\n\nCoach Console 狀態已更新為 Confirmed。`)
    : { ok: false, status: 0, reason: 'coach-not-paired' };

  state.studentNotification = studentNotice.ok ? 'sent' : 'failed';
  state.coachNotification = coachNotice.ok ? 'sent' : (coach?.userId ? 'failed' : 'not_paired');
  state.coachNotifiedAt = coachNotice.ok ? new Date().toISOString() : null;
  state.updatedAt = new Date().toISOString();

  await Promise.all([
    env.EDDIE_KV.put(key, JSON.stringify(state), { expirationTtl: 60 * 60 * 24 * 7 }),
    env.EDDIE_KV.put(coachStateKey, JSON.stringify({ ...state, lineUserId: undefined, portalToken: token }))
  ]);

  return json({
    ok: true,
    state: {
      status: state.status,
      confirmed: state.confirmed,
      released: state.released,
      studentNotification: state.studentNotification,
      coachNotification: state.coachNotification
    }
  });
}

async function coachStatus(env) {
  const [s, coach] = await Promise.all([
    env.EDDIE_KV.get(coachStateKey, 'json'),
    env.EDDIE_KV.get(coachLineUserKey, 'json')
  ]);
  if (!s) return json({ status: 'none', coachPaired: Boolean(coach?.userId) });
  return json({
    studentId: s.studentId,
    name: s.name,
    status: s.status,
    offers: s.offers,
    confirmed: s.confirmed,
    released: s.released || [],
    studentNotification: s.studentNotification || null,
    coachNotification: s.coachNotification || null,
    coachNotifiedAt: s.coachNotifiedAt || null,
    coachPaired: Boolean(coach?.userId),
    updatedAt: s.updatedAt
  });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === '/health') return json({
      ok: true,
      webhook: true,
      channelSecretConfigured: Boolean(env.LINE_CHANNEL_SECRET),
      lineTokenConfigured: Boolean(env.LINE_CHANNEL_ACCESS_TOKEN),
      deployNonceConfigured: Boolean(env.EDDIE_DEPLOY_NONCE),
      storage: 'eddie-kv'
    });

    if (url.pathname === '/webhook') return handleWebhook(request, env, ctx);
    if (url.pathname === '/webhook-status') return publicWebhookStatus(env);
    if (url.pathname === '/line-webhook-config') return publicLineWebhookConfig(request, env);
    if (url.pathname === '/internal/pair-latest-as-coach') return pairLatestAsCoach(request, env);
    if (url.pathname === '/internal/send-demo') return handleDemoSend(request, env);
    if (url.pathname === '/coach-status') return coachStatus(env);

    if (url.pathname.startsWith('/student/')) {
      const parts = url.pathname.split('/').filter(Boolean);
      const token = parts[1] || '';
      if (!/^[a-f0-9]{48}$/.test(token)) return json({ error: 'invalid link' }, 404);
      if (parts[2] === 'confirm') {
        if (request.method !== 'POST') return json({ error: 'method not allowed' }, 405);
        return confirmStudent(request, env, token);
      }
      if (request.method !== 'GET') return json({ error: 'method not allowed' }, 405);
      const state = await env.EDDIE_KV.get(`portal:${token}`, 'json');
      if (!state) return new Response('This scheduling link has expired.', { status: 404 });
      return new Response(studentPage(state, token), {
        headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' }
      });
    }

    return json({ service: 'Eddie LINE sandbox', ok: true }, 200);
  }
};
