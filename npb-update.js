(()=>{
  const root=document.getElementById('npb-update');
  if(!root)return;
  const updated='2026-08-29';
  const players=[
    {name:'古林睿煬',team:'北海道日本火腿鬥士',role:'投手',level:'一軍',stats:[['7','G'],['12.0','IP'],['15','K'],['7.50','ERA']],note:'目前以一軍投手成績為主；今年三振能力仍明顯，但保送與失分偏高。',source:'https://npb.jp/bis/players/93595150.html'},
    {name:'孫易磊',team:'北海道日本火腿鬥士',role:'投手',level:'一軍',stats:[['13','G'],['22.0','IP'],['20','K'],['2.45','ERA']],note:'今年一軍表現明顯進步；2勝1敗、4中繼，適合持續觀察角色與控球。',source:'https://npb.jp/bis/players/83785159.html'},
    {name:'林安可',team:'埼玉西武獅',role:'野手',level:'一軍',stats:[['.237','AVG'],['.313','OBP'],['7','HR'],['27','RBI']],note:'固定追蹤打擊輸出；重點看安打、長打、上壘率與三振/保送趨勢。',source:'https://npb.jp/bis/players/33935152.html'},
    {name:'張峻瑋',team:'福岡軟銀鷹',role:'投手',level:'支配下 / 二軍',stats:[['12','G'],['50.1','IP'],['47','K'],['2.50','ERA']],note:'7/30 由育成升為支配下；目前以二軍成績與升上一軍進度最值得追蹤。',source:'https://npb.jp/bis/2026/stats/idp2_h.html'},
    {name:'陳睦衡',team:'歐力士猛牛',role:'投手',level:'支配下 / 二軍',stats:[['4','G'],['13.2','IP'],['9','K'],['2','W']],note:'7/30 由育成升為支配下；先追蹤二軍出賽、局數與是否取得一軍登錄。',source:'https://npb.jp/announcement/2026/registered_b.html'},
    {name:'徐若熙',team:'福岡軟銀鷹',role:'投手',level:'一軍',stats:[['6','G'],['30.2','IP'],['28','K'],['4.99','ERA']],note:'目前一軍2勝3敗；先觀察先發穩定度、三振與保送，以及後續輪值位置。',source:'https://npb.jp/bis/players/23525152.html'},
    {name:'王彥程',team:'東北樂天金鷲',role:'投手',level:'Roster / No. 017',stats:[['P','POS'],['L/L','B/T'],['017','NO.'],['—','NPB G']],note:'回歸 Japan 追蹤頁。NPB 官方目前仍列為樂天投手，尚無一軍 NPB 出賽紀錄；不以 MLB / MiLB 格式混放。',source:'https://npb.jp/bis/eng/players/43745138.html'}
  ];
  const fmtDate=timeZone=>new Intl.DateTimeFormat('zh-TW',{timeZone,month:'numeric',day:'numeric',weekday:'short'}).format(new Date());
  const setHeaderClock=page=>{
    const date=document.getElementById('today-date');
    const zone=document.getElementById('header-timezone');
    if(date)date.textContent=fmtDate(page==='japan'?'Asia/Tokyo':'Asia/Taipei');
    if(zone)zone.textContent=page==='japan'?'日本時間 JST':'台灣時間';
  };
  const setPage=page=>{
    const target=page==='japan'?'japan':'mlb';
    document.querySelectorAll('[data-league-page]').forEach(section=>{section.hidden=section.dataset.leaguePage!==target;});
    document.querySelectorAll('[data-league-switch]').forEach(button=>{
      const active=button.dataset.leagueSwitch===target;
      button.classList.toggle('active',active);
      button.setAttribute('aria-pressed',active?'true':'false');
    });
    document.body.dataset.leagueView=target;
    setHeaderClock(target);
    try{history.replaceState(null,'',target==='japan'?'#japan':'#today');}catch{}
  };
  document.querySelectorAll('[data-league-switch]').forEach(button=>button.addEventListener('click',()=>setPage(button.dataset.leagueSwitch)));
  root.innerHTML=`<div class="npb-meta"><span class="npb-badge">NPB / FARM · ${players.length} 位台灣球員</span><span>官方資料 snapshot：${updated} · JST</span></div><div class="npb-list">${players.map(p=>`<article class="npb-card"><div class="npb-card-head"><div><span class="npb-role">${p.role}</span><h3>${p.name}</h3><div class="npb-team">${p.team}</div></div><span class="npb-level">${p.level}</span></div><div class="npb-today-line"><small>STATUS</small><b>${p.level}</b></div><div class="npb-stats">${p.stats.map(([v,l])=>`<div class="npb-stat"><b>${v}</b><span>${l}</span></div>`).join('')}</div><p class="npb-note">${p.note}</p><a class="npb-source" href="${p.source}" target="_blank" rel="noopener noreferrer">NPB 官方資料 ↗</a></article>`).join('')}</div><p class="npb-disclaimer">Japan 頁與 MLB / MiLB 共用同一套乾淨資訊層級，但資料來源與時區分開。Japan 顯示日本時間 JST；不把 NPB 球員混進旅美 Today / Quick Scoreboard。</p>`;
  const pitcherCount=players.filter(p=>p.role==='投手').length;
  const hitterCount=players.filter(p=>p.role==='野手').length;
  document.getElementById('npb-player-count').textContent=String(players.length);
  document.getElementById('npb-pitcher-count').textContent=String(pitcherCount);
  document.getElementById('npb-hitter-count').textContent=String(hitterCount);
  document.getElementById('npb-date').textContent=`${fmtDate('Asia/Tokyo')} · JST`;
  setPage(location.hash==='#japan'?'japan':'mlb');
})();