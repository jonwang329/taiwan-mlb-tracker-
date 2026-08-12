(function(root,factory){
  const api=factory();
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  root.TaiwanGameTime=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  const TAIWAN_TIME_ZONE='Asia/Taipei';
  const MLB_SCHEDULE_TIME_ZONE='America/New_York';
  const DAY_MS=24*60*60*1000;

  function dateInZone(date,timeZone){
    return new Intl.DateTimeFormat('en-CA',{timeZone,year:'numeric',month:'2-digit',day:'2-digit'}).format(date);
  }

  function taiwanDate(now=new Date()){
    return dateInZone(now,TAIWAN_TIME_ZONE);
  }

  function taiwanDayUtcBounds(now=new Date()){
    const date=taiwanDate(now);
    const start=new Date(`${date}T00:00:00+08:00`);
    return {start,end:new Date(start.getTime()+DAY_MS-1)};
  }

  // MLB schedule dates are queried in the league's US calendar only to make
  // sure every official game whose start time falls on the Taiwan date is
  // returned. These US dates are never used to decide what "today" means.
  function scheduleQueryWindow(now=new Date()){
    const {start,end}=taiwanDayUtcBounds(now);
    return {
      start:dateInZone(start,MLB_SCHEDULE_TIME_ZONE),
      end:dateInZone(end,MLB_SCHEDULE_TIME_ZONE),
    };
  }

  function gameTaiwanDate(game){
    const gameDate=game&&game.gameDate;
    if(!gameDate)return '';
    const parsed=new Date(gameDate);
    if(Number.isNaN(parsed.getTime()))return '';
    return dateInZone(parsed,TAIWAN_TIME_ZONE);
  }

  function isTaiwanTodayGame(game,now=new Date()){
    return gameTaiwanDate(game)===taiwanDate(now);
  }

  return {TAIWAN_TIME_ZONE,MLB_SCHEDULE_TIME_ZONE,dateInZone,taiwanDate,taiwanDayUtcBounds,scheduleQueryWindow,gameTaiwanDate,isTaiwanTodayGame};
});
