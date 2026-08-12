import { readFile } from "node:fs/promises";
import TaiwanGameTime from "../taiwan-game-time.js";

export const TIME_ZONE = TaiwanGameTime.TAIWAN_TIME_ZONE;
export const MLB_API = "https://statsapi.mlb.com/api/v1";
export const taiwanDate = TaiwanGameTime.taiwanDate;
export const gameTaiwanDate = TaiwanGameTime.gameTaiwanDate;
export const scheduleQueryWindow = TaiwanGameTime.scheduleQueryWindow;
export const isTaiwanTodayGame = TaiwanGameTime.isTaiwanTodayGame;
const fallbackPlayers = JSON.parse(await readFile(new URL("../tracked-players.json", import.meta.url), "utf8"));
export const players = fallbackPlayers;

async function loadObservationPlayers(fetcher=fetch) {
  const apiUrl=String(process.env.OBSERVATION_API_URL||'').replace(/\/$/,'');
  if(!apiUrl) return fallbackPlayers;
  const response=await fetcher(`${apiUrl}/players`,{headers:{Accept:'application/json'},cache:'no-store'});
  if(!response.ok) throw new Error(`Observation API ${response.status}`);
  const payload=await response.json();
  const list=Array.isArray(payload)?payload:payload.players;
  if(!Array.isArray(list)||!list.length) throw new Error('Observation API returned an invalid or empty player list');
  return list;
}

const levels = [[1,"MLB"],[11,"AAA"],[12,"AA"],[13,"High-A"],[14,"Single-A"],[16,"Rookie"]];
const number = value => Number(value || 0);
const dateOnly = value => String(value || "").slice(0, 10);

