import { readFile } from "node:fs/promises";

export const TIME_ZONE = "Asia/Taipei";
export const MLB_API = "https://statsapi.mlb.com/api/v1";
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

export function taiwanDate(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE, year:"numeric", month:"2-digit", day:"2-digit" }).format(date);
}
export function baseballDate(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone:"America/New_York", year:"numeric", month:"2-digit", day:"2-digit" }).format(date);
}
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
function insight(player, game, season = {}) {
  if (!game) return "今日無出賽；持續關注下一場出賽機會。";
  const stat = game.stat || {};
  if (player.group === "pitching") {
    const ip = number(stat.inningsPitched), strikeouts = number(stat.strikeOuts), earned = number(stat.earnedRuns);
    if (ip >= 5 && earned <= 2) return "有效壓低失分並吃下局數，是一場具品質的投球內容。";
    if (strikeouts >= 4) return "三振能力有展現，後續可留意保送與用球效率。";
    return `本場局數與控球是觀察重點；球季 ERA 為 ${season.era ?? "—"}。`;
  }
  if (number(stat.homeRuns)) return "長打火力直接轉化為得分貢獻，近期打擊狀態值得關注。";
  if (number(stat.hits) >= 2) return "單場多安顯示擊球狀態不錯，可留意能否延續上壘表現。";
  return `本場結果之外，可搭配球季 OPS ${season.ops ?? "—"} 觀察整體進攻貢獻。`;
}
export function statusLabel(status = {}) {
  const detail = status.detailedState || "Status unavailable";
  const state = status.abstractGameState;
  if (state === "Final" || /final|game over|completed early/i.test(detail)) return `FINAL — ${detail}`;
  if (state === "Live" || /in progress|warmup|delay|suspend|review|challenge/i.test(detail)) return `LIVE / IN PROGRESS — ${detail}`;
  if (state === "Preview" || /scheduled|pre-game|not started/i.test(detail)) return `NOT STARTED — ${detail}`;
  return `STATUS UNKNOWN — ${detail}`;
}
async function gameStatus(game, fetcher) {
  const gamePk = game?.game?.gamePk || game?.gamePk;
  if (!gamePk) return "FINAL — game log recorded";
  try { const data = await json(`${MLB_API}/schedule?gamePk=${gamePk}`, fetcher); return statusLabel(data.dates?.[0]?.games?.[0]?.status); }
  catch { return "STATUS UNKNOWN — game recorded"; }
}
async function teamGames(teamId, gameDate, fetcher) {
  if (!teamId) return [];
  try {
    const data = await json(`${MLB_API}/schedule?teamId=${teamId}&date=${gameDate}`, fetcher);
    return data.dates?.[0]?.games || [];
  } catch { return []; }
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
async function liveBoxscoreAppearance(player, games, fetcher) {
  const ordered = [...games].sort((a,b) => schedulePriority(a) - schedulePriority(b));
  for (const scheduled of ordered) {
    if (!scheduled.gamePk || scheduled.status?.abstractGameState === "Preview") continue;
    try {
      const boxscore = await json(`${MLB_API}/game/${scheduled.gamePk}/boxscore`, fetcher);
      const key = `ID${player.id}`;
      const boxPlayer = boxscore.teams?.home?.players?.[key] || boxscore.teams?.away?.players?.[key];
      if (!boxPlayer) continue;
      const stat = player.group === "pitching"
        ? boxPlayer.stats?.pitching || {}
        : boxPlayer.stats?.batting || boxPlayer.stats?.hitting || {};
      if (hasBoxscoreAppearance(player.group, stat, boxPlayer)) return { scheduled, stat, boxPlayer };
    } catch (error) {
      console.warn(`[live] Could not read game ${scheduled.gamePk} boxscore for ${player.name}: ${error.message}`);
    }
  }
  return null;
}
async function playerSnapshot(player, reportDate, gameDate, fetcher) {
  const season = Number(reportDate.slice(0,4));
  const [personResult, ...levelResults] = await Promise.allSettled([
    json(`${MLB_API}/people/${player.id}?hydrate=currentTeam,transactions`, fetcher),
    ...levels.map(level => levelData(player, level, season, fetcher)),
  ]);
  const available = levelResults.filter(r => r.status === "fulfilled").map(r => r.value);
  if (!available.length) throw new Error(`No statistics returned for ${player.name}`);
  const games = available.flatMap(item => item.games).sort((a,b) => new Date(b.date) - new Date(a.date));
  const gameLogGame = games.find(item => dateOnly(item.date) === gameDate) || null;
  const latest = gameLogGame || games[0] || null;
  const currentLevel = available.find(item => item.level === latest?.level) || available.find(item => item.season) || {};
  const person = personResult.status === "fulfilled" ? personResult.value.people?.[0] || {} : {};
  const transaction = [...(person.transactions || [])].sort((a,b) => new Date(b.date)-new Date(a.date))[0];
  const status = person.rosterStatus?.description || person.rosterStatus || "Active status unavailable";
  const team = person.currentTeam?.name || player.org;
  const scheduledGames = await teamGames(person.currentTeam?.id, gameDate, fetcher);
  const liveAppearance = await liveBoxscoreAppearance(player, scheduledGames, fetcher);
  const effectiveStat = liveAppearance?.stat || gameLogGame?.stat || null;
  const played = Boolean(effectiveStat);
  const currentGame = liveAppearance?.scheduled || scheduledGames.sort((a,b) => schedulePriority(a)-schedulePriority(b))[0] || null;
  const currentGameStatus = currentGame?.status ? statusLabel(currentGame.status) : gameLogGame ? await gameStatus(gameLogGame, fetcher) : "NO GAME — no scheduled game or appearance recorded";
  const effectiveGame = effectiveStat ? { stat: effectiveStat } : null;
  return { id:player.id, name:player.name, group:player.group, team, status, played, gameDate:played ? gameDate : "", level:liveAppearance ? currentLevel.level || latest?.level || "—" : gameLogGame?.level || latest?.level || "—", gameStatus:currentGameStatus, performance:effectiveStat ? performance(player.group, effectiveStat) : "Did not play", season:seasonLine(player.group, currentLevel.season), news:transaction ? `${dateOnly(transaction.date)} ${transaction.description || transaction.typeDesc}` : "No recent status change reported", insight:insight(player, effectiveGame, currentLevel.season), latestGameDate:played ? gameDate : dateOnly(latest?.date), liveSource:Boolean(liveAppearance) };
}
export async function collectSnapshot({date=taiwanDate(), gameDate=baseballDate(), fetcher=fetch} = {}) {
  const trackedPlayers=await loadObservationPlayers(fetcher);
  const results = await Promise.allSettled(trackedPlayers.map(player => playerSnapshot(player, date, gameDate, fetcher)));
  const failures = results.filter(result => result.status === "rejected");
  if (failures.length) throw new Error(`Could not load ${failures.length} player(s): ${failures[0].reason.message}`);
  return {date, gameDate, generatedAt:new Date().toISOString(), players:results.map(result => result.value)};
}
export function comparable(snapshot) {
  return snapshot.players.map(({id,team,status,played,gameDate,gameStatus,performance,season,news,latestGameDate,liveSource}) => ({id,team,status,played,gameDate,gameStatus,performance,season,news,latestGameDate,liveSource}));
}
export function hasChanges(previous, current) { return Boolean(previous) && JSON.stringify(comparable(previous)) !== JSON.stringify(comparable(current)); }
export function formatSummary(snapshot, period="final", test=false) {
  const title = period === "morning" ? "早安速報" : "午間最終日報";
  const prefix = test ? "🧪 TEST — Taiwan MLB Tracker" : `🇹🇼⚾ Taiwan MLB Tracker｜${snapshot.date} ${title}`;
  const header = `${prefix}\n比賽日：${snapshot.gameDate}（美國東岸）`;
  const sections = snapshot.players.map(player => [`\n【${player.name}｜${player.team}】`,`比賽：${player.gameStatus}`,`出賽：${player.played ? "有" : "無"}｜球員狀態：${player.status}`,`本場：${player.performance}${player.played ? `（${player.level}${player.liveSource ? "・LIVE" : ""}）` : ""}`,`球季：${player.season}`,`動態：${player.news}`,`觀察：${player.insight}`].join("\n"));
  return [header, ...sections].join("\n");
}
export function formatChanges(previous, current, test=false) {
  const before = new Map(previous.players.map(player => [player.id, JSON.stringify(comparable({players:[player]})[0])]));
  const changed = current.players.filter(player => before.get(player.id) !== JSON.stringify(comparable({players:[player]})[0]));
  const header = test ? "🧪 TEST — Taiwan MLB Tracker\n資料更新測試" : `🇹🇼⚾ Taiwan MLB Tracker｜${current.date} 資料更新`;
  return [header, ...changed.map(player => `\n【${player.name}】\n比賽：${player.gameStatus}${player.played ? `\n本場：${player.performance}${player.liveSource ? "（LIVE）" : ""}\n球季：${player.season}` : `\n球員狀態：${player.status}｜最新比賽 ${player.latestGameDate || "—"}`}\n動態：${player.news}\n觀察：${player.insight}`)].join("\n");
}
