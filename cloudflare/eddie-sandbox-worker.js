const latestLineUserKey = 'line:latest-user';
const latestWebhookAttemptKey = 'line:webhook:last-attempt';
const coachStateKey = 'coach:current-offer';
const confirmAttemptKey = 'confirm:last-attempt';
const COACH_PIN_SHA256 = '0a4e3e70597a358b9447fa8a647aadf5b76dde95c8e4ab02e5f8cee6caa1cd28'; // PIN 4826

const json = (x, status = 200) => new Response(JSON.stringify(x), {
  status,
  headers: {'content-type':'application/json; charset=utf-8','cache-control':'no-store'}
});
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function b64(v){ try { return Uint8Array.from(atob(v), c => c.charCodeAt(0)); } catch { return null; } }
async function sha256Hex(text){ const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)); return [...new Uint8Array(d)].map(b=>b.toString(16).padStart(2,'0')).join(''); }
async function coachOK(req){ const u=new URL(req.url), pin=req.headers.get('x-eddie-coach-pin')||u.searchParams.get('pin')||''; return !!pin && (await sha256Hex(pin))===COACH_PIN_SHA256; }
async function verifySig(raw,sig,secret){ if(!sig||!secret)return false; const s=b64(sig); if(!s)return false; const k=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['verify']); return crypto.subtle.verify('HMAC',k,s,new TextEncoder().encode(raw)); }
async function profile(env,userId){ if(!env.LINE_CHANNEL_ACCESS_TOKEN||!userId)return null; try{ const r=await fetch('https://api.line.me/v2/bot/profile/'+encodeURIComponent(userId),{headers:{Authorization:'Bearer '+env.LINE_CHANNEL_ACCESS_TOKEN}}); if(!r.ok)return null; const p=await r.json(); return {displayName:p.displayName||'',pictureUrl:p.pictureUrl||''}; }catch{return null;} }
async function pushText(env,userId,text){ if(!env.LINE_CHANNEL_ACCESS_TOKEN||!userId)return{ok:false,status:0}; const r=await fetch('https://api.line.me/v2/bot/message/push',{method:'POST',headers:{Authorization:'Bearer '+env.LINE_CHANNEL_ACCESS_TOKEN,'content-type':'application/json'},body:JSON.stringify({to:userId,messages:[{type:'text',text}]})}); return{ok:r.ok,status:r.status}; }
async function recordLine(env,event){ const userId=event?.source?.userId; if(!userId)return; const key='line:user:'+userId, prev=await env.EDDIE_KV.get(key,'json'), now=new Date().toISOString(), p=event.type==='unfollow'?null:await profile(env,userId); const rec={userId,displayName:p?.displayName||prev?.displayName||'',pictureUrl:p?.pictureUrl||prev?.pictureUrl||'',status:event.type==='unfollow'?'blocked':'active',firstSeenAt:prev?.firstSeenAt||now,lastSeenAt:now,lastEventType:event.type||'unknown'}; await Promise.all([env.EDDIE_KV.put(key,JSON.stringify(rec)),env.EDDIE_KV.put(latestLineUserKey,JSON.stringify(rec))]); }
async function webhook(req,env,ctx){ if(req.method!=='POST')return json({error:'method not allowed'},405); const raw=await req.text(), sig=req.headers.get('x-line-signature')||'', valid=await verifySig(raw,sig,env.LINE_CHANNEL_SECRET); await env.EDDIE_KV.put(latestWebhookAttemptKey,JSON.stringify({receivedAt:new Date().toISOString(),signaturePresent:!!sig,signatureValid:!!valid})); if(!valid)return json({error:'invalid signature'},401); let body; try{body=JSON.parse(raw)}catch{return json({error:'invalid json'},400)} const events=Array.isArray(body.events)?body.events:[]; const work=Promise.all(events.map(e=>recordLine(env,e))); if(events.length&&ctx?.waitUntil)ctx.waitUntil(work); else if(events.length)await work; return json({ok:true,received:events.length}); }
async function lineConfig(req,env){ if(!env.LINE_CHANNEL_ACCESS_TOKEN)return json({ok:false},503); try{ const r=await fetch('https://api.line.me/v2/bot/channel/webhook/endpoint',{headers:{Authorization:'Bearer '+env.LINE_CHANNEL_ACCESS_TOKEN}}), b=await r.json().catch(()=>({})), expected=new URL(req.url).origin+'/webhook'; return json({ok:r.ok,active:b.active===true,endpointMatchesExpected:b.endpoint===expected,httpStatus:r.status},r.ok?200:502); }catch{return json({ok:false},502)} }
function cleanOffers(a){ return [...new Set((Array.isArray(a)?a:[]).map(x=>String(x).trim()).filter(Boolean))].filter(x=>/^週[一二三四五] \d{2}:00–\d{2}:00$/.test(x)).slice(0,3); }

