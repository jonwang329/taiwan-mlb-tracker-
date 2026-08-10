const players = [
  { name: "台灣球員 A", role: "Pitcher", org: "MLB / MiLB", status: "WATCH", stats: [["—","ERA"],["—","SO"],["—","IP"]] },
  { name: "台灣球員 B", role: "Position Player", org: "MLB / MiLB", status: "WATCH", stats: [["—","AVG"],["—","HR"],["—","OPS"]] },
  { name: "台灣球員 C", role: "Prospect", org: "MiLB", status: "WATCH", stats: [["—","AVG"],["—","RBI"],["—","SB"]] }
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
      <div class="placeholder">Sample structure only · Live MLB data comes in v0.2</div>
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
