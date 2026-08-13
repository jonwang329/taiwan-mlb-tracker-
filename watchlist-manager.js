(()=>{
const style=document.createElement('link');style.rel='stylesheet';style.href='watchlist.css?v=20260813-manage-v3';document.head.appendChild(style);
const API='https://statsapi.mlb.com/api/v1';
const SPORT_IDS=[1,11,12,13,14,16];
const OWNER_SESSION='twmlb_owner_password_session';
const LEGACY_KEYS=['twmlb_owner_session_key','twmlb_owner_remembered_key'];
const searchCache=new Map();
let directoryPromise=null;
const photo=id=>`https://img.mlbstatic.com/mlb-photos/image/upload/w_160,q_auto:best,f_auto/v1/people/${id}/headshot/67/current`;
const $=s=>document.querySelector(s);
const modal=$('#watchlist-modal'),open=$('#manage-players-btn'),close=$('#watchlist-close'),form=$('#player-search-form'),input=$('#player-search'),searchButton=$('#player-search-button'),results=$('#player-search-results'),current=$('#watchlist-current'),status=$('#watchlist-status');
const players=()=>window.trackedPlayers||[];
const identities=()=>window.TaiwanPlayerIdentities||{};
let mutationInFlight=false;
for(const key of LEGACY_KEYS){try{sessionStorage.removeItem(key);localStorage.removeItem(key);}catch{}}
function apiUrl(){return String(window.OBSERVATION_API_URL||'').replace(/\/$/,'');}
function ownerPassword(){return sessionStorage.getItem(OWNER_SESSION)||'';}
function setOwnerPassword(value){if(value)sessionStorage.setItem(OWNER_SESSION,value);else sessionStorage.removeItem(OWNER_SESSION);}
function normalize(s){return identities().normalize?identities().normalize(s):String(s||'').toLowerCase().replace(/[-_'’.]/g,' ').replace(/\s+/g,' ').trim();}
function catalogMatch(q){return identities().byName?identities().byName(q):null;}
function displayName(player){return identities().label?identities().label(player):player?.name||player?.fullName||'Unknown player';}
function normalizeNames(list){return identities().apply?identities().apply(list):list;}
function ensureUnlockUI(){
  let box=$('#owner-unlock-box');if(box)return box;
  box=document.createElement('div');box.id='owner-unlock-box';box.className='owner-unlock-box';
  box.innerHTML='<strong>Owner Password</strong><span>輸入你在 GitHub Secret 設定的自訂密碼。</span><div><input id="owner-key-input" type="password" autocomplete="current-password" placeholder="輸入 Owner Password" aria-label="Owner Password"><button id="owner-unlock-btn" type="button">解鎖管理</button></div>';
  form.insertAdjacentElement('beforebegin',box);
  $('#owner-unlock-btn').addEventListener('click',verifyOwner);
  $('#owner-key-input').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();verifyOwner();}});
  return box;
}
function setMutationBusy(busy){mutationInFlight=busy;document.querySelectorAll('[data-watch-action]').forEach(button=>button.disabled=busy);}
function updateOwnerUI(){
  const box=ensureUnlockUI(),unlocked=!!ownerPassword();box.classList.toggle('is-unlocked',unlocked);
  box.querySelector('strong').textContent=unlocked?'Owner mode 已解鎖':'Owner Password';
  box.querySelector('span').textContent=unlocked?'可以直接加入或移除球員。關閉這個瀏覽器 session 後會重新鎖定。':'輸入你在 GitHub Secret 設定的自訂密碼。';
  box.querySelector('div').hidden=unlocked;form.hidden=!unlocked;
  current.querySelectorAll('button.remove-player').forEach(b=>b.disabled=!unlocked||mutationInFlight);
}
async function verifyOwner(){
  const base=apiUrl(),field=$('#owner-key-input'),button=$('#owner-unlock-btn'),password=field?.value.trim();
  if(!base){status.textContent='觀察名單服務尚未連線';return;}if(!password){status.textContent='請輸入 Owner Password';return;}
  button.disabled=true;button.textContent='驗證中…';status.textContent='正在驗證 Owner…';
  try{const r=await fetch(`${base}/owner/verify`,{method:'POST',headers:{Authorization:`Bearer ${password}`,Accept:'application/json'}});if(!r.ok)throw Error('Owner Password 不正確');setOwnerPassword(password);field.value='';status.textContent='✅ Owner mode 已解鎖';updateOwnerUI();}
  catch(e){setOwnerPassword('');status.textContent='驗證失敗：'+e.message;}finally{button.disabled=false;button.textContent='解鎖管理';}
}
async function applyWatchlist(list){if(!Array.isArray(list))return;const normalized=normalizeNames(list);if(typeof window.applyTrackedPlayers==='function')await window.applyTrackedPlayers(normalized);else{window.trackedPlayers=normalized;renderCurrent();document.dispatchEvent(new CustomEvent('tracker:players-loaded',{detail:normalized}));}}
async function updateWatchlist(action,id){
  const base=apiUrl(),password=ownerPassword();if(mutationInFlight)return;if(!base){status.textContent='觀察名單服務尚未連線';return;}if(!password){status.textContent='請先輸入 Owner Password';updateOwnerUI();return;}
  status.textContent=action==='add'?'正在加入球員…':'正在移除球員…';setMutationBusy(true);
  try{const r=await fetch(action==='add'?`${base}/players`:`${base}/players/${id}`,{method:action==='add'?'POST':'DELETE',headers:{Authorization:`Bearer ${password}`,'Content-Type':'application/json',Accept:'application/json'},body:action==='add'?JSON.stringify({id:Number(id)}):undefined});const payload=await r.json().catch(()=>({}));if(r.status===401){setOwnerPassword('');updateOwnerUI();throw Error('Owner Password 已失效，請重新輸入');}if(!r.ok)throw Error(payload.error||`更新失敗 (${r.status})`);await applyWatchlist(payload.players||players());if(action==='add')results.innerHTML='';status.textContent=payload.alreadyTracked?'✅ 球員已經在觀察名單中':payload.alreadyRemoved?'✅ 球員已經不在觀察名單中':action==='add'?'✅ 已加入；網站與 LINE 已同步':'✅ 已移除；網站與 LINE 已同步';}
  catch(e){status.textContent='更新失敗：'+e.message;console.error(e);}finally{setMutationBusy(false);updateOwnerUI();}
}
function renderCurrent(){const normalized=normalizeNames(players());window.trackedPlayers=normalized;current.innerHTML=normalized.map(p=>`<div class="watch-row"><img src="${photo(p.id)}" alt="" loading="lazy"><div><strong>${displayName(p)}</strong><span>${p.org||'MLB / MiLB'} · ${p.role||'—'}</span></div><button class="remove-player" type="button" data-watch-action="remove" data-player-id="${p.id}" aria-label="移除 ${displayName(p)}">移除</button></div>`).join('')||'<p class="watch-empty">目前沒有追蹤球員</p>';updateOwnerUI();}
function show(){renderCurrent();modal.hidden=false;document.body.classList.add('modal-open');status.textContent=ownerPassword()?'Owner mode 已解鎖，可直接管理名單。':'請輸入 Owner Password；朋友只能查看。';setTimeout(()=>ownerPassword()?input.focus():$('#owner-key-input')?.focus(),30)}
function hide(){modal.hidden=true;document.body.classList.remove('modal-open');input.value='';results.innerHTML='';status.textContent='';}
open.addEventListener('click',show);close.addEventListener('click',hide);modal.addEventListener('click',e=>{if(e.target===modal)hide()});document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!modal.hidden)hide()});
current.addEventListener('click',e=>{const b=e.target.closest('[data-watch-action="remove"]');if(b&&!b.disabled)updateWatchlist('remove',b.dataset.playerId)});
results.addEventListener('click',e=>{const b=e.target.closest('[data-watch-action="add"]');if(b&&!b.disabled)updateWatchlist('add',b.dataset.playerId)});
let timer;input.addEventListener('input',()=>{clearTimeout(timer);const q=input.value.trim();results.innerHTML='';status.textContent=q.length&&q.length<2?'請至少輸入 2 個字元':'';if(q.length<2)return;timer=setTimeout(()=>search(q),220)});form.addEventListener('submit',e=>{e.preventDefault();clearTimeout(timer);search(input.value.trim())});
async function fetchJson(url){const r=await fetch(url,{headers:{Accept:'application/json'},cache:'no-store'});if(!r.ok)throw Error(`MLB API ${r.status}`);return r.json();}
async function enrich(id){const data=await fetchJson(`${API}/people/${id}?hydrate=currentTeam`);return data.people?.[0]||null;}
function isEligiblePlayer(p){return Boolean(p&&p.active!==false&&(p.currentTeam?.id||identities().identify?.(p)));}
function queryVariants(q){const known=catalogMatch(q),base=known?.en||q.trim(),clean=normalize(base),parts=clean.split(' ').filter(Boolean),set=new Set([base,clean,...(known?.aliases||[])]);if(parts.length>1){set.add(parts.join('-'));set.add([...parts].reverse().join(' '));}return {known,variants:[...set].filter(Boolean)};}
async function activeDirectory(){
  if(directoryPromise)return directoryPromise;
  const season=new Date().getUTCFullYear();
  directoryPromise=Promise.allSettled(SPORT_IDS.map(id=>fetchJson(`${API}/sports/${id}/players?season=${season}`))).then(calls=>{
    const all=[];for(const call of calls)if(call.status==='fulfilled')all.push(...(call.value.people||[]));
    return [...new Map(all.filter(p=>p?.id).map(p=>[Number(p.id),p])).values()];
  }).catch(e=>{directoryPromise=null;throw e;});
  return directoryPromise;
}
async function directoryMatches(q){
  const n=normalize(q);if(n.length<2)return[];
  const directory=await activeDirectory();
  const hits=directory.filter(p=>normalize(p.fullName||p.name).includes(n)).slice(0,20);
  const enriched=await Promise.all(hits.map(p=>enrich(p.id).catch(()=>p)));
  return enriched.filter(Boolean);
}
async function findPlayers(q){
  const {known,variants}=queryVariants(q),found=[];
  if(known?.id){const direct=await enrich(known.id).catch(()=>null);if(direct)found.push(direct);}
  if(/^\d{5,7}$/.test(q)){const direct=await enrich(Number(q)).catch(()=>null);if(direct)found.push(direct);}
  const calls=await Promise.allSettled(variants.map(name=>fetchJson(`${API}/people/search?names=${encodeURIComponent(name)}&hydrate=currentTeam`)));
  for(const call of calls)if(call.status==='fulfilled')found.push(...(call.value.people||[]));
  let unique=[...new Map(found.filter(p=>p?.id).map(p=>[Number(p.id),p])).values()];
  let eligible=unique.filter(isEligiblePlayer);
  const partialQuery=!/\s/.test(normalize(q));
  if(partialQuery||!eligible.length){const fallback=await directoryMatches(q).catch(()=>[]);unique=[...new Map([...unique,...fallback].filter(p=>p?.id).map(p=>[Number(p.id),p])).values()];eligible=unique.filter(p=>isEligiblePlayer(p)||fallback.some(f=>Number(f.id)===Number(p.id)));}
  return eligible;
}
async function search(q){
  if(q.length<2){status.textContent='請至少輸入 2 個字元';return;}const cacheKey=normalize(q);if(searchCache.has(cacheKey)){renderMatches(searchCache.get(cacheKey));return;}
  searchButton.disabled=true;searchButton.textContent='搜尋中…';status.textContent='搜尋 MLB / MiLB 現役球員…';results.innerHTML='';
  try{const matches=await findPlayers(q);searchCache.set(cacheKey,matches);renderMatches(matches);}catch(e){status.textContent='MLB / MiLB 搜尋暫時失敗，請再試一次';console.error(e);}finally{searchButton.disabled=false;searchButton.textContent='搜尋';}
}
function renderMatches(matches){
  if(!matches.length){status.textContent='找不到符合的 MLB / MiLB 現役球員。';results.innerHTML='';return;}
  status.textContent=`找到 ${matches.length} 位符合球員`;
  results.innerHTML=matches.slice(0,12).map(p=>{const duplicate=players().some(x=>Number(x.id)===Number(p.id)),name=displayName(p),team=p.currentTeam?.name||'MLB / MiLB system',pos=p.primaryPosition?.abbreviation||p.primaryPosition?.name||'—';return `<div class="search-player"><img src="${photo(p.id)}" alt="" loading="lazy"><div><strong>${name}</strong><span>${team} · ${pos} · MLB ID ${p.id}</span></div>${duplicate?'<span class="already">已追蹤</span>':`<button class="add-player" type="button" data-watch-action="add" data-player-id="${p.id}">＋ 加入</button>`}</div>`;}).join('');
}
document.addEventListener('tracker:players-loaded',renderCurrent);
})();
