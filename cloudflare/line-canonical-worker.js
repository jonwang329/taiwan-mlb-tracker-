const LINE_STATE_KEY='line-state:v4';
const SNAPSHOT_URL='https://jonwang329.github.io/taiwan-mlb-tracker-/data/dashboard-snapshot.js';
const TAIWAN_TZ='Asia/Taipei';
const FRESH_MS=15*60*1000;
const CRON_SLOTS=new Map([
  ['0 23 * * *',{slot:'07',mode:'morning'}],
  ['0 0 * * *',{slot:'08',mode:'changes'}],
  ['0 1 * * *',{slot:'09',mode:'changes'}],
  ['0 4 * * *',{slot:'12',mode:'final'}],
]);
const num=v=>Number(v||0);
const taiwanDate=(date=new Date())=>new Intl.DateTimeFormat('en-CA',{timeZone:TAIWAN_TZ,year:'numeric',month:'2-digit',day:'2-digit'}).format(date);
const taiwanTime=date=>new Intl.DateTimeFormat('zh-TW',{timeZone:TAIWAN_TZ,hour:'2-digit',minute:'2-digit',hour12:false}).format(date);
function hasAppearance(group,s={}){return group==='pitching'?num(s.battersFaced)>0||num(s.pitchesThrown)>0||num(s.inningsPitched)>0:num(s.plateAppearances)>0||num(s.atBats)>0||num(s.runs)>0||num(s.baseOnBalls)>0||num(s.hitByPitch)>0||num(s.sacFlies)>0||num(s.sacBunts)>0}
function performance(group,s={}){return group==='pitching'?`${s.inningsPitched??'0'} IP · ${s.strikeOuts??0} K · ${s.baseOnBalls??0} BB · ${s.earnedRuns??0} ER`:`${s.hits??0}-${s.atBats??0}${s.plateAppearances!=null?` · ${s.plateAppearances} PA`:''} · ${s.homeRuns??0} HR · ${s.rbi??0} RBI`}
function parseSnapshot(text){const m=text.match(/window\.CENTRAL_DASHBOARD_SNAPSHOT\s*=\s*(.*);\s*$/s);if(!m)throw new Error('canonical snapshot unreadable');const s=JSON.parse(m[1]);if(!Array.isArray(s.players)||!Array.isArray(s.results)||s.players.length!==s.results.length)throw new Error('canonical snapshot invalid');return s}
async function loadSnapshot(now=new Date()){
  const r=await fetch(`${SNAPSHOT_URL}?_=${Date.now()}`,{cache:'no-store',headers:{Accept:'application/javascript','Cache-Control':'no-cache'}});
  if(!r.ok)throw new Error(`canonical snapshot HTTP ${r.status}`);
  const source=parseSnapshot(await r.text());
  const savedAt=Number(source.savedAt||0),ageMs=Date.now()-savedAt,date=taiwanDate(now),fresh=Number.isFinite(ageMs)&&ageMs>=0&&ageMs<=FRESH_MS;
  const players=source.players.map((p,i)=>{const result=source.results[i]||{},today=result.today?.date===date&&hasAppearance(p.group,result.today?.stat||{})?result.today:null;return {...p,played:Boolean(today),today,result};});
  return {source,date,savedAt,ageMs,fresh,players};
}
function activeRows(snapshot){return snapshot.players.filter(p=>p.played).slice(0,8).map(p=>({type:'box',layout:'vertical',margin:'md',spacing:'xs',contents:[{type:'text',text:p.name||String(p.id),weight:'bold',size:'md',color:'#0B1F3A',wrap:true},{type:'text',text:performance(p.group,p.today?.stat||{}),size:'sm',weight:'bold',color:'#111827',wrap:true},{type:'text',text:`${p.today?.live?'LIVE':'MLB verified'} · ${p.today?.level||p.result?.latest?.level||'—'}`,size:'xs',color:'#667085',wrap:true}]}))}
function flex(snapshot,mode){
  const active=snapshot.players.filter(p=>p.played),state=snapshot.fresh?'VERIFIED':'STALE',verified=snapshot.savedAt?taiwanTime(new Date(snapshot.savedAt)):'—';
  const title=mode==='morning'?'早安速報':mode==='final'?'午間日報':'今日出賽更新';
  const status=snapshot.fresh?`MLB VERIFIED · ${verified}`:`STALE · 最後 MLB 驗證 ${verified}`;
  const note=snapshot.fresh?(active.length?`目前確認 ${active.length} 位球員今日已出賽。`:'MLB 已完成最近一次確認；目前沒有已確認的今日出賽。'):'MLB 最新資料尚未完成更新。以下保留最後 verified 資料，請等待下一次官方更新。';
  const rows=activeRows(snapshot);
  return {type:'flex',altText:`Taiwan MLB Tracker ${state}`,contents:{type:'bubble',header:{type:'box',layout:'vertical',backgroundColor:'#071D36',paddingAll:'16px',contents:[{type:'text',text:'TAIWAN MLB TRACKER',size:'xs',weight:'bold',color:'#FFFFFF'},{type:'text',text:title,size:'xl',weight:'bold',color:'#FFFFFF',margin:'sm'},{type:'text',text:status,size:'xs',color:'#D8E7F6',margin:'sm'}]},body:{type:'box',layout:'vertical',paddingAll:'16px',contents:[{type:'text',text:note,size:'sm',color:'#344054',wrap:true},...(rows.length?rows:[{type:'text',text:snapshot.fresh?'NO CONFIRMED APPEARANCE':'WAITING FOR MLB',size:'sm',weight:'bold',color:'#667085',margin:'lg'}])]},footer:{type:'box',layout:'vertical',contents:[{type:'button',style:'link',height:'sm',action:{type:'uri',label:'Open Tracker',uri:'https://jonwang329.github.io/taiwan-mlb-tracker-/'}},{type:'text',text:`Canonical MLB snapshot · ${snapshot.date}`,size:'xxs',color:'#98A2B3',align:'center'}]}}};
}
async function sendLine(env,message){if(!env.LINE_CHANNEL_ACCESS_TOKEN||!env.LINE_DESTINATION_ID)throw new Error('LINE configuration missing');const r=await fetch('https://api.line.me/v2/bot/message/push',{method:'POST',headers:{Authorization:`Bearer ${env.LINE_CHANNEL_ACCESS_TOKEN}`,'Content-Type':'application/json'},body:JSON.stringify({to:env.LINE_DESTINATION_ID,messages:[message]})});if(!r.ok)throw new Error(`LINE push ${r.status}`)}
async function scheduled(controller,env){
  const cfg=CRON_SLOTS.get(controller.cron);if(!cfg){console.log(`[line] ignored cron ${controller.cron}`);return}
  const now=new Date(controller.scheduledTime||Date.now()),date=taiwanDate(now),deliveryKey=`${date}:${cfg.slot}`;
  const state=await env.OBSERVATION_LIST.get(LINE_STATE_KEY,'json')||{};
  if(state.deliveries?.[deliveryKey]){console.log(`[line] ${deliveryKey} already delivered`);return}
  let snapshot;
  try{snapshot=await loadSnapshot(now)}catch(error){snapshot={date,savedAt:Number(state.lastSnapshot?.savedAt||0),fresh:false,players:state.lastSnapshot?.players||[],ageMs:Infinity};console.warn('[line] canonical fetch failed',error)}
  const shouldSend=cfg.mode!=='changes'||snapshot.players.some(p=>p.played);
  if(!shouldSend){console.log(`[line] ${cfg.slot} no confirmed change; no push`);return}
  await sendLine(env,flex(snapshot,cfg.mode));
  const deliveries={...(state.deliveries||{}),[deliveryKey]:new Date().toISOString()};
  await env.OBSERVATION_LIST.put(LINE_STATE_KEY,JSON.stringify({deliveries,lastSnapshot:{savedAt:snapshot.savedAt,players:snapshot.players}}));
  console.log(`[line] ${deliveryKey} sent; canonical fresh=${snapshot.fresh}`);
}
export default {
  async fetch(request,env){const url=new URL(request.url);if(url.pathname==='/health')return Response.json({ok:true,lineScheduler:true,lineConfigured:Boolean(env.LINE_CHANNEL_ACCESS_TOKEN&&env.LINE_DESTINATION_ID),format:'flex-v1',source:'cloudflare-official',dataSource:'canonical-mlb-snapshot',cronTimezone:'Asia/Taipei'});return new Response('Taiwan MLB LINE notifier',{status:200})},
  scheduled,
};
