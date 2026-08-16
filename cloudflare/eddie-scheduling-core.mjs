export const validMode = mode => ['fixed','choices','free'].includes(mode) ? mode : 'choices';
export const validSessions = value => [1,2,3].includes(Number(value)) ? Number(value) : 1;

export function uniqueSlots(slots){
  return [...new Set((Array.isArray(slots)?slots:[]).map(x=>String(x).trim()).filter(Boolean))];
}

// Frozen scheduling semantics:
// - fixed: coach reserves exactly the student's weekly lesson count.
// - choices: coach may hold up to 3 candidate slots, even for a 1-lesson student;
//            the student later confirms exactly `sessions` slots.
// - free: coach does not preselect slots; student chooses from remaining free time.
export function normalizeCoachDraft(slots, mode, sessions){
  mode=validMode(mode); sessions=validSessions(sessions);
  if(mode==='free') return [];
  const clean=uniqueSlots(slots);
  if(mode==='choices') return clean.slice(Math.max(0,clean.length-3));
  return clean.slice(Math.max(0,clean.length-sessions));
}

export function slotConflict(week,slot,studentId){
  const c=week?.confirmed?.[slot], h=week?.holds?.[slot];
  if(c && c.studentId!==studentId) return {...c,kind:'confirmed'};
  if(h && h.studentId!==studentId) return {...h,kind:'hold'};
  return null;
}

export function releaseStudentHolds(week,studentId){
  week.holds=week.holds||{};
  for(const [slot,hold] of Object.entries(week.holds)) if(hold.studentId===studentId) delete week.holds[slot];
  return week;
}

export function applyCoachDraft(week,student,requestedSlots){
  week.confirmed=week.confirmed||{}; week.holds=week.holds||{};
  const slots=normalizeCoachDraft(requestedSlots,student.mode,student.sessions);
  releaseStudentHolds(week,student.id);
  for(const slot of slots){
    const conflict=slotConflict(week,slot,student.id);
    if(conflict) return {ok:false,slot,conflict};
  }
  for(const slot of slots) week.holds[slot]={studentId:student.id,name:student.name,type:'draft'};
  return {ok:true,slots,week};
}

export function promoteStudentHolds(week,student,type='offered'){
  week.holds=week.holds||{};
  for(const hold of Object.values(week.holds)) if(hold.studentId===student.id) hold.type=type;
  return week;
}

export function confirmStudentSlots(week,student,chosen){
  week.confirmed=week.confirmed||{}; week.holds=week.holds||{};
  const slots=uniqueSlots(chosen);
  if(slots.length!==validSessions(student.sessions)) return {ok:false,error:'session-count'};
  for(const slot of slots){
    const conflict=slotConflict(week,slot,student.id);
    if(conflict) return {ok:false,error:'conflict',slot,conflict};
  }
  releaseStudentHolds(week,student.id);
  for(const slot of slots) week.confirmed[slot]={studentId:student.id,name:student.name};
  return {ok:true,slots,week};
}

export function runSchedulingRegression(){
  const week={confirmed:{},holds:{}};
  const a={id:'a',name:'A',mode:'choices',sessions:1};
  const b={id:'b',name:'B',mode:'fixed',sessions:1};
  const c={id:'c',name:'C',mode:'fixed',sessions:2};
  const s1='週一 12:00–13:00', s2='週一 13:00–14:00', s3='週一 14:00–15:00', s4='週一 15:00–16:00', s5='週一 16:00–17:00', s6='週一 17:00–18:00';

  const choices=normalizeCoachDraft([s1,s2,s3],'choices',1);
  if(choices.length!==3) return {ok:false,test:'one-lesson-can-have-three-candidates'};
  const fixedOne=normalizeCoachDraft([s1,s2],'fixed',1);
  if(fixedOne.length!==1 || fixedOne[0]!==s2) return {ok:false,test:'fixed-one-hard-limit'};

  let r=applyCoachDraft(week,a,[s1,s2,s3]);
  if(!r.ok || Object.values(week.holds).filter(x=>x.studentId==='a').length!==3) return {ok:false,test:'candidate-holds'};
  r=applyCoachDraft(week,b,[s1]);
  if(r.ok) return {ok:false,test:'second-student-sees-first-student-candidate'};
  r=applyCoachDraft(week,b,[s4]);
  if(!r.ok) return {ok:false,test:'second-student-next-free-slot'};
  r=applyCoachDraft(week,c,[s5,s6]);
  if(!r.ok) return {ok:false,test:'third-student-stacks-on-prior-students'};

  r=confirmStudentSlots(week,a,[s2]);
  if(!r.ok || !week.confirmed[s2]) return {ok:false,test:'student-confirms-exact-session-count'};
  if(week.holds[s1]||week.holds[s2]||week.holds[s3]) return {ok:false,test:'unused-candidates-release-after-confirm'};
  if(!slotConflict(week,s2,'b')) return {ok:false,test:'confirmed-remains-blocked-for-others'};
  return {ok:true,tests:8};
}
