(()=>{
const style=document.createElement('link');style.rel='stylesheet';style.href='watchlist.css?v=20260812-system';document.head.appendChild(style);
const API='https://statsapi.mlb.com/api/v1';
const SPORT_IDS=[1,11,12,13,14,16];
const OWNER_SESSION='twmlb_owner_session_key';
const photo=id=>`https://img.mlbstatic.com/mlb-photos/image/upload/w_160,q_auto:best,f_auto/v1/people/${id}/headshot/67/current`;
const $=s=>document.querySelector(s);
const modal=$('#watchlist-modal'), open=$('#manage-players-btn'), close=$('#watchlist-close'), form=$('#player-search-form'), input=$('#player-search'), searchButton=$('#player-search-button'), results=$('#player-search-results'), current=$('#watchlist-current'), status=$('#watchlist-status');
const players=()=>window.trackedPlayers||[];
let mutationInFlight=false;
function apiUrl(){return String(window.OBSERVATION_API_URL||'').replace(/\/$/,'');}
function ownerKey(){return sessionStorage.getItem(OWNER_SESSION)||'';}
function setOwnerKey(value){if(value)sessionStorage.setItem(OWNER_SESSION,value);else sessionStorage.removeItem(OWNER_SESSION);}
function ensureUnlockUI(){
  let box=$('#owner-unlock-box');
  if(box)return box;
  box=document.createElement('div');box.id='owner-unlock-box';box.className='owner-unlock-box';
  box.innerHTML='<strong>Owner mode</strong><span>只有你可以修改觀察名單。此驗證只保留在目前瀏覽器 session。</span><div><input id="owner-key-input" type="password" autocomplete="current-password" placeholder="輸入 Owner Key"><button id="owner-unlock-btn" type="button">解鎖管理</button></div>';
  form.insertAdjacentElement('beforebegin',box);
  $('#owner-unlock-btn').addEventListener('click',verifyOwner);
  $('#owner-key-input').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();verifyOwner();}});
  return box;
}
function setMutationBusy(busy){mutationInFlight=busy;document.querySelectorAll('[data-watch-action]').forEach(button=>{button.disabled=busy||(!ownerKey()&&button.dataset.watchAction==='remove')});}
function updateOwnerUI(){
  const box=ensureUnlockUI();
  const unlocked=!!ownerKey();
  box.classList.toggle('is-unlocked',unlocked);
  box.querySelector('strong').textContent=unlocked?'Owner mode 已解鎖':'Owner mode';
  box.querySelector('span').textContent=unlocked?'你可以直接加入或移除球員。關閉瀏覽器後會自動鎖定。':'只有你可以修改觀察名單。此驗證只保留在目前瀏覽器 session。';
  box.querySelector('div').hidden=unlocked;
  form.hidden=!unlocked;
  current.querySelectorAll('button.remove-player').forEach(b=>b.disabled=!unlocked||mutationInFlight);
}
async function verifyOwner(){
  const base=apiUrl(), field=$('#owner-key-input'), button=$('#owner-unlock-btn');
  const key=field?.value.trim();
  if(!base){status.textContent='觀察名單服務尚未連線';return;}
  if(!key){status.textContent='請輸入 Owner Key';return;}
  button.disabled=true;button.textContent='驗證中…';status.textContent='正在驗證 Owner…';
  try{
    const response=await fetch(`${base}/owner/verify`,{method:'POST',headers:{Authorization:`Bearer ${key}`,Accept:'application/json'}});
    if(!response.ok)throw new Error('Owner Key 不正確');
    setOwnerKey(key);field.value='';status.textContent='✅ Owner mode 已解鎖';updateOwnerUI();
  }catch(e){setOwnerKey('');status.textContent='驗證失敗：'+e.message;}
  finally{button.disabled=false;button.textContent='解鎖管理';}
}
async function applyWatchlist(list){
  if(!Array.isArray(list))return;
  if(typeof window.applyTrackedPlayers==='function')await window.applyTrackedPlayers(list);
  else{window.trackedPlayers=list;renderCurrent();document.dispatchEvent(new CustomEvent('tracker:players-loaded',{detail:list}));}
}
async function updateWatchlist(action,id){
  const base=apiUrl(), key=ownerKey();
  if(mutationInFlight)return;
  if(!base){status.textContent='觀察名單服務尚未連線';return;}
  if(!key){status.textContent='請先解鎖 Owner mode';updateOwnerUI();return;}
  status.textContent=action==='add'?'正在加入球員…':'正在移除球員…';setMutationBusy(true);
  try{
    const response=await fetch(action==='add'?`${base}/players`:`${base}/players/${id}`,{method:action==='add'?'POST':'DELETE',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json',Accept:'application/json'},body:action==='add'?JSON.stringify({id:Number(id)}):undefined});
    const payload=await response.json().catch(()=>({}));
    if(response.status===401){setOwnerKey('');updateOwnerUI();throw new Error('Owner 驗證已失效，請重新解鎖');}
    if(!response.ok)throw new Error(payload.error||`更新失敗 (${response.status})`);
    await applyWatchlist(payload.players||players());
    if(action==='add')results.innerHTML='';
    status.textContent=payload.alreadyTracked?'✅ 球員已經在觀察名單中':payload.alreadyRemoved?'✅ 球員已經不在觀察名單中':action==='add'?'✅ 已加入，網站與 LINE 共用名單已更新':'✅ 已移除，網站與 LINE 共用名單已更新';
  }catch(e){status.textContent='更新失敗：'+e.message;console.error(e);}
  finally{setMutationBusy(false);updateOwnerUI();}
}
function renderCurrent(){current.innerHTML=players().map(p=>`<div class="watch-row"><img src="${photo(p.id)}" alt="" loading="lazy"><div><strong>${p.name}</strong><span>${p.org||'MLB / MiLB'} · ${p.role||'—'}</span></div><button class="remove-player" type="button" data-watch-action="remove" data-player-id="${p.id}" aria-label="移除 ${p.name}">移除</button></div>`).join('')||'<p class="watch-empty">目前沒有追蹤球員</p>';updateOwnerUI();}
function show(){renderCurrent();modal.hidden=false;document.body.classList.add('modal-open');status.textContent=ownerKey()?'Owner mode 已解鎖，可直接管理名單。':'請先解鎖 Owner mode；朋友只能查看，不能修改。';setTimeout(()=>ownerKey()?input.focus():$('#owner-key-input')?.focus(),30)}
function hide(){modal.hidden=true;document.body.classList.remove('modal-open');input.value='';results.innerHTML='';status.textContent=''}
open.addEventListener('click',show);close.addEventListener('click',hide);modal.addEventListener('click',e=>{if(e.target===modal)hide()});document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!modal.hidden)hide()});
current.addEventListener('click',e=>{const b=e.target.closest('[data-watch-action="remove"]');if(b&&!b.disabled)updateWatchlist('remove',b.dataset.playerId)});
results.addEventListener('click',e=>{const b=e.target.closest('[data-watch-action="add"]');if(b&&!b.disabled)updateWatchlist('add',b.dataset.playerId)});
let timer;
input.addEventListener('input',()=>{clearTimeout(timer);const q=input.value.trim();results.innerHTML='';status.textContent=q.length&&q.length<2?'請至少輸入 2 個字元':'';if(q.length<2)return;timer=setTimeout(()=>search(q),450)});
form.addEventListener('submit',e=>{e.preventDefault();clearTimeout(timer);search(input.value.trim())});
const normalize=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[-_'’.]/g,' ').replace(/[^a-z0-9 ]/g,' ').replace(/\s+/g,' ').trim();
function queryVariants(q){const clean=normalize(q),parts=clean.split(' ').filter(Boolean),variants=new Set([q.trim(),clean]);if(parts.length>1){variants.add(parts.join('-'));variants.add([...parts].reverse().join(' '));}return [...variants].filter(Boolean);}
async function fetchJson(url){const r=await fetch(url,{headers:{Accept:'application/json'}});if(!r.ok)throw Error(`MLB API ${r.status}`);return r.json();}
async function enrichPlayer(p){try{const data=await fetchJson(`${API}/people/${p.id}?hydrate=currentTeam`);return data.people?.[0]||p}catch{return p}}
function relevance(p,q){const name=normalize(p.fullName),needle=normalize(q);if(name===needle)return 0;if(name.startsWith(needle))return 1;if(name.includes(needle))return 2;const words=needle.split(' ').filter(Boolean);return words.every(w=>name.includes(w))?3:9;}
function nameMatches(p,q){const name=normalize(p.fullName),needle=normalize(q),words=needle.split(' ').filter(Boolean);return name===needle||words.every(w=>name.includes(w));}
let directoryCachePromise;
async function loadPlayerDirectory(){if(!directoryCachePromise){const season=new Date().getFullYear();directoryCachePromise=Promise.allSettled(SPORT_IDS.map(id=>fetchJson(`${API}/sports/${id}/players?season=${season}`))).then(items=>{const all=[];for(const item of items)if(item.status==='fulfilled')all.push(...(item.value.people||[]));return [...new Map(all.map(p=>[Number(p.id),p])).values()];});}return directoryCachePromise;}
async function search(q){if(q.length<2){status.textContent='請至少輸入 2 個字元';input.focus();return}searchButton.disabled=true;searchButton.textContent='搜尋中…';status.textContent='搜尋 MLB / MiLB 球員中…';results.innerHTML='';try{
  let found=[];if(/^\d{5,7}$/.test(q)){try{const direct=await fetchJson(`${API}/people/${q}?hydrate=currentTeam`);found.push(...(direct.people||[]))}catch{}}
  const variants=queryVariants(q);const searches=await Promise.allSettled(variants.map(name=>fetchJson(`${API}/people/search?names=${encodeURIComponent(name)}`)));for(const item of searches)if(item.status==='fulfilled')found.push(...(item.value.people||[]));
  let matches=[...new Map(found.map(p=>[Number(p.id),p])).values()].filter(p=>nameMatches(p,q));if(!matches.length&&!/^\d{5,7}$/.test(q)){status.textContent='擴大搜尋 MLB / MiLB 各層級球員…';const directory=await loadPlayerDirectory();matches=directory.filter(p=>nameMatches(p,q));}
  if(!matches.length)throw new Error('NO_RESULTS');const enriched=await Promise.all(matches.sort((a,b)=>relevance(a,q)-relevance(b,q)).slice(0,12).map(enrichPlayer));status.textContent=`找到 ${enriched.length} 位球員，請選擇正確的人`;
  results.innerHTML=enriched.map(p=>{const duplicate=players().some(x=>Number(x.id)===Number(p.id));const team=p.currentTeam?.name||'MLB / MiLB';const pos=p.primaryPosition?.abbreviation||p.primaryPosition?.name||'—';return `<div class="search-player"><img src="${photo(p.id)}" alt="" loading="lazy"><div><strong>${p.fullName}</strong><span>${team} · ${pos} · MLB ID ${p.id}</span></div>${duplicate?'<span class="already">已追蹤</span>':`<button class="add-player" type="button" data-watch-action="add" data-player-id="${p.id}">＋ 加入</button>`}</div>`}).join('');
}catch(e){status.textContent=e.message==='NO_RESULTS'?'找不到符合的球員。可試英文姓名、不同空格/連字號，或直接輸入 MLB Player ID。':'MLB / MiLB 搜尋暫時失敗，請再試一次';console.error(e)}finally{searchButton.disabled=false;searchButton.textContent='搜尋'}}
document.addEventListener('tracker:players-loaded',renderCurrent);
})();
