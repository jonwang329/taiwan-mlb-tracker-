(()=>{
  const root=document.getElementById('npb-update');
  if(!root)return;
  const updated='2026-08-31';
  const japanPlayers=[
    {name:'古林睿煬',team:'北海道日本火腿鬥士',role:'投手',level:'一軍',stats:[['7','G'],['12.0','IP'],['15','K'],['7.50','ERA']],note:'目前以一軍投手成績為主；今年三振能力仍明顯，但保送與失分偏高。',source:'https://npb.jp/bis/players/93595150.html'},
    {name:'孫易磊',team:'北海道日本火腿鬥士',role:'投手',level:'一軍',stats:[['13','G'],['22.0','IP'],['20','K'],['2.45','ERA']],note:'今年一軍表現明顯進步；2勝1敗、4中繼，適合持續觀察角色與控球。',source:'https://npb.jp/bis/players/83785159.html'},
    {name:'林安可',team:'埼玉西武獅',role:'野手',level:'一軍',stats:[['.237','AVG'],['.313','OBP'],['7','HR'],['27','RBI']],note:'固定追蹤打擊輸出；重點看安打、長打、上壘率與三振/保送趨勢。',source:'https://npb.jp/bis/players/33935152.html'},
    {name:'張峻瑋',team:'福岡軟銀鷹',role:'投手',level:'支配下 / 二軍',stats:[['12','G'],['50.1','IP'],['47','K'],['2.50','ERA']],note:'7/30 由育成升為支配下；目前以二軍成績與升上一軍進度最值得追蹤。',source:'https://npb.jp/bis/2026/stats/idp2_h.html'},
    {name:'陳睦衡',team:'歐力士猛牛',role:'投手',level:'支配下 / 二軍',stats:[['4','G'],['13.2','IP'],['9','K'],['2','W']],note:'7/30 由育成升為支配下；先追蹤二軍出賽、局數與是否取得一軍登錄。',source:'https://npb.jp/announcement/2026/registered_b.html'},
    {name:'徐若熙',team:'福岡軟銀鷹',role:'投手',level:'一軍',stats:[['6','G'],['30.2','IP'],['28','K'],['4.99','ERA']],note:'目前一軍2勝3敗；先觀察先發穩定度、三振與保送，以及後續輪值位置。',source:'https://npb.jp/bis/players/23525152.html'}
  ];
  const koreaPlayers=[
    {name:'王彥程',team:'韓華鷹 Hanwha Eagles',role:'投手',level:'KBO 一軍 · No.19',stats:[['3.52','ERA'],['10-5','W-L'],['120⅓','IP'],['95','K']],today:'08/18 vs KIA · 5 IP · 7 H · 3 ER · 2 BB · 3 K',note:'KBO 官方 2026：23場、10勝5敗、WHIP 1.45、7 QS；ERA 3.52 目前列全 KBO 第 4。此卡只讀官方 KBO 成績，不影響 MLB / NPB 更新流程。',source:'https://eng.koreabaseball.com/Teams/PlayerInfoPitcher/Summary.aspx?pcode=56719'}
  ];
  const card=p=>`<article class="npb-card"><div class="npb-card-head"><div><span class="npb-role">${p.role}</span><h3>${p.name}</h3><div class="npb-team">${p.team}</div></div><span class="npb-level">${p.level}</span></div><div class="npb-today-line"><small>${p.today?'RECENT':'STATUS'}</small><b>${p.today||p.level}</b></div><div class="npb-stats">${p.stats.map(([v,l])=>`<div class="npb-stat"><b>${v}</b><span>${l}</span></div>`).join('')}</div><p class="npb-note">${p.note}</p><a class="npb-source" href="${p.source}" target="_blank" rel="noopener noreferrer">官方資料 ↗</a></article>`;
  const fmtDate=()=>new Intl.DateTimeFormat('zh-TW',{timeZone:'Asia/Tokyo',month:'numeric',day:'numeric',weekday:'short'}).format(new Date());
  const setHeaderClock=page=>{
    const date=document.getElementById('today-date');
    const zone=document.getElementById('header-timezone');
    if(date)date.textContent=new Intl.DateTimeFormat('zh-TW',{timeZone:page==='asia'?'Asia/Tokyo':'Asia/Taipei',month:'numeric',day:'numeric',weekday:'short'}).format(new Date());
    if(zone)zone.textContent=page==='asia'?'Japan / Korea · UTC+9':'台灣時間';
  };
  const setPage=page=>{
    const target=page==='asia'?'asia':'mlb';
    document.querySelectorAll('[data-league-page]').forEach(section=>{section.hidden=section.dataset.leaguePage!==target;});
    document.querySelectorAll('[data-league-switch]').forEach(button=>{
      const active=button.dataset.leagueSwitch===target;
      button.classList.toggle('active',active);
      button.setAttribute('aria-pressed',active?'true':'false');
    });
    document.body.dataset.leagueView=target;
    setHeaderClock(target);
    try{history.replaceState(null,'',target==='asia'?'#asia':'#today');}catch{}
  };
  document.querySelectorAll('[data-league-switch]').forEach(button=>button.addEventListener('click',()=>setPage(button.dataset.leagueSwitch)));
  root.innerHTML=`<section class="asia-country"><div class="npb-meta"><span class="npb-badge">JAPAN · NPB / FARM · ${japanPlayers.length} 位</span><span>官方 snapshot：${updated} · JST</span></div><div class="npb-list">${japanPlayers.map(card).join('')}</div></section><section class="asia-country korea-country"><div class="npb-meta"><span class="npb-badge korea-badge">KOREA · KBO · ${koreaPlayers.length} 位</span><span>官方 snapshot：${updated} · KST</span></div><div class="npb-list">${koreaPlayers.map(card).join('')}</div></section><p class="npb-disclaimer">Asia 頁把 Japan 與 Korea 放在同一個乾淨頁面，不增加額外分頁。日本與韓國同為 UTC+9；兩邊各自使用 NPB / KBO 官方資料。</p>`;
  document.getElementById('asia-player-count').textContent=String(japanPlayers.length+koreaPlayers.length);
  document.getElementById('asia-japan-count').textContent=String(japanPlayers.length);
  document.getElementById('asia-korea-count').textContent=String(koreaPlayers.length);
  document.getElementById('asia-date').textContent=`${fmtDate()} · UTC+9`;
  setPage(location.hash==='#asia'?'asia':'mlb');
})();