(() => {
  const n=v=>Number(v||0);
  const esc=v=>String(v??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const pct=v=>Number.isFinite(v)?`${(v*100).toFixed(1)}%`:'—';
  const avg=(h,ab)=>ab>0?(h/ab).toFixed(3).replace(/^0/,''):'—';
  const rate=(x,pa)=>pa>0?x/pa:null;

  function recentRows(result,count=5){return (result?.games||[]).slice(0,count);}

  function hitterRead(result){
    const rows=recentRows(result,5), season=result?.season||{};
    const totals=rows.reduce((a,g)=>{
      const s=g?.stat||{};
      a.h+=n(s.hits);a.ab+=n(s.atBats);a.hr+=n(s.homeRuns);a.bb+=n(s.baseOnBalls);a.so+=n(s.strikeOuts);
      a.pa+=n(s.plateAppearances)||n(s.atBats)+n(s.baseOnBalls)+n(s.hitByPitch)+n(s.sacFlies)+n(s.sacBunts);
      return a;
    },{h:0,ab:0,hr:0,bb:0,so:0,pa:0});
    const recentAvg=totals.ab?totals.h/totals.ab:null;
    const recentK=rate(totals.so,totals.pa), recentBB=rate(totals.bb,totals.pa);
    const seasonK=rate(n(season.strikeOuts),n(season.plateAppearances));
    const seasonBB=rate(n(season.baseOnBalls),n(season.plateAppearances));

    let trend='近期樣本仍小，先看打席品質，不用過度解讀單場結果。';
    if(totals.ab>=8){
      if(recentAvg>=.300)trend=`近 5 場擊球狀態偏熱，AVG ${avg(totals.h,totals.ab)}。`;
      else if(recentAvg<=.200)trend=`近 5 場安打偏少，AVG ${avg(totals.h,totals.ab)}。`;
      else trend=`近 5 場表現大致平穩，AVG ${avg(totals.h,totals.ab)}。`;
    }

    let meaning='從現有數據看，打席品質沒有明顯單一訊號，先觀察選球與三振。';
    if(recentK!=null&&seasonK!=null&&recentK>seasonK+.05)meaning=`近期 K% ${pct(recentK)} 高於球季水準，打席可能較容易落入不利球數。`;
    else if(recentBB!=null&&seasonBB!=null&&recentBB>seasonBB+.03)meaning=`近期 BB% ${pct(recentBB)} 高於球季水準，選球耐心是正面訊號。`;
    else if(totals.hr>=2)meaning=`近 5 場已有 ${totals.hr} HR，長打輸出正在增加。`;
    else if(season.ops!=null)meaning=`球季 OPS ${season.ops}；目前更適合用 BB/K、K% 與長打一起判斷打席品質。`;

    let watch='接下來看 BB/K、K% 與長打能否一起改善。';
    if(recentK!=null&&seasonK!=null&&recentK>seasonK+.05)watch='接下來最值得看 K% 是否回落，同時 BB 能否維持。';
    else if(recentBB!=null&&seasonBB!=null&&recentBB>seasonBB+.03)watch='接下來看較好的選球能否轉化成更多安打或長打。';
    return {trend,meaning,watch};
  }

  function inningsOuts(value){
    const text=String(value??'0');
    const [wholeRaw,fracRaw='0']=text.split('.');
    const whole=Number(wholeRaw)||0, frac=Number(fracRaw)||0;
    return whole*3+Math.max(0,Math.min(2,frac));
  }

  function pitcherRead(result){
    const rows=recentRows(result,5), season=result?.season||{};
    const totals=rows.reduce((a,g)=>{
      const s=g?.stat||{};
      a.outs+=inningsOuts(s.inningsPitched);a.er+=n(s.earnedRuns);a.bb+=n(s.baseOnBalls);a.so+=n(s.strikeOuts);a.h+=n(s.hits);
      return a;
    },{outs:0,er:0,bb:0,so:0,h:0});
    const ip=totals.outs/3, era=totals.outs?totals.er*27/totals.outs:null, k9=totals.outs?totals.so*27/totals.outs:null, bb9=totals.outs?totals.bb*27/totals.outs:null;
    const kbb=totals.bb?totals.so/totals.bb:(totals.so?Infinity:null);

    let trend='近期登板樣本仍小，先看三振、保送與失分方向。';
    if(totals.outs>=9){
      if(era<=3)trend=`近 5 次登板壓制力不錯，ERA ${era.toFixed(2)}。`;
      else if(era>=5)trend=`近 5 次登板失分偏多，ERA ${era.toFixed(2)}。`;
      else trend=`近 5 次登板整體大致穩定，ERA ${era.toFixed(2)}。`;
    }

    let meaning='從現有數據看，暫時沒有單一指標足以定義投球策略。';
    if(k9!=null&&k9>=10)meaning=`近期 K/9 ${k9.toFixed(1)}，三振能力是最明顯的武器。`;
    else if(bb9!=null&&bb9>=4.5)meaning=`近期 BB/9 ${bb9.toFixed(1)}，控球是目前最需要觀察的部分。`;
    else if(kbb!=null&&kbb>=3)meaning=`近期 K/BB ${Number.isFinite(kbb)?kbb.toFixed(1):'∞'}，解決打者的效率不錯。`;
    else if(season.era!=null)meaning=`球季 ERA ${season.era}；現階段較適合一起看 K、BB 與失分，而不是猜配球。`;

    let watch='接下來看 K/BB 與每次登板的失分能否同步穩定。';
    if(bb9!=null&&bb9>=4.5)watch='接下來先看 BB 是否下降，同時三振能力能否保留。';
    else if(k9!=null&&k9>=10)watch='接下來看高三振率能否在不增加保送的情況下維持。';
    return {trend,meaning,watch};
  }

  function insightFor(player,result){return player?.group==='pitching'?pitcherRead(result):hitterRead(result);}

  function renderOne(player,result){
    const card=document.querySelector(`#player-${player.id}`);if(!card||!result)return;
    card.querySelector('.ai-insight')?.remove();
    const read=insightFor(player,result),section=document.createElement('section');
    section.className='ai-insight';
    section.innerHTML=`<div class="ai-insight-head"><span>AI INSIGHT</span><small>20-sec read · data-based v1</small></div><div class="ai-insight-row"><b>Trend</b><p>${esc(read.trend)}</p></div><div class="ai-insight-row"><b>What it may mean</b><p>${esc(read.meaning)}</p></div><div class="ai-insight-row"><b>Watch next</b><p>${esc(read.watch)}</p></div><small class="ai-insight-note">依 MLB / MiLB 官方 box score、近況與球季數據產生；屬資料推論，不假設未觀測到的配球或教練策略。</small>`;
    const anchor=card.querySelector('.today-detail');
    if(anchor)anchor.insertAdjacentElement('afterend',section);else card.appendChild(section);
  }

  function renderAll(){
    if(typeof players==='undefined'||typeof lastResults==='undefined')return;
    const ps=Array.isArray(players)?players:[],rs=Array.isArray(lastResults)?lastResults:[];
    ps.forEach((p,i)=>renderOne(p,rs[i]));
  }

  document.addEventListener('tracker:players-loaded',()=>renderAll());
  renderAll();
})();
