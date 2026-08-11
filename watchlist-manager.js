(()=>{
const API='https://statsapi.mlb.com/api/v1';
const REPO='jonwang329/taiwan-mlb-tracker-';
const photo=id=>`https://img.mlbstatic.com/mlb-photos/image/upload/w_160,q_auto:best,f_auto/v1/people/${id}/headshot/67/current`;
const $=s=>document.querySelector(s);
const modal=$('#watchlist-modal'), open=$('#manage-players-btn'), close=$('#watchlist-close'), input=$('#player-search'), results=$('#player-search-results'), current=$('#watchlist-current'), status=$('#watchlist-status');
const players=()=>window.trackedPlayers||[];
function issueUrl(action,p){const title=`[watchlist:${action}] playerId=${p.id}`;const body=`Taiwan MLB Tracker observation-list change request.\n\nAction: ${action}\nPlayer ID: ${p.id}\nPlayer: ${p.fullName||p.name||''}\n\nThis request is validated by GitHub Actions before tracked-players.json is changed.`;return `https://github.com/${REPO}/issues/new?title=${encodeURIComponent(title)}&body=${encodeURIComponent(body)}`;}
function renderCurrent(){current.innerHTML=players().map(p=>`<div class="watch-row"><img src="${photo(p.id)}" alt="" loading="lazy"><div><strong>${p.name}</strong><span>${p.org||'MLB / MiLB'} · ${p.role||'—'}</span></div><a class="remove-player" href="${issueUrl('remove',{id:p.id,name:p.name})}" target="_blank" rel="noopener" aria-label="移除 ${p.name}">移除</a></div>`).join('')||'<p class="watch-empty">目前沒有追蹤球員</p>';}
function show(){renderCurrent();modal.hidden=false;document.body.classList.add('modal-open');setTimeout(()=>input.focus(),30)}
function hide(){modal.hidden=true;document.body.classList.remove('modal-open');input.value='';results.innerHTML='';status.textContent=''}
open.addEventListener('click',show);close.addEventListener('click',hide);modal.addEventListener('click',e=>{if(e.target===modal)hide()});document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!modal.hidden)hide()});
let timer;
input.addEventListener('input',()=>{clearTimeout(timer);const q=input.value.trim();results.innerHTML='';status.textContent='';if(q.length<2)return;timer=setTimeout(()=>search(q),280)});
async function search(q){status.textContent='搜尋 MLB 球員中…';try{const r=await fetch(`${API}/people/search?names=${encodeURIComponent(q)}`);if(!r.ok)throw Error('MLB search unavailable');const data=await r.json();const found=(data.people||[]).slice(0,8);status.textContent=found.length?'選擇正確的球員':'找不到符合的 MLB / MiLB 球員';results.innerHTML=found.map(p=>{const duplicate=players().some(x=>Number(x.id)===Number(p.id));return `<div class="search-player"><img src="${photo(p.id)}" alt="" loading="lazy"><div><strong>${p.fullName}</strong><span>${p.currentTeam?.name||p.primaryPosition?.name||'MLB / MiLB'}${p.primaryPosition?.abbreviation?` · ${p.primaryPosition.abbreviation}`:''}</span></div>${duplicate?'<span class="already">已追蹤</span>':`<a class="add-player" href="${issueUrl('add',p)}" target="_blank" rel="noopener">＋ 加入</a>`}</div>`}).join('')}catch(e){status.textContent='搜尋失敗，請稍後重新整理再試';console.error(e)}}
document.addEventListener('tracker:players-loaded',renderCurrent);
})();
