const players = [
  { name: "鄧愷威 Kai-Wei Teng", role: "RHP · Pitcher", org: "Houston Astros", status: "MLB", stats: [["2026","Season"],["RHP","Throws"],["HOU","Org"]], note: "2026 開幕名單台灣投手；v0.3 將接即時 MLB Stats API。" },
  { name: "李灝宇 Hao-Yu Lee", role: "Infielder", org: "Detroit Tigers", status: "TRACK", stats: [["INF","Pos"],["DET","Org"],["23","Age*"]], note: "Tigers prospect；2026 年已進入大聯盟焦點追蹤名單。" },
  { name: "林維恩 Wei-En Lin", role: "LHP · Pitcher", org: "Athletics", status: "PROSPECT", stats: [["LHP","Throws"],["ATH","Org"],["2028","ETA"]], note: "Athletics 高潛力台灣左投；2026 年因 Tommy John surgery 賽季提前結束。" },
  { name: "賴謙凡 Chien-Fan Lai", role: "RHP · Pitcher", org: "New York Yankees", status: "NEW", stats: [["RHP","Throws"],["NYY","Org"],["18","Age*"]], note: "2026 年 6 月與 Yankees 簽約，開始美職生涯。" }
];

function renderPlayers(){
  const root=document.querySelector('#players');
  root.innerHTML=players.map(player=>`
    <article class="player-card">
      <div class="player-top">
        <div><p>${player.org}</p><h3>${player.name}</h3><p>${player.role}</p></div>
        <span class="status">${player.status}</span>
      </div>
      <div class="stats">${player.stats.map(([value,label])=>`<div class="stat"><b>${value}</b><span>${label}</span></div>`).join('')}</div>
      <div class="placeholder">${player.note}</div>
    </article>`).join('');
  document.querySelector('#player-count').textContent=players.length;
}

document.querySelector('#refresh-btn').addEventListener('click',()=>{
  renderPlayers();
  const button=document.querySelector('#refresh-btn');
  button.textContent='已重新整理 ✓';
  setTimeout(()=>button.textContent='重新整理',1200);
});

renderPlayers();
