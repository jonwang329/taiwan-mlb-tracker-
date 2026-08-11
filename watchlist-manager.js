(()=>{
const style=document.createElement('link');style.rel='stylesheet';style.href='watchlist.css';document.head.appendChild(style);
const API='https://statsapi.mlb.com/api/v1';
const WATCHLIST_API=String(window.WATCHLIST_API_URL||'').replace(/\/$/,'');
const SPORT_IDS=[1,11,12,13,14,16];
const photo=id=>`https://img.mlbstatic.com/mlb-photos/image/upload/w_160,q_auto:best,f_auto/v1/people/${id}/headshot/67/current`;
const $=s=>document.querySelector(s);
const modal=$('#watchlist-modal'),open=$('#manage-players-btn'),close=$('#watchlist-close'),form=$('#player-search-form'),input=$('#player-search'),searchButton=$('#player-search-button'),results=$('#player-search-results'),current=$('#watchlist-current'),status=$('#watchlist-status');
const players=()=>window.trackedPlayers||[];
function pin(){let value=sessionStorage.getItem('tracker-owner-pin');if(!value){value=prompt('Owner PIN（只用來授權修改觀察名單）')||'';if(value)sessionStorage.setItem('tracker-owner-pin',value);}return value;}
function clearPin(){sessionStorage.removeItem('tracker-owner-pin');}
async function mutate(action,playerId){
  if(!WATCHLIST_API){status.textContent='Observation List API 尚未完成設定；目前不會跳轉 GitHub。';return;}
  const ownerPin=pin();if(!ownerPin){status.textContent='未輸入 Owner PIN，名單沒有變更。';return;}
  status.textContent=action==='add'?'正在加入球員…':'正在移除球員…';
  try{
    const r=await fetch(`${WATCHLIST_API}/watchlist/${action}`,{method:'POST',headers:{'Content-Type':'application/json','X-Owner-Pin':ownerPin},body:JSON.stringify({playerId:Number(playerId)})});
    const data=await r.json().catch(()=>({}));
    if(r.status===401){clearPin();throw new Error('Owner PIN 不正確，請重新輸入。');}
    if(!r.ok)throw new Error(data.error||`更新失敗 (${r.status})`);
    window.trackedPlayers=data.players||[];
    status.textContent=action==='add'?'已加入觀察名單。':'已從觀察名單移除。';
    renderCurrent();
    results.innerHTML='';input.value='';
    if(typeof window.reloadTrackedPlayers==='function')await window.reloadTrackedPlayers();
  }catch(error){status.textContent=error.message||'更新觀察名單失敗';console.error(error);}
}
function renderCurrent(){current.innerHTML=players().map(p=>`<div class="watch-row"><img src="${photo(p.id)}" alt="" loading="lazy"><div><strong>${p.name}</strong><span>${p.org||'MLB / MiLB'} · ${p.role||'—'}</span></div><button class="remove-player" type="button" data-remove="${p.id}" aria-label="移除 ${p.name}">移除</button></div>`).join('')||'<p class="watch-empty">目前沒有追蹤球員</p>';current.querySelectorAll('[data-remove]').forEach(button=>button.addEventListener('click',()=>mutate('remove',button.dataset.remove)));}
function show(){renderCurrent();modal.hidden=false;document.body.classList.add('modal-open');if(!WATCHLIST_API)status.textContent='名單後端尚未完成設定；搜尋可以使用，但 Add / Delete 暫不會寫入。';setTimeout(()=>input.focus(),30)}
function hide(){modal.hidden=true;document.body.classList.remove('modal-open');input.value='';results.innerHTML='';status.textContent=''}
open.addEventListener('click',show);close.addEventListener('click',hide);modal.addEventListener('click',e=>{if(e.target===modal)hide()});document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!modal.hidden)hide()});
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
  let found=[];
  if(/^\d{5,7}$/.test(q)){try{const direct=await fetchJson(`${API}/people/${q}?hydrate=currentTeam`);found.push(...(direct.people||[]))}catch{}}
  const searches=await Promise.allSettled(queryVariants(q).map(name=>fetchJson(`${API}/people/search?names=${encodeURIComponent(name)}`)));
  for(const item of searches)if(item.status==='fulfilled')found.push(...(item.value.people||[]));
  let matches=[...new Map(found.map(p=>[Number(p.id),p])).values()].filter(p=>nameMatches(p,q));
  if(!matches.length&&!/^\d{5,7}$/.test(q)){status.textContent='擴大搜尋 MLB / MiLB 各層級球員…';matches=(await loadPlayerDirectory()).filter(p=>nameMatches(p,q));}
  if(!matches.length)throw new Error('NO_RESULTS');
  const enriched=await Promise.all(matches.sort((a,b)=>relevance(a,q)-relevance(b,q)).slice(0,12).map(enrichPlayer));
  status.textContent=`找到 ${enriched.length} 位球員，請選擇正確的人`;
  results.innerHTML=enriched.map(p=>{const duplicate=players().some(x=>Number(x.id)===Number(p.id));const team=p.currentTeam?.name||'MLB / MiLB';const pos=p.primaryPosition?.abbreviation||p.primaryPosition?.name||'—';return `<div class="search-player"><img src="${photo(p.id)}" alt="" loading="lazy"><div><strong>${p.fullName}</strong><span>${team} · ${pos} · MLB ID ${p.id}</span></div>${duplicate?'<span class="already">已追蹤</span>':`<button class="add-player" type="button" data-add="${p.id}">＋ 加入</button>`}</div>`}).join('');
  results.querySelectorAll('[data-add]').forEach(button=>button.addEventListener('click',()=>mutate('add',button.dataset.add)));
}catch(e){status.textContent=e.message==='NO_RESULTS'?'找不到符合的球員。可試英文姓名、不同空格/連字號，或直接輸入 MLB Player ID。':(e.message||'MLB / MiLB 搜尋暫時失敗，請再試一次');console.error(e)}finally{searchButton.disabled=false;searchButton.textContent='搜尋'}}
document.addEventListener('tracker:players-loaded',renderCurrent);
})();