async function sendOffer(req,env){
  if(req.method!=='POST')return json({error:'method not allowed'},405);
  if(!(await coachOK(req)))return json({error:'unauthorized'},401);
  const body=await req.json().catch(()=>({})), offers=cleanOffers(body.offers);
  if(!offers.length)return json({error:'請先選擇至少一個時段'},400);
  const u=await env.EDDIE_KV.get(latestLineUserKey,'json');
  if(!u?.userId||u.status!=='active')return json({error:'目前沒有已連結的 LINE 學員'},409);
  if(body.recipientName&&body.recipientName!==u.displayName)return json({error:'這位學員尚未完成 LINE 綁定；目前可測試的是 '+(u.displayName||'最新學員')},409);
  const token=crypto.randomUUID().replaceAll('-','')+crypto.randomUUID().replaceAll('-','').slice(0,16), now=new Date().toISOString();
  const state={name:u.displayName||'學員',lineUserId:u.userId,status:'offered',offers,confirmed:null,released:[],mode:body.mode||'choices',sessions:Number(body.sessions)||1,linePushPolicy:'offer-only',createdAt:now,updatedAt:now};
  await Promise.all([
    env.EDDIE_KV.put('portal:'+token,JSON.stringify(state),{expirationTtl:604800}),
    env.EDDIE_KV.put(coachStateKey,JSON.stringify({...state,lineUserId:undefined,portalToken:token}))
  ]);
  const url=new URL(req.url).origin+'/student/'+token;
  const text=`Eddie Training｜本週排課\n\nHi ${state.name} 👋\n教練提供以下時間：\n${offers.map(x=>'• '+x).join('\n')}\n\n請點連結選擇並確認：\n${url}`;
  const line=await pushText(env,u.userId,text);
  if(!line.ok){ state.status='send_failed'; state.updatedAt=new Date().toISOString(); await env.EDDIE_KV.put(coachStateKey,JSON.stringify({...state,lineUserId:undefined,portalToken:token})); return json({ok:false,error:'LINE 發送失敗',lineStatus:line.status},502); }
  return json({ok:true,recipient:state.name,offers:state.offers,lineStatus:line.status,linePushPolicy:'offer-only'});
}

async function resetWeek(req,env){
  if(req.method!=='POST')return json({error:'method not allowed'},405);
  if(!(await coachOK(req)))return json({error:'unauthorized'},401);
  const state=await env.EDDIE_KV.get(coachStateKey,'json');
  const ops=[env.EDDIE_KV.delete(coachStateKey),env.EDDIE_KV.delete(confirmAttemptKey)];
  if(state?.portalToken)ops.push(env.EDDIE_KV.delete('portal:'+state.portalToken));
  await Promise.all(ops);
  return json({ok:true,reset:'week',linePairingPreserved:true});
}

async function dash(env){
  const [u,s]=await Promise.all([env.EDDIE_KV.get(latestLineUserKey,'json'),env.EDDIE_KV.get(coachStateKey,'json')]);
  return json({student:u?{name:u.displayName||'學員',status:u.status,lastSeenAt:u.lastSeenAt}:null,schedule:s?{name:s.name,status:s.status,offers:s.offers||[],confirmed:s.confirmed||null,released:s.released||[],mode:s.mode||'choices',sessions:s.sessions||1,updatedAt:s.updatedAt||null}:null,linePushPolicy:'offer-only'});
}

function studentPage(s,token){
  const done=s.status==='confirmed';
  const body=done
    ? `<div class="done"><b>✓ 已確認</b><strong>${esc(s.confirmed)}</strong></div><p>其他候選時間已自動釋放。你已完成，不需要再回覆 LINE。</p>`
    : `<form method="post" action="/student/${token}/confirm-form">${s.offers.map((x,i)=>`<label class="opt"><input type="radio" name="slot" value="${esc(x)}" ${i===0?'required':''}><span>${esc(x)}</span></label>`).join('')}<button>確認這個時間</button></form>`;
  return `<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Eddie Training 學員選課</title><style>
  *{box-sizing:border-box}body{margin:0;background:#f5f7fa;color:#172033;font-family:system-ui,-apple-system,"Segoe UI",sans-serif}.wrap{max-width:620px;margin:auto;padding:24px 16px}.tag{font-size:15px;font-weight:900;color:#8b3d59;letter-spacing:.08em}.card{margin-top:12px;background:#fff;border:1px solid #e3e8ef;border-radius:24px;padding:26px;box-shadow:0 12px 36px #17203312}h1{font-size:34px;margin:0 0 10px;color:#173b66}p{font-size:19px;line-height:1.6;color:#5f6d7e}.opt{display:flex;align-items:center;gap:16px;background:#fff1f5;border:2px solid #e3a4b8;border-radius:18px;padding:20px;margin:14px 0;font-size:24px;font-weight:850}.opt input{width:26px;height:26px}.opt:has(input:checked){background:#fff;outline:4px solid #173b66}button{width:100%;margin-top:18px;border:0;border-radius:16px;padding:19px;background:#173b66;color:#fff;font-size:22px;font-weight:900}.done{background:#edf7ee;border:2px solid #afd3b4;border-radius:18px;padding:22px}.done b{display:block;font-size:20px;color:#477454}.done strong{display:block;font-size:28px;margin-top:6px;color:#244c30}
  </style></head><body><div class="wrap"><div class="tag">EDDIE TRAINING｜學員選課</div><div class="card"><h1>${esc(s.name)}，你好 👋</h1><p>${done?'你的訓練時間已經確認。':'請選擇一個適合你的訓練時間。只有按「確認這個時間」才會正式完成。'}</p>${body}</div></div></body></html>`;
}

async function confirm(env,token,slot,mode){
  const key='portal:'+token, s=await env.EDDIE_KV.get(key,'json');
  await env.EDDIE_KV.put(confirmAttemptKey,JSON.stringify({receivedAt:new Date().toISOString(),mode,linkFound:!!s,slotPresent:!!slot}));
  if(!s)return{ok:false,status:404,error:'排課連結已失效'};
  if(s.status==='confirmed')return{ok:true,state:s};
  if(!slot||!s.offers.includes(slot))return{ok:false,status:400,error:'請先選擇有效時段'};
  const original=[...s.offers];
  s.confirmed=slot; s.released=original.filter(x=>x!==slot); s.offers=[slot]; s.status='confirmed'; s.updatedAt=new Date().toISOString();
  await Promise.all([
    env.EDDIE_KV.put(key,JSON.stringify(s),{expirationTtl:604800}),
    env.EDDIE_KV.put(coachStateKey,JSON.stringify({...s,lineUserId:undefined,portalToken:token}))
  ]);
  return{ok:true,state:s};
}

function errorPage(msg,status=400){ return new Response(`<!doctype html><html lang="zh-Hant"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><body style="font-family:system-ui;padding:28px;font-size:20px"><h2>無法完成</h2><p>${esc(msg)}</p></body></html>`,{status,headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-store'}}); }

function coachPage(){
  const initial=['Jon','Kevin','Amy','Joe',...Array.from({length:16},(_,i)=>'學員 '+String(i+5).padStart(2,'0'))];
  return `<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Eddie 教練排課</title><style>
  :root{--bg:#f5f7fa;--ink:#172033;--muted:#6b7788;--line:#e3e8ef;--blue:#173b66;--blueSoft:#e6f0ff;--blueBorder:#9ebde1;--pink:#ffe5ee;--pinkBorder:#e3a4b8;--pinkInk:#89364f;--green:#eaf7ed;--greenBorder:#9dc9a6;--greenInk:#356243;--gray:#c7cdd5;--warn:#fff4d9;--warnBorder:#e7cf97;--warnInk:#765f27}
  *{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font-family:system-ui,-apple-system,"Segoe UI",sans-serif}.app{max-width:1450px;margin:auto;padding:12px}.shell{background:#fff;border:1px solid var(--line);border-radius:18px;overflow:hidden}.top{padding:14px 18px;background:linear-gradient(135deg,#173b66,#2f6198);color:#fff;display:flex;justify-content:space-between;align-items:center;gap:12px}.top small{font-size:13px;font-weight:900;letter-spacing:.09em}.top h1{margin:3px 0;font-size:29px}.top p{margin:0;font-size:15px;opacity:.9}.topActions{display:flex;align-items:center;gap:8px;flex-wrap:wrap;justify-content:flex-end}.chip{border:1px solid #ffffff66;background:#ffffff12;color:#fff;border-radius:999px;padding:8px 11px;font-size:14px;font-weight:850}.chip.button{cursor:pointer}.chip.unlocked{background:#eaf7ed;color:#356243;border-color:#b9dfc1}.summary{display:flex;gap:24px;padding:10px 16px;border-bottom:1px solid var(--line);font-size:15px;overflow:auto;align-items:center}.summary span{white-space:nowrap}.summary b{font-size:21px;color:var(--blue);margin-left:4px}.legend{margin-left:auto;color:var(--muted);font-size:13px}.dot{display:inline-block;width:10px;height:10px;border-radius:50%;margin-right:5px}.dot.green{background:#42a05a}.dot.pink{background:#d77998}.dot.gray{background:var(--gray)}.toolbar{padding:12px 16px;background:#fbfcfe;border-bottom:1px solid var(--line)}.label{font-size:14px;font-weight:950;color:#526170;margin-bottom:7px}.studentsWrap{overflow:hidden}.students{--cols:11;display:grid;grid-template-columns:repeat(var(--cols),minmax(0,1fr));grid-template-rows:repeat(2,50px);gap:6px}.student,.addStudent{position:relative;border:1px solid var(--line);background:#fff;border-radius:9px;padding:7px 6px;min-width:0;font-size:clamp(11px,1.05vw,15px);font-weight:850;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.student .statusDot{position:absolute;right:5px;top:5px;width:9px;height:9px;border-radius:50%;background:var(--gray);box-shadow:0 0 0 2px #fff}.student.confirmed .statusDot{background:#42a05a}.student.waiting .statusDot{background:#d77998}.student.active{background:var(--pink);border-color:var(--pinkBorder);color:var(--pinkInk);box-shadow:0 0 0 2px #e3a4b833 inset}.addStudent{border:1px dashed var(--blueBorder);background:var(--blueSoft);color:#2e6097}.controls{display:grid;grid-template-columns:minmax(210px,.8fr) minmax(340px,1.45fr) minmax(240px,.95fr);gap:9px;margin-top:10px}.box{border:1px solid var(--line);background:#fff;border-radius:11px;padding:10px}.box small{display:block;font-size:13px;font-weight:900;color:var(--muted);margin-bottom:6px}.box strong{font-size:19px}.statusText{font-size:14px;font-weight:900;margin-left:8px}.statusText.confirmed{color:var(--greenInk)}.statusText.waiting{color:var(--pinkInk)}.statusText.none{color:#8d97a3}.strip{display:flex;gap:6px;flex-wrap:wrap}.mode,.count{border:1px solid var(--line);background:#f7f8fa;border-radius:8px;padding:8px 10px;font-size:15px;font-weight:900;color:#7d8794}.mode.on[data-mode="fixed"]{background:var(--warn);border-color:var(--warnBorder);color:var(--warnInk)}.mode.on[data-mode="choices"]{background:#fff7fa;border-color:var(--pinkBorder);color:var(--pinkInk)}.mode.on[data-mode="free"]{background:var(--green);border-color:var(--greenBorder);color:var(--greenInk)}.count.on{background:var(--blueSoft);border-color:var(--blueBorder);color:#2e6097}.hint{margin-top:8px;padding:8px 10px;border-radius:9px;background:#fff7fa;border:1px solid var(--pinkBorder);font-size:15px}.calendarWrap{padding:10px 14px 14px;overflow:auto}.cal{display:grid;grid-template-columns:68px repeat(5,minmax(136px,1fr));min-width:800px;border-top:1px solid var(--line);border-left:1px solid var(--line)}.head,.time,.slot{border-right:1px solid var(--line);border-bottom:1px solid var(--line)}.head{height:42px;display:grid;place-items:center;font-size:15px;font-weight:900;background:#fbfcfe}.time{padding:14px 4px;text-align:center;font-size:13px;color:var(--muted);background:#fbfcfe}.slot{min-height:58px;padding:4px}.cell{height:100%;min-height:50px;border-radius:8px;padding:7px;display:flex;flex-direction:column;justify-content:center;cursor:pointer;border:1px dashed #d4dde7}.cell b{font-size:14px}.cell small{font-size:11px;color:var(--muted);margin-top:2px}.cell.selected{background:var(--pink);border:1px solid var(--pinkBorder)}.cell.dinner{background:var(--blueSoft);border:1px solid var(--blueBorder);color:#416587}.cell.confirmed{background:var(--green);border:1px solid var(--greenBorder);color:var(--greenInk)}.sendbar{display:flex;align-items:center;gap:9px;padding:10px 14px;border-top:1px solid var(--line);background:#fbfcfe}.selectedText{flex:1;font-size:15px;font-weight:800;color:#526170}.send{border:0;border-radius:10px;background:var(--blue);color:#fff;padding:12px 18px;font-size:17px;font-weight:950}.send:disabled{opacity:.35}.clear{border:1px solid var(--line);background:#fff;border-radius:10px;padding:11px 14px;font-size:15px;font-weight:850}.toast{position:fixed;left:50%;bottom:24px;transform:translateX(-50%);background:#172033;color:#fff;border-radius:999px;padding:12px 18px;font-size:16px;display:none;z-index:50}.toast.show{display:block}.modalBack{display:none;position:fixed;inset:0;background:#0007;align-items:center;justify-content:center;z-index:40;padding:18px}.modalBack.show{display:flex}.modal{width:min(520px,100%);background:#fff;border-radius:20px;padding:22px;box-shadow:0 22px 70px #0004}.modal h2{margin:0 0 6px;color:var(--blue);font-size:27px}.modal p{margin:0 0 15px;color:var(--muted);font-size:16px;line-height:1.55}.modal label{display:block;font-size:16px;font-weight:900;margin-bottom:6px}.modal input{width:100%;border:2px solid var(--line);border-radius:11px;padding:13px;font-size:19px}.modalActions{display:flex;gap:8px;margin-top:17px}.modalActions button{flex:1;border-radius:10px;padding:12px;font-size:16px;font-weight:900;border:1px solid var(--line);background:#fff}.modalActions .primary{background:var(--blue);color:#fff;border-color:var(--blue)}.resetChoice{width:100%;text-align:left;border:1px solid var(--line);background:#fff;border-radius:13px;padding:14px;margin-top:9px;cursor:pointer}.resetChoice b{display:block;font-size:17px;color:var(--ink)}.resetChoice span{display:block;font-size:14px;color:var(--muted);margin-top:3px}.resetChoice.danger{border-color:#e7b7b7;background:#fff8f8}.resetChoice.danger b{color:#9e3e3e}@media(max-width:1000px){.controls{grid-template-columns:1fr 1fr 1fr}.top h1{font-size:25px}.students{gap:4px;grid-template-rows:repeat(2,46px)}.student,.addStudent{padding:5px 4px;font-size:clamp(9px,1.3vw,12px)}}@media(max-width:760px){.controls{grid-template-columns:1fr}.legend{display:none}.app{padding:5px}.top{align-items:flex-start}.topActions{max-width:45%}}
  </style></head><body><div class="app"><div class="shell">
  <div class="top"><div><small>EDDIE TRAINING｜教練專用</small><h1>每週排課</h1><p>學員、排課方式、堂數與週課表全部在同一頁。</p></div><div class="topActions"><span class="chip" id="live">LINE 連線中…</span><button class="chip button" id="lockChip">🔒 教練鎖</button><button class="chip button" id="resetBtn">↺ 重設</button></div></div>
  <div class="summary"><span>學員 <b id="sumTotal">0</b></span><span>已確認 <b id="sumConfirmed">0</b></span><span>待確認 <b id="sumWaiting">0</b></span><span>未排課 <b id="sumNone">0</b></span><span class="legend"><i class="dot green"></i>已確認　<i class="dot pink"></i>待確認　<i class="dot gray"></i>未排課</span></div>
  <div class="toolbar"><div class="label">學員｜固定維持兩行，20–30 人自動縮放</div><div class="studentsWrap"><div class="students" id="students"></div></div>
  <div class="controls"><div class="box"><small>目前學員</small><strong id="selectedStudent">Kevin</strong><span class="statusText none" id="selectedStatus">未排課</span></div><div class="box"><small>排課方式</small><div class="strip"><button class="mode" data-mode="fixed">固定時段</button><button class="mode on" data-mode="choices">教練給選項</button><button class="mode" data-mode="free">自由選空檔</button></div></div><div class="box"><small>每週堂數</small><div class="strip"><button class="count on" data-count="1">1 堂</button><button class="count" data-count="2">2 堂</button><button class="count" data-count="3">3 堂</button></div></div></div><div class="hint" id="hint"></div></div>
  <div class="calendarWrap"><div class="cal" id="cal"></div></div><div class="sendbar"><div class="selectedText" id="selectedText">尚未選擇時間</div><button class="clear" id="clear">清除選取</button><button class="send" id="send" disabled>送出 LINE 排課</button></div></div></div>
  <div class="modalBack" id="addBack"><div class="modal"><h2>新增學員</h2><p>先輸入姓名。LINE 綁定可以之後再完成；最多 30 位，仍維持兩行。</p><label for="newName">學員姓名</label><input id="newName" autocomplete="off" placeholder="例如 Peter"><div class="modalActions"><button id="cancelAdd">取消</button><button class="primary" id="saveAdd">新增學員</button></div></div></div>
  <div class="modalBack" id="pinBack"><div class="modal"><h2>教練安全鎖</h2><p>只有教練操作需要 PIN。這台裝置驗證一次後會記住。</p><label for="pinInput">Coach PIN</label><input id="pinInput" type="password" inputmode="numeric" autocomplete="off" placeholder="輸入 PIN"><div class="modalActions"><button id="cancelPin">取消</button><button class="primary" id="savePin">解鎖</button></div></div></div>
  <div class="modalBack" id="resetBack"><div class="modal"><h2>重設</h2><p>選擇你要清除的範圍。LINE 好友綁定不會被刪除。</p><button class="resetChoice" id="resetWeek"><b>清空本週排課</b><span>清除候選、確認與目前排課；保留學員名單與 Coach PIN。</span></button><button class="resetChoice danger" id="resetDemo"><b>重設畫面測試資料</b><span>本週排課清空，學員格回到預設 20 位。LINE 綁定仍保留。</span></button><div class="modalActions"><button id="cancelReset">取消</button></div></div></div>
  <div class="toast" id="toast"></div>
  <script>
  const DEFAULT=${JSON.stringify(initial)}, D=['週一','週二','週三','週四','週五'], H=[12,13,14,15,16,17,18,19,20];
  let roster=JSON.parse(localStorage.getItem('eddie-coach-roster')||'null')||DEFAULT, selected=[], student=roster.includes('Kevin')?'Kevin':roster[0], mode='choices', sessions=1, state=null, pin=localStorage.getItem('eddie-coach-pin')||'';
  const $=x=>document.getElementById(x), hh=n=>String(n).padStart(2,'0')+':00', label=(d,h)=>D[d]+' '+hh(h)+'–'+hh(h+1);
  function toast(t){$('toast').textContent=t;$('toast').classList.add('show');setTimeout(()=>$('toast').classList.remove('show'),2200)}
  function statusFor(name){const sc=state?.schedule;if(sc?.name!==name)return'none';return sc.status==='confirmed'?'confirmed':sc.status==='offered'?'waiting':'none'}
  function statusLabel(s){return s==='confirmed'?'已確認':s==='waiting'?'待確認':'未排課'}
  function saveRoster(){localStorage.setItem('eddie-coach-roster',JSON.stringify(roster))}
  function updateHint(){const m=mode==='fixed'?'固定時段':mode==='free'?'自由選空檔':'教練給選項';$('hint').textContent=student+'：每週 '+sessions+' 堂，排課方式為「'+m+'」。'+(mode==='choices'?'可先提供 1–3 個候選時段。':mode==='fixed'?'請直接點選固定時段。':'學生將從可用空檔自行選擇。')}
  function renderLock(){$('lockChip').textContent=pin?'🔓 已解鎖':'🔒 教練鎖';$('lockChip').classList.toggle('unlocked',!!pin)}
  function renderSummary(){let c=0,w=0,n=0;for(const x of roster){const s=statusFor(x);if(s==='confirmed')c++;else if(s==='waiting')w++;else n++}$('sumTotal').textContent=roster.length;$('sumConfirmed').textContent=c;$('sumWaiting').textContent=w;$('sumNone').textContent=n;const s=statusFor(student),el=$('selectedStatus');el.textContent=statusLabel(s);el.className='statusText '+s}
  function renderStudents(){const cols=Math.ceil((roster.length+1)/2);$('students').style.setProperty('--cols',cols);$('students').innerHTML=roster.map(n=>'<button class="student '+statusFor(n)+(n===student?' active':'')+'" data-name="'+n.replaceAll('"','&quot;')+'"><span class="statusDot"></span>'+n+'</button>').join('')+'<button class="addStudent" id="addStudent">＋ 新增學員</button>';document.querySelectorAll('.student').forEach(b=>b.onclick=()=>{student=b.dataset.name;selected=[];$('selectedStudent').textContent=student;renderStudents();renderSummary();renderCal();renderSelected();updateHint()});$('addStudent').onclick=()=>{if(roster.length>=30){toast('目前上限 30 位學員');return}$('newName').value='';$('addBack').classList.add('show');setTimeout(()=>$('newName').focus(),50)}}
  function renderCal(){let out='<div class="head"></div>'+D.map(x=>'<div class="head">'+x+'</div>').join('');const confirmed=state?.schedule?.confirmed||'';for(const h of H){out+='<div class="time">'+hh(h)+'</div>';for(let d=0;d<5;d++){const x=label(d,h),sel=selected.includes(x),conf=confirmed===x&&state?.schedule?.name===student,dinner=h===18&&!sel&&!conf;out+='<div class="slot"><div class="cell '+(conf?'confirmed':sel?'selected':dinner?'dinner':'')+'" data-slot="'+x+'"><b>'+(conf?'✓ 已確認':sel?'已選':dinner?'教練晚餐':'可排')+'</b><small>'+hh(h)+'–'+hh(h+1)+'</small></div></div>'}}$('cal').innerHTML=out;document.querySelectorAll('[data-slot]').forEach(el=>el.onclick=()=>{const x=el.dataset.slot;if(selected.includes(x))selected=selected.filter(v=>v!==x);else{const max=mode==='choices'?3:sessions;if(selected.length>=max)selected=selected.slice(1);selected.push(x)}renderCal();renderSelected()})}
  function renderSelected(){$('selectedText').textContent=selected.length?'已選：'+selected.join('、'):'尚未選擇時間';$('send').disabled=!selected.length||student!=='Kevin';renderLock()}
  function renderState(){const sc=state?.schedule;$('live').textContent='● LINE 已連線';if(sc?.name===student&&sc?.status==='offered'&&!selected.length)selected=[...(sc.offers||[])];renderStudents();renderSummary();renderCal();renderSelected()}
  async function refresh(){try{const r=await fetch('/api/dashboard',{cache:'no-store'});state=await r.json();renderState()}catch{$('live').textContent='LINE 狀態未知'}}
  function openPin(){return new Promise(resolve=>{window._pinResolve=resolve;$('pinInput').value='';$('pinBack').classList.add('show');setTimeout(()=>$('pinInput').focus(),50)})}
  async function ensurePin(){if(pin)return true;return await openPin()}
  async function doReset(resetRoster){if(!(await ensurePin()))return;const r=await fetch('/api/reset-week',{method:'POST',headers:{'x-eddie-coach-pin':pin}}),o=await r.json().catch(()=>({}));if(!r.ok){if(r.status===401){pin='';localStorage.removeItem('eddie-coach-pin');renderLock();toast('Coach PIN 不正確')}else toast(o.error||'重設失敗');return}if(resetRoster){roster=[...DEFAULT];saveRoster();student=roster.includes('Kevin')?'Kevin':roster[0]}selected=[];mode='choices';sessions=1;document.querySelectorAll('.mode').forEach(x=>x.classList.toggle('on',x.dataset.mode==='choices'));document.querySelectorAll('.count').forEach(x=>x.classList.toggle('on',x.dataset.count==='1'));$('selectedStudent').textContent=student;$('resetBack').classList.remove('show');await refresh();updateHint();toast(resetRoster?'測試資料已重設':'本週排課已清空')}
  document.querySelectorAll('.mode').forEach(b=>b.onclick=()=>{mode=b.dataset.mode;document.querySelectorAll('.mode').forEach(x=>x.classList.toggle('on',x===b));selected=[];updateHint();renderCal();renderSelected()});
  document.querySelectorAll('.count').forEach(b=>b.onclick=()=>{sessions=+b.dataset.count;document.querySelectorAll('.count').forEach(x=>x.classList.toggle('on',x===b));selected=selected.slice(0,mode==='choices'?3:sessions);updateHint();renderCal();renderSelected()});
  $('clear').onclick=()=>{selected=[];renderCal();renderSelected()};
  $('cancelAdd').onclick=()=>$('addBack').classList.remove('show');
  $('saveAdd').onclick=()=>{const name=$('newName').value.trim();if(!name)return;if(roster.length>=30&&!roster.includes(name)){toast('目前上限 30 位學員');return}if(!roster.includes(name)){roster.push(name);saveRoster()}student=name;$('selectedStudent').textContent=student;$('addBack').classList.remove('show');renderStudents();renderSummary();updateHint();renderCal();renderSelected()};
  $('lockChip').onclick=()=>{if(pin){pin='';localStorage.removeItem('eddie-coach-pin');renderLock();toast('教練鎖已鎖定')}else openPin()};
  $('cancelPin').onclick=()=>{$('pinBack').classList.remove('show');if(window._pinResolve){window._pinResolve(false);window._pinResolve=null}};
  $('savePin').onclick=()=>{const v=$('pinInput').value.trim();if(!v)return;pin=v;localStorage.setItem('eddie-coach-pin',pin);$('pinBack').classList.remove('show');renderLock();if(window._pinResolve){window._pinResolve(true);window._pinResolve=null}toast('此裝置已解鎖')};
  $('resetBtn').onclick=()=>$('resetBack').classList.add('show');$('cancelReset').onclick=()=>$('resetBack').classList.remove('show');
  $('resetWeek').onclick=()=>{if(confirm('確定清空本週排課？學員名單會保留。'))doReset(false)};
  $('resetDemo').onclick=()=>{if(confirm('確定重設畫面測試資料？學員格會回到預設 20 位。'))doReset(true)};
  $('send').onclick=async()=>{if(!selected.length||!(await ensurePin()))return;$('send').disabled=true;$('send').textContent='傳送中…';try{const r=await fetch('/api/send-offer',{method:'POST',headers:{'content-type':'application/json','x-eddie-coach-pin':pin},body:JSON.stringify({recipientName:student,offers:selected,mode,sessions})}),o=await r.json();if(!r.ok){if(r.status===401){pin='';localStorage.removeItem('eddie-coach-pin');renderLock();toast('Coach PIN 不正確')}else toast(o.error||'傳送失敗')}else{toast('已送給 '+o.recipient);await refresh()}}catch{toast('網路錯誤')}finally{$('send').textContent='送出 LINE 排課';renderSelected()}};
  renderStudents();renderSummary();updateHint();renderCal();renderSelected();refresh();setInterval(refresh,4000);
  </script></body></html>`;
}

export default {
  async fetch(req,env,ctx){
    const u=new URL(req.url);
    if(u.pathname==='/'||u.pathname==='/coach')return new Response(coachPage(),{headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-store'}});
    if(u.pathname==='/health')return json({ok:true,webhook:true,confirmMode:'native-form',linePushPolicy:'offer-only',coachUi:'two-row-zh-reset',storage:'eddie-kv'});
    if(u.pathname==='/webhook')return webhook(req,env,ctx);
    if(u.pathname==='/line-webhook-config')return lineConfig(req,env);
    if(u.pathname==='/api/dashboard'||u.pathname==='/coach-status')return dash(env);
    if(u.pathname==='/api/send-offer')return sendOffer(req,env);
    if(u.pathname==='/api/reset-week')return resetWeek(req,env);
    if(u.pathname.startsWith('/student/')){
      const p=u.pathname.split('/').filter(Boolean), token=p[1]||'', action=p[2]||'', key='portal:'+token;
      if(!action&&req.method==='GET'){ const s=await env.EDDIE_KV.get(key,'json'); return s?new Response(studentPage(s,token),{headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-store'}}):errorPage('排課連結已失效',404); }
      if(action==='confirm-form'&&req.method==='POST'){ const form=await req.formData(), r=await confirm(env,token,String(form.get('slot')||''),'form'); if(!r.ok)return errorPage(r.error,r.status); return Response.redirect(new URL(req.url).origin+'/student/'+token,303); }
      if(action==='confirm'&&req.method==='POST'){ const b=await req.json().catch(()=>({})), r=await confirm(env,token,String(b.slot||''),'json'); return r.ok?json({ok:true,status:r.state.status,confirmed:r.state.confirmed}):json({error:r.error},r.status); }
    }
    return json({service:'Eddie Training',ok:true});
  }
};