import fs from 'node:fs';

const path='cloudflare/eddie-sandbox-worker-v3.js';
let s=fs.readFileSync(path,'utf8');
function rep(oldText,newText,label){
  if(!s.includes(oldText)) throw new Error('hotfix target missing: '+label);
  s=s.replace(oldText,newText);
}

rep(
"offers=normalizeCoachDraft(s.draftSlots,s.mode,s.sessions);if(offers.length!==s.sessions)return json({error:'這位學員每週 '+s.sessions+' 堂，請先選滿 '+s.sessions+' 個時段'},400);",
"offers=normalizeCoachDraft(s.draftSlots,s.mode,s.sessions);if(s.mode==='fixed'&&offers.length!==s.sessions)return json({error:'固定時段請選滿 '+s.sessions+' 個時段'},400);if(s.mode==='choices'&&(offers.length<s.sessions||offers.length>3))return json({error:'教練給選項請選 '+s.sessions+'–3 個候選時段'},400);",
'send choices count');

rep(
"教練已安排以下 ${s.sessions} 個時段：",
"教練提供以下候選時間（本週需確認 ${s.sessions} 堂）：",
'line wording');
rep(
"請確認教練安排的 ${sessions} 堂時間。",
"請從教練提供的候選時間中選擇 ${sessions} 堂。",
'student wording');

rep(
"let state=null,students=[],studentId=null,selected=[],pin=localStorage.getItem('eddie-coach-pin')||'',draftBusy=false;",
"let state=null,students=[],studentId=null,selected=[],pin=localStorage.getItem('eddie-coach-pin')||'',dirty=new Set(),draftTimer=null,persistChain=Promise.resolve(),lastEditAt=0;",
'ui state');

rep(
"document.querySelectorAll('.student').forEach(b=>b.onclick=()=>{studentId=b.dataset.id;selected=[...(current()?.draftSlots||[])];renderAll()});",
"document.querySelectorAll('.student').forEach(b=>b.onclick=()=>{void flushDrafts();studentId=b.dataset.id;selected=[...(current()?.draftSlots||[])];lastEditAt=Date.now();renderAll()});",
'student switch');

rep(
"let title=mineC?'✓ 已確認':c?'✓ '+c.name:blocked?(hold.type==='fixed'?'固定｜':'保留｜')+hold.name:mineH?'已選｜'+s.name:sel?'已選':dinner?'教練晚餐':'可排';",
"let title=mineC?'✓ 已確認':c?'✓ '+c.name:blocked?(hold.type==='fixed'?'固定｜':'保留｜')+hold.name:mineH?'× 已選｜'+s.name:sel?'× 已選':dinner?'教練晚餐':'○ 可排';",
'circle cross labels');

const oldClick="document.querySelectorAll('[data-slot]').forEach(el=>el.onclick=async()=>{const s=current();if(!s||draftBusy)return;if(s.status==='confirmed'){toast('本週已確認，不能直接改動');return}if(el.dataset.blocked==='true'){toast('這個時段已被其他學員佔用');return}if(s.mode==='free'){toast('自由選空檔由學生從剩餘時段選擇');return}const x=el.dataset.slot;let next=[...selected];if(next.includes(x))next=next.filter(v=>v!==x);else{if(next.length>=s.sessions)next=next.slice(1);next.push(x)}await saveDraft(next)})";
const newClick="document.querySelectorAll('[data-slot]').forEach(el=>el.onclick=()=>{const s=current();if(!s)return;if(s.status==='confirmed'){toast('本週已確認，不能直接改動');return}if(el.dataset.blocked==='true'){toast('這個時段已被其他學員佔用');return}if(s.mode==='free'){toast('自由選空檔由學生從剩餘時段選擇');return}const x=el.dataset.slot,max=s.mode==='choices'?3:s.sessions;let next=[...selected];if(next.includes(x))next=next.filter(v=>v!==x);else{if(next.length>=max)next=next.slice(1);next.push(x)}applyLocalDraft(s,next)})";
rep(oldClick,newClick,'instant calendar click');

rep(
"if(s?.mode!=='free')okay=okay&&selected.length===s.sessions;",
"if(s?.mode==='fixed')okay=okay&&selected.length===s.sessions;if(s?.mode==='choices')okay=okay&&selected.length>=s.sessions&&selected.length<=3;",
'send readiness');

const oldRefresh="async function refresh(){try{const keep=studentId;const r=await fetch('/api/dashboard',{cache:'no-store'});state=await r.json();students=state.students||[];if(keep&&students.some(x=>x.id===keep))studentId=keep;else if(!studentId||!students.some(x=>x.id===studentId))studentId=students.find(x=>x.name==='Kevin')?.id||students[0]?.id;const s=current();selected=[...(s?.draftSlots||[])];renderAll();$('live').textContent='● LINE 已連線'}catch{$('live').textContent='LINE 狀態未知'}}";
const newRefresh="async function refresh(force=false){if(!force&&(dirty.size||draftTimer))return;try{const keep=studentId;const r=await fetch('/api/dashboard',{cache:'no-store'});state=await r.json();students=state.students||[];if(keep&&students.some(x=>x.id===keep))studentId=keep;else if(!studentId||!students.some(x=>x.id===studentId))studentId=students.find(x=>x.name==='Kevin')?.id||students[0]?.id;const s=current();selected=[...(s?.draftSlots||[])];renderAll();$('live').textContent='● LINE 已連線'}catch{$('live').textContent='LINE 狀態未知'}}";
rep(oldRefresh,newRefresh,'safe refresh');

const oldSave="async function saveDraft(next){if(!(await ensurePin()))return;const s=current();if(!s)return;draftBusy=true;try{const r=await fetch('/api/student-draft',{method:'POST',headers:{'content-type':'application/json','x-eddie-coach-pin':pin},body:JSON.stringify({studentId:s.id,slots:next})}),o=await r.json();if(!r.ok){if(r.status===401){pin='';localStorage.removeItem('eddie-coach-pin')}toast(o.error||'時段儲存失敗');await refresh();return}selected=[...(o.student.draftSlots||[])];await refresh()}catch{toast('網路錯誤')}finally{draftBusy=false}}";
const newSave="function applyLocalDraft(s,next){selected=[...next];s.draftSlots=[...next];s.status=next.length?'draft':'none';state.week=state.week||{confirmed:{},holds:{}};state.week.holds=state.week.holds||{};for(const [slot,h] of Object.entries(state.week.holds))if(h.studentId===s.id)delete state.week.holds[slot];for(const slot of next)state.week.holds[slot]={studentId:s.id,name:s.name,type:'draft'};dirty.add(s.id);lastEditAt=Date.now();renderAll();schedulePersist()}function schedulePersist(){clearTimeout(draftTimer);draftTimer=setTimeout(()=>{draftTimer=null;void flushDrafts()},650)}function flushDrafts(){clearTimeout(draftTimer);draftTimer=null;const jobs=[...dirty].map(id=>{const s=students.find(x=>x.id===id);return s?{studentId:id,slots:[...(s.draftSlots||[])]}:null}).filter(Boolean);jobs.forEach(j=>dirty.delete(j.studentId));if(!jobs.length)return persistChain;persistChain=persistChain.then(async()=>{for(const job of jobs){const r=await fetch('/api/student-draft',{method:'POST',headers:{'content-type':'application/json','x-eddie-coach-pin':pin},body:JSON.stringify(job)}),o=await r.json();if(!r.ok){toast(o.error||'時段儲存失敗');await refresh(true);return}}}).catch(()=>{toast('同步失敗，請再試一次')});return persistChain}async function saveDraft(next){const s=current();if(!s||!(await ensurePin()))return;applyLocalDraft(s,next);await flushDrafts()}";
rep(oldSave,newSave,'optimistic draft save');

rep(
"const draft=mode==='free'?[]:selected.slice(-sessions);",
"await flushDrafts();const draft=mode==='free'?[]:selected.slice(-(mode==='choices'?3:sessions));",
'settings draft preservation');

rep("$('clear').onclick=()=>saveDraft([]);","$('clear').onclick=async()=>{if(!(await ensurePin()))return;const s=current();if(s)applyLocalDraft(s,[])};",'clear local');

rep(
"$('send').onclick=async()=>{const s=current();if(!s||!(await ensurePin()))return;const r=await fetch('/api/send-offer'",
"$('send').onclick=async()=>{const s=current();if(!s||!(await ensurePin()))return;await flushDrafts();const r=await fetch('/api/send-offer'",
'send flush');

rep(
"refresh();setInterval(refresh,4000);",
"refresh(true);setInterval(()=>{if(Date.now()-lastEditAt>10000&&!dirty.size&&!draftTimer)refresh()},15000);",
'polling interval');

fs.writeFileSync(path,s);
console.log('EDDIE_UI_HOTFIX_OK');
