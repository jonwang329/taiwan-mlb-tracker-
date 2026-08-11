(()=>{
const style=document.createElement('link');style.rel='stylesheet';style.href='watchlist.css';document.head.appendChild(style);
const API='https://statsapi.mlb.com/api/v1';
const REPO='jonwang329/taiwan-mlb-tracker-';
const photo=id=>`https://img.mlbstatic.com/mlb-photos/image/upload/w_160,q_auto:best,f_auto/v1/people/${id}/headshot/67/current`;
const $=s=>document.querySelector(s);
const modal=$('#watchlist-modal'), open=$('#manage-players-btn'), close=$('#watchlist-close'), form=$('#player-search-form'), input=$('#player-search'), searchButton=$('#player-search-button'), results=$('#player-search-results'), current=$('#watchlist-current'), status=$('#watchlist-status');
const players=()=>window.trackedPlayers||[];
function issueUrl(action,p){const title=`[watchlist:${action}] playerId=${p.id}`;const body=`Taiwan MLB Tracker observation-list change request.\n\nAction: ${action}\nPlayer ID: ${p.id}\nPlayer: ${p.fullName||p.name||''}\n\nThis request is validated by GitHub Actions before tracked-players.json is changed.`;return `https://github.com/${REPO}/issues/new?title=${encodeURIComponent(title)}&body=${encodeURIComponent(body)}`;}
function renderCurrent(){current.innerHTML=players().map(p=>`<div class="watch-row"><img src="${photo(p.id)}" alt="" loading="lazy"><div><strong>${p.name}</strong><span>${p.org||'MLB / MiLB'} · ${p.role||'—'}</span></div><a class="remove-player" href="${issueUrl('remove',{id:p.id,name:p.name})}" target="_blank" rel="noopener" aria-label="移除 ${p.name}">移除</a></div>`).join('')||'<p class="watch-empty">目前沒有追蹤球員</p>';}
function show(){renderCurrent();modal.hidden=false;document.body.classList.add('modal-open');setTimeout(()=>input.focus(),30)}
function hide(){modal.hidden=true;document.body.classList.remove('modal-open');input.value='';results.innerHTML='';status.textContent=''}
open.addEventListener('click',show);close.addEventListener('click',hide);modal.addEventListener('click',e=>{if(e.target===modal)hide()});document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!modal.hidden)hide()});
let timer;
input.addEventListener('input',()=>{clearTimeout(timer);const q=input.value.trim();results.innerHTML='';status.textContent=q.length&&q.length<2?'請至少輸入 2 個字元':'';if(q.length<2)return;timer=setTimeout(()=>search(q),450)});
form.addEventListener('submit',e=>{e.preventDefault();clearTimeout(timer);search(input.value.trim())});
async function search(q){if(q.length<2){status.textContent='請至少輸入 2 個字元';input.focus();return}searchButton.disabled=true;searchButton.textContent='搜尋中…';status.textContent='搜尋 MLB / MiLB 球員中…';results.innerHTML='';try{
  const urls=[`${API}/sports/1/players?season=${new Date().getFullYear()}&hydrate=currentTeam,primaryPosition`,`${API}/people/search?names=${encodeURIComponent(q)}&hydrate=currentTeam,primaryPosition`];
  const responses=await Promise.allSettled(urls.map(u=>fetch(u).then(r=>{if(!r.ok)throw Error(String(r.status));return r.json()})));
  const all=[];for(const item of responses){if(item.status==='fulfilled')all.push(...(item.value.people||[]))}
  const words=q.toLocaleLowerCase().split(/\s+/).filter(Boolean);const matches=all.filter(p=>{const name=(p.fullName||'').toLocaleLowerCase();return words.every(w=>name.includes(w))});
  const unique=[...new Map(matches.map(p=>[Number(p.id),p])).values()].slice(0,12);
  if(!unique.length)throw new Error('NO_RESULTS');
  status.textContent=`找到 ${unique.length} 位球員，請選擇正確的人`;
  results.innerHTML=unique.map(p=>{const duplicate=players().some(x=>Number(x.id)===Number(p.id));const team=p.currentTeam?.name||'MLB / MiLB';const pos=p.primaryPosition?.abbreviation||p.primaryPosition?.name||'—';return `<div class="search-player"><img src="${photo(p.id)}" alt="" loading="lazy"><div><strong>${p.fullName}</strong><span>${team} · ${pos}</span></div>${duplicate?'<span class="already">已追蹤</span>':`<a class="add-player" href="${issueUrl('add',p)}" target="_blank" rel="noopener">＋ 加入</a>`}</div>`}).join('');
}catch(e){status.textContent=e.message==='NO_RESULTS'?'找不到符合的球員。請輸入英文姓名，例如 Yu-Min Lin。':'MLB / MiLB 搜尋暫時失敗，請再試一次';console.error(e)}finally{searchButton.disabled=false;searchButton.textContent='搜尋'}}
document.addEventListener('tracker:players-loaded',renderCurrent);
})();
