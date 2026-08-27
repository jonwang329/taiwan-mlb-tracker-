(()=>{
  const MONTH={JAN:0,FEB:1,MAR:2,APR:3,MAY:4,JUN:5,JUL:6,AUG:7,SEP:8,OCT:9,NOV:10,DEC:11};

  function classify(date=new Date()){
    const d=new Date(date);
    if(Number.isNaN(d.getTime()))throw new TypeError('Invalid date');
    const month=d.getUTCMonth();
    const day=d.getUTCDate();

    if(month===MONTH.FEB&&day>=15)return 'SPRING';
    if(month===MONTH.MAR&&day<25)return 'SPRING';
    if(month===MONTH.MAR&&day>=25)return 'IN_SEASON';
    if(month>=MONTH.APR&&month<=MONTH.SEP)return 'IN_SEASON';
    if(month===MONTH.OCT&&day<=31)return 'IN_SEASON';
    return 'OFFSEASON';
  }

  function homeMode(date=new Date()){
    const context=classify(date);
    return context==='OFFSEASON'?'PLAYER_RADAR':'GAME_TRACKER';
  }

  window.TaiwanMlbSeasonContext=Object.freeze({classify,homeMode});
})();