async function json(url, fetcher) {
  const separator = url.includes("?") ? "&" : "?";
  const response = await fetcher(`${url}${separator}_=${Date.now()}`, { headers: { Accept: "application/json", "Cache-Control":"no-cache" }, cache:"no-store" });
  if (!response.ok) throw new Error(`MLB API ${response.status}: ${url}`);
  return response.json();
}
async function levelData(player, [sportId, level], season, fetcher) {
  const base = `${MLB_API}/people/${player.id}/stats?group=${player.group}&season=${season}&sportId=${sportId}`;
  const [seasonJson, logJson] = await Promise.all([json(`${base}&stats=season`, fetcher), json(`${base}&stats=gameLog`, fetcher)]);
  return { sportId, level, season: seasonJson.stats?.[0]?.splits?.[0]?.stat || null, games:(logJson.stats?.[0]?.splits || []).map(split => ({...split, level})) };
}
function performance(group, stat = {}) {
  return group === "pitching"
    ? `${stat.inningsPitched ?? "0"} IP, ${stat.strikeOuts ?? 0} K, ${stat.baseOnBalls ?? 0} BB, ${stat.earnedRuns ?? 0} ER${stat.battersFaced != null ? `, ${stat.battersFaced} BF` : ""}`
    : `${stat.hits ?? 0}-for-${stat.atBats ?? 0}${stat.plateAppearances != null ? `, ${stat.plateAppearances} PA` : ""}, ${stat.homeRuns ?? 0} HR, ${stat.rbi ?? 0} RBI, ${stat.stolenBases ?? 0} SB`;
}
function seasonLine(group, stat = {}) {
  return group === "pitching"
    ? `ERA ${stat.era ?? "—"}, WHIP ${stat.whip ?? "—"}, ${stat.inningsPitched ?? 0} IP, ${stat.strikeOuts ?? 0} K`
    : `AVG ${stat.avg ?? "—"}, OBP ${stat.obp ?? "—"}, OPS ${stat.ops ?? "—"}, ${stat.homeRuns ?? 0} HR, ${stat.rbi ?? 0} RBI`;
}
export function statusLabel(status = {}) {
  const detail = status.detailedState || "Status unavailable";
  const state = status.abstractGameState;
  if (state === "Final" || /final|game over|completed early/i.test(detail)) return `FINAL — ${detail}`;
  if (state === "Live" || /in progress|warmup|delay|suspend|review|challenge/i.test(detail)) return `LIVE / IN PROGRESS — ${detail}`;
  if (state === "Preview" || /scheduled|pre-game|not started/i.test(detail)) return `NOT STARTED — ${detail}`;
  return `STATUS UNKNOWN — ${detail}`;
}
function schedulePriority(game = {}) {
  const state = game.status?.abstractGameState;
  if (state === "Live") return 0;
  if (state === "Final") return 1;
  return 2;
}
function hasBoxscoreAppearance(group, stat = {}, boxPlayer = {}) {
  if (group === "pitching") return number(stat.battersFaced) > 0 || number(stat.pitchesThrown) > 0 || number(stat.inningsPitched) > 0;
  return number(stat.plateAppearances) > 0 || number(stat.atBats) > 0 || number(stat.runs) > 0 || number(stat.baseOnBalls) > 0 || number(stat.hitByPitch) > 0 || number(stat.sacFlies) > 0 || number(stat.sacBunts) > 0 || Boolean(boxPlayer.allPositions?.length && boxPlayer.gameStatus?.isSubstitute);
}
async function teamGames(teamId, sportId, now, fetcher) {
  if (!teamId) return [];
  const {start,end}=scheduleQueryWindow(now);
  const data = await json(`${MLB_API}/schedule?sportId=${sportId||1}&teamId=${teamId}&startDate=${start}&endDate=${end}`, fetcher);
  return (data.dates || []).flatMap(item => item.games || []).filter(game => isTaiwanTodayGame(game, now));
}
async function officialBoxscoreAppearance(player, games, fetcher) {
  const ordered = [...games].sort((a,b) => schedulePriority(a) - schedulePriority(b) || new Date(b.gameDate||0)-new Date(a.gameDate||0));
  let checked=0;
  let lastError=null;
  for (const scheduled of ordered) {
    if (!scheduled.gamePk || scheduled.status?.abstractGameState === "Preview") continue;
    try {
      const boxscore = await json(`${MLB_API}/game/${scheduled.gamePk}/boxscore`, fetcher);
      checked+=1;
      const key = `ID${player.id}`;
      const boxPlayer = boxscore.teams?.home?.players?.[key] || boxscore.teams?.away?.players?.[key];
      if (!boxPlayer) continue;
      const stat = player.group === "pitching"
        ? boxPlayer.stats?.pitching || {}
        : boxPlayer.stats?.batting || boxPlayer.stats?.hitting || {};
      if (hasBoxscoreAppearance(player.group, stat, boxPlayer)) return { scheduled, stat, boxPlayer };
    } catch (error) {
      lastError=error;
      console.warn(`[official] Could not read game ${scheduled.gamePk} boxscore for ${player.name}: ${error.message}`);
    }
  }
  if(ordered.some(game=>game.status?.abstractGameState!=="Preview")&&checked===0&&lastError)throw lastError;
  return null;
}
async function playerSnapshot(player, reportDate, now, fetcher) {
  const season = Number(reportDate.slice(0,4));
  const [personResult, ...levelResults] = await Promise.allSettled([
    json(`${MLB_API}/people/${player.id}?hydrate=currentTeam`, fetcher),
    ...levels.map(level => levelData(player, level, season, fetcher)),
  ]);
  const available = levelResults.filter(r => r.status === "fulfilled").map(r => r.value);
  if (!available.length) throw new Error(`No statistics returned for ${player.name}`);
  const games = available.flatMap(item => item.games).sort((a,b) => new Date(b.date) - new Date(a.date));
  const latest = games[0] || null;
  const currentLevel = available.find(item => item.level === latest?.level) || available.find(item => item.season) || {};
  const person = personResult.status === "fulfilled" ? personResult.value.people?.[0] || {} : {};
  const team = latest?.team?.name || person.currentTeam?.name || player.org;
  const status = person.rosterStatus?.description || person.rosterStatus || (team ? `Rostered with ${team}` : "Roster status not provided by MLB");
  const candidateTeamIds = [...new Set([latest?.team?.id, ...games.slice(0,5).map(game => game.team?.id), person.currentTeam?.id].filter(Boolean))];
  const scheduledBatches = await Promise.allSettled(candidateTeamIds.map(teamId => teamGames(teamId, currentLevel.sportId||1, now, fetcher)));
  const successfulSchedules=scheduledBatches.filter(result=>result.status==='fulfilled').flatMap(result=>result.value);
  if(candidateTeamIds.length&&scheduledBatches.every(result=>result.status==='rejected'))throw scheduledBatches[0].reason;
  const scheduledGames = [...new Map(successfulSchedules.filter(game => game?.gamePk).map(game => [game.gamePk, game])).values()];
  const appearance = await officialBoxscoreAppearance(player, scheduledGames, fetcher);
  const effectiveStat = appearance?.stat || null;
  const played = Boolean(effectiveStat);
  const currentGame = appearance?.scheduled || [...scheduledGames].sort((a,b) => schedulePriority(a)-schedulePriority(b))[0] || null;
  const currentGameStatus = currentGame?.status ? statusLabel(currentGame.status) : "NO GAME — no Taiwan-today game returned by MLB schedule";
  const taiwanGameDate=played&&currentGame?gameTaiwanDate(currentGame):"";
  return { id:player.id, name:player.name, group:player.group, team, status, played, gameDate:taiwanGameDate, level:appearance ? currentLevel.level || latest?.level || "—" : latest?.level || "—", gameStatus:currentGameStatus, performance:effectiveStat ? performance(player.group, effectiveStat) : "Did not play", season:seasonLine(player.group, currentLevel.season), latestGameDate:played ? taiwanGameDate : dateOnly(latest?.date), liveSource:Boolean(appearance&&currentGame?.status?.abstractGameState==='Live') };
}
export async function collectSnapshot({date=taiwanDate(), now=new Date(), fetcher=fetch, previous=null} = {}) {
  const trackedPlayers=await loadObservationPlayers(fetcher);
  const previousById=new Map((previous?.players||[]).map(player=>[Number(player.id),player]));
  const results = await Promise.allSettled(trackedPlayers.map(player => playerSnapshot(player, date, now, fetcher)));
  let stalePlayers=0;
  const resolved=results.map((result,index)=>{
    if(result.status==='fulfilled')return result.value;
    const fallback=previousById.get(Number(trackedPlayers[index].id));
    if(fallback){stalePlayers+=1;return fallback;}
    throw result.reason;
  });
  return {date, gameDate:date, scheduleWindow:scheduleQueryWindow(now), generatedAt:new Date().toISOString(), stalePlayers, players:resolved};
}
function linePlayerComparable(player) {
  if(!player?.played) return {id:player?.id,played:false};
  return {id:player.id,played:true,team:player.team,level:player.level,gameDate:player.gameDate,gameStatus:player.gameStatus,performance:player.performance,season:player.season,liveSource:player.liveSource};
}
export function comparable(snapshot) {
  return snapshot.players.map(linePlayerComparable);
}
export function hasChanges(previous, current) { return Boolean(previous) && JSON.stringify(comparable(previous)) !== JSON.stringify(comparable(current)); }
function todayPlayers(snapshot){ return (snapshot.players||[]).filter(player=>player.played && player.gameDate===snapshot.date); }
function playerSection(player){
  return [`\n【${player.name}｜${player.team}】`,`比賽：${player.gameStatus}`,`本場：${player.performance}（${player.level}${player.liveSource ? "・LIVE" : ""}）`,`球季：${player.season}`].join("\n");
}
export function formatSummary(snapshot, period="final", test=false) {
  const title = period === "morning" ? "早安速報" : "午間日報";
  const prefix = test ? "🧪 TEST — Taiwan MLB Tracker" : `🇹🇼⚾ Taiwan MLB Tracker｜${snapshot.date} ${title}`;
  const fallbackNote=snapshot.stalePlayers?`\n⚠️ ${snapshot.stalePlayers} 位球員沿用上次成功的官方資料`:'';
  const active=todayPlayers(snapshot);
  const header = `${prefix}\n台灣日期：${snapshot.date}（依 MLB gameDate 換算）\n今日出賽：${active.length} 位${fallbackNote}`;
  if(!active.length)return `${header}\n\n目前沒有追蹤球員在台灣今天出賽。`;
  return [header, ...active.map(playerSection)].join("\n");
}
export function formatChanges(previous, current, test=false) {
  const before = new Map((previous?.players||[]).map(player => [player.id, JSON.stringify(linePlayerComparable(player))]));
  const changed = todayPlayers(current).filter(player => before.get(player.id) !== JSON.stringify(linePlayerComparable(player)));
  const header = test ? "🧪 TEST — Taiwan MLB Tracker\n今日出賽更新測試" : `🇹🇼⚾ Taiwan MLB Tracker｜${current.date} 今日出賽更新`;
  if(!changed.length)return `${header}\n目前沒有新的今日出賽變化。`;
  return [header, ...changed.map(playerSection)].join("\n");
}
