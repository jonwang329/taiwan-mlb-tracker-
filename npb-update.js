(()=>{
  const root=document.getElementById('npb-update');
  if(!root)return;
  const updated='2026-09-17';
  const japanPlayers=[
    {name:'古林睿煬',team:'北海道日本火腿鬥士',role:'投手',level:'支配下 · 一軍/二軍移動',stats:[['7','G'],['12.0','IP'],['15','K'],['7.50','ERA']],note:'NPB 官方一軍資料截至 9/16：7 場、12 局、15K、ERA 7.50。狀態不再用舊的固定「二軍」標籤；按更新會重新載入最新 Asia snapshot。',source:'https://npb.jp/bis/players/93595150.html'},
    {name:'孫易磊',team:'北海道日本火腿鬥士',role:'投手',level:'支配下',stats:[['17','G'],['26.1','IP'],['23','K'],['2.39','ERA']],note:'NPB 官方一軍資料截至 9/16：17 場、26.1 局、23K、ERA 2.39。',source:'https://npb.jp/bis/2026/stats/idp1_f.html'},
    {name:'林安可',team:'埼玉西武獅',role:'野手',level:'支配下',stats:[['.223','AVG'],['52','H'],['8','HR'],['29','RBI']],note:'NPB 官方一軍資料截至 9/17：74 場、233 打數、52 安、8 轟、29 打點。',source:'https://npb.jp/bis/players/33935152.html'},
    {name:'張峻瑋',team:'福岡軟銀鷹',role:'投手',level:'支配下 · 二軍成績',stats:[['12','G'],['50.1','IP'],['47','K'],['2.50','ERA']],note:'NPB 官方二軍資料截至 9/16：12 場、5勝1敗、50.1 局、47K、ERA 2.50；7/30 已轉支配下。',source:'https://npb.jp/bis/2026/stats/idp2_h.html'},
    {name:'陳睦衡',team:'歐力士猛牛',role:'投手',level:'支配下 · 二軍成績',stats:[['7','G'],['23.0','IP'],['13','K'],['1.17','ERA']],note:'NPB 官方二軍資料截至 9/16：7 場、2勝0敗、23 局、13K、ERA 1.17。',source:'https://npb.jp/bis/2026/stats/idp2_b.html'},
    {name:'徐若熙',team:'福岡軟銀鷹',role:'投手',level:'支配下',stats:[['6','G'],['30.2','IP'],['28','K'],['4.99','ERA']],note:'NPB 官方一軍資料截至 9/16：6 場、2勝3敗、30.2 局、28K、ERA 4.99。',source:'https://npb.jp/bis/players/23525152.html'}
  ];
  const koreaPlayers=[
    {name:'王彥程',team:'韓華鷹 Hanwha Eagles',role:'投手',level:'KBO 一軍 · No.19',stats:[['3.52','ERA'],['10-5','W-L'],['120⅓','IP'],['95','K']],note:'KBO 區維持獨立官方 snapshot；不與 MLB / NPB 更新流程互相覆寫。',source:'https://eng.koreabaseball.com/Teams/PlayerInfoPitcher/Summary.aspx?pcode=56719'}
  ];
  const card=p=>`<article class="npb-card"><div class="npb-card-head"><div><span class="npb-role">${p.role}</span><h3>${p.name}</h3><div class="npb-team">${p.team}</div></div><span class="npb-level">${p.level}</span></div><div class="npb-today-line"><small>${p.today?'TODAY':'STATUS'}</small><b>${p.today||p.level}</b></div><div class="npb-stats">${p.stats.map(([v,l])=>`<div class="npb-stat"><b>${v}</b><span>${l}</span></div>`).join('')}</div><p class="npb-note">${p.note}</p><a class="npb-source" href="${p.source}" target="_blank" rel="noopener noreferrer">官方資料 ↗</a></article>`;
  const fmtDate=()=>new Intl.DateTimeFormat('zh-TW',{timeZone:'Asia/Tokyo',month:'numeric',day:'numeric',weekday:'short'}).format(new Date());
  const setHeaderClock=page=>{
    const date=document.getElementById('today-date');
    const zone=document.getElementById('header-timezone');
    if(date)date.textContent=new Intl.DateTimeFormat('zh-TW',{timeZone:page==='asia'?'Asia/Tokyo':'Asia/Taipei',month:'numeric',day:'numeric',weekday:'short'}).format(new Date());
    if(zone)zone.textContent=page==='asia'?'Japan / Korea · UTC+9':'台灣時間';
  };
  const returnButton=document.querySelector('.league-switch-return');
  const toggleButton=document.querySelector('.league-switch-japan');
  if(returnButton)returnButton.remove();

  const rememberAsia=()=>{try{sessionStorage.setItem('tracker-return-asia','1')}catch{}};
  const hardRefreshAsia=()=>{
    rememberAsia();
    const u=new URL(location.href);
    u.searchParams.set('asiaRefresh',String(Date.now()));
    location.replace(u.toString());
  };

  const setPage=page=>{
    const target=page==='asia'?'asia':'mlb';
    document.querySelectorAll('[data-league-page]').forEach(section=>{section.hidden=section.dataset.leaguePage!==target;});
    document.body.dataset.leagueView=target;
    setHeaderClock(target);
    if(toggleButton){
      toggleButton.dataset.leagueSwitch=target==='asia'?'mlb':'asia';
      toggleButton.classList.toggle('league-switch-japan',target==='mlb');
      toggleButton.classList.toggle('league-switch-return',target==='asia');
      toggleButton.innerHTML=target==='asia'?'← MLB / MiLB':'<span aria-hidden="true">🇯🇵</span> Japan <span aria-hidden="true">→</span>';
      toggleButton.setAttribute('aria-pressed','false');
    }
    try{history.replaceState(null,'',target==='asia'?'#today':'#today')}catch{}
  };
  if(toggleButton)toggleButton.addEventListener('click',()=>setPage(toggleButton.dataset.leagueSwitch));

  root.innerHTML=`<section class="asia-country"><div class="npb-meta"><span class="npb-badge">JAPAN · NPB / FARM · ${japanPlayers.length} 位</span><span>官方資料：${updated} · JST</span></div><div class="npb-list">${japanPlayers.map(card).join('')}</div></section><section class="asia-country korea-country"><div class="npb-meta"><span class="npb-badge korea-badge">KOREA · KBO · ${koreaPlayers.length} 位</span><span>獨立官方 snapshot</span></div><div class="npb-list">${koreaPlayers.map(card).join('')}</div></section><p class="npb-disclaimer">Asia 頁獨立於 MLB / MiLB。按「↻ 更新 Asia」會以 cache-busting 方式重新載入最新部署資料；更新失敗時保留最後成功畫面，不清空球員卡。</p>`;

  const title=document.querySelector('.npb-section-title');
  const dateEl=document.getElementById('asia-date');
  if(title&&dateEl&&!document.getElementById('asia-refresh-btn')){
    const tools=document.createElement('div');
    tools.style.cssText='display:flex;align-items:center;gap:8px;flex-wrap:wrap;justify-content:flex-end';
    dateEl.parentNode.insertBefore(tools,dateEl);
    tools.appendChild(dateEl);
    const b=document.createElement('button');
    b.id='asia-refresh-btn';
    b.type='button';
    b.className='league-switch-btn';
    b.textContent='↻ 更新 Asia';
    b.setAttribute('aria-label','立即重新載入日本與韓國最新資料');
    b.addEventListener('click',hardRefreshAsia);
    tools.appendChild(b);
  }

  const globalRefresh=document.getElementById('refresh-btn');
  if(globalRefresh)globalRefresh.addEventListener('click',e=>{
    if(document.body.dataset.leagueView!=='asia')return;
    e.preventDefault();
    e.stopImmediatePropagation();
    hardRefreshAsia();
  },true);

  document.getElementById('asia-player-count').textContent=String(japanPlayers.length+koreaPlayers.length);
  document.getElementById('asia-japan-count').textContent=String(japanPlayers.length);
  document.getElementById('asia-korea-count').textContent=String(koreaPlayers.length);
  document.getElementById('asia-date').textContent=`${fmtDate()} · UTC+9 · 資料 ${updated}`;

  let initial='mlb';
  try{if(sessionStorage.getItem('tracker-return-asia')==='1'){sessionStorage.removeItem('tracker-return-asia');initial='asia'}}catch{}
  setPage(initial);
})();