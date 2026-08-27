(()=>{
  const API='https://statsapi.mlb.com/api/v1';

  async function requestJson(path,{fresh=false}={}){
    const absolute=/^https?:\/\//.test(path)?path:`${API}${path}`;
    const sep=absolute.includes('?')?'&':'?';
    const url=fresh?`${absolute}${sep}_=${Date.now()}`:absolute;
    const response=await fetch(url,{
      cache:fresh?'no-store':'default',
      headers:{
        Accept:'application/json',
        ...(fresh?{'Cache-Control':'no-cache'}:{})
      }
    });
    if(!response.ok)throw new Error(`MLB API ${response.status}`);
    return response.json();
  }

  async function person(playerId){
    const payload=await requestJson(`/people/${playerId}?hydrate=currentTeam`,{fresh:true});
    return payload.people?.[0]||null;
  }

  async function schedule({teamId,sportId=1,startDate,endDate}){
    const params=new URLSearchParams({sportId:String(sportId),teamId:String(teamId),startDate,endDate});
    return requestJson(`/schedule?${params.toString()}`,{fresh:true});
  }

  async function boxscore(gamePk){
    return requestJson(`/game/${gamePk}/boxscore`,{fresh:true});
  }

  async function seasonStats({playerId,group,sportId,season}){
    const params=new URLSearchParams({group,season:String(season),sportId:String(sportId),stats:'season'});
    return requestJson(`/people/${playerId}/stats?${params.toString()}`);
  }

  async function gameLog({playerId,group,sportId,season}){
    const params=new URLSearchParams({group,season:String(season),sportId:String(sportId),stats:'gameLog'});
    return requestJson(`/people/${playerId}/stats?${params.toString()}`,{fresh:true});
  }

  window.TaiwanMlbClient=Object.freeze({
    API,
    requestJson,
    person,
    schedule,
    boxscore,
    seasonStats,
    gameLog
  });
})();
