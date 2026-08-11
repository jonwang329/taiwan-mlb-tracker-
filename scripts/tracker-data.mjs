export const TIME_ZONE = "Asia/Taipei";
export const MLB_API = "https://statsapi.mlb.com/api/v1";

export const players = [
  { id: 701678, name: "李灝宇 Hao-Yu Lee", role: "2B", org: "Detroit Tigers", group: "hitting" },
  { id: 691907, name: "鄭宗哲 Tsung-Che Cheng", role: "SS", org: "Boston Red Sox", group: "hitting" },
  { id: 678906, name: "鄧愷威 Kai-Wei Teng", role: "RHP", org: "Houston Astros", group: "pitching" },
  { id: 827734, name: "林維恩 Wei-En Lin", role: "LHP", org: "Athletics", group: "pitching" },
  { id: 801179, name: "林昱珉 Yu-Min Lin", role: "LHP", org: "Arizona Diamondbacks", group: "pitching" },
  { id: 828667, name: "柯敬賢 Ching-Hsien Ko", role: "OF", org: "Los Angeles Dodgers", group: "hitting" },
  { id: 813820, name: "林振瑋 Chen-Wei Lin", role: "RHP", org: "St. Louis Cardinals", group: "pitching" },
  { id: 800018, name: "莊陳仲敖 Chen Zhong-Ao Zhuang", role: "RHP", org: "Athletics", group: "pitching" },
  { id: 808486, name: "李晨薰 Chen-Hsun Lee", role: "RHP", org: "San Francisco Giants", group: "pitching" },
];

const levels = [
  [1, "MLB"], [11, "AAA"], [12, "AA"], [13, "High-A"], [14, "Single-A"], [16, "Rookie"],
];

export function taiwanDate(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit",
  }).format(date);
}

export function baseballDate(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(date);
}

function number(value) { return Number(value || 0); }
function dateOnly(value) { return String(value || "").slice(0, 10); }

async function json(url, fetcher) {
  const response = await fetcher(url, { headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error(`MLB API ${response.status}: ${url}`);
  return response.json();
}

async function levelData(player, [sportId, level], season, fetcher) {
  const base = `${MLB_API}/people/${player.id}/stats?group=${player.group}&season=${season}&sportId=${sportId}`;
  const [seasonJson, logJson] = await Promise.all([
    json(`${base}&stats=season`, fetcher), json(`${base}&stats=gameLog`, fetcher),
  ]);
  return {
    sportId,
    level,
    season: seasonJson.stats?.[0]?.splits?.[0]?.stat || null,
    games: (logJson.stats?.[0]?.splits || []).map((split) => ({ ...split, level })),
  };
}

function performance(group, stat = {}) {
  if (group === "pitching") {
    return `${stat.inningsPitched ?? "0"} IP, ${stat.strikeOuts ?? 0} K, ${stat.baseOnBalls ?? 0} BB, ${stat.earnedRuns ?? 0} ER`;
  }
  return `${stat.hits ?? 0}-for-${stat.atBats ?? 0}, ${stat.homeRuns ?? 0} HR, ${stat.rbi ?? 0} RBI, ${stat.stolenBases ?? 0} SB`;
}

function seasonLine(group, stat = {}) {
  if (group === "pitching") {
    return `ERA ${stat.era ?? "—"}, WHIP ${stat.whip ?? "—"}, ${stat.inningsPitched ?? 0} IP, ${stat.strikeOuts ?? 0} K`;
  }
  return `AVG ${stat.avg ?? "—"}, OBP ${stat.obp ?? "—"}, OPS ${stat.ops ?? "—"}, ${stat.homeRuns ?? 0} HR, ${stat.rbi ?? 0} RBI`;
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
  try {
    const data = await json(`${MLB_API}/schedule?gamePk=${gamePk}`, fetcher);
    return statusLabel(data.dates?.[0]?.games?.[0]?.status);
  } catch { return "STATUS UNKNOWN — game recorded"; }
}

async function teamGameStatus(teamId, sportId, gameDate, fetcher) {
  if (!teamId || !sportId) return "NO GAME — no scheduled game or appearance recorded";
  try {
    const data = await json(`${MLB_API}/schedule?teamId=${teamId}&sportId=${sportId}&date=${gameDate}`, fetcher);
    const status = data.dates?.[0]?.games?.[0]?.status;
    return status ? statusLabel(status) : "NO GAME — no scheduled game or appearance recorded";
  } catch { return "STATUS UNKNOWN — schedule unavailable"; }
}

async function playerSnapshot(player, reportDate, gameDate, fetcher) {
  const season = Number(reportDate.slice(0, 4));
  const [personResult, ...levelResults] = await Promise.allSettled([
    json(`${MLB_API}/people/${player.id}?hydrate=currentTeam,transactions`, fetcher),
    ...levels.map((level) => levelData(player, level, season, fetcher)),
  ]);
  const available = levelResults.filter((result) => result.status === "fulfilled").map((result) => result.value);
  if (!available.length) throw new Error(`No statistics returned for ${player.name}`);
  const games = available.flatMap((item) => item.games).sort((a, b) => new Date(b.date) - new Date(a.date));
  const game = games.find((item) => dateOnly(item.date) === gameDate) || null;
  const latest = game || games[0] || null;
  const currentLevel = available.find((item) => item.level === latest?.level) || available.find((item) => item.season) || {};
  const person = personResult.status === "fulfilled" ? personResult.value.people?.[0] || {} : {};
  const transaction = [...(person.transactions || [])].sort((a, b) => new Date(b.date) - new Date(a.date))[0];
  const status = person.rosterStatus?.description || person.rosterStatus || "Active status unavailable";
  const team = person.currentTeam?.name || player.org;
  const currentGameStatus = game
    ? await gameStatus(game, fetcher)
    : await teamGameStatus(person.currentTeam?.id, currentLevel.sportId, gameDate, fetcher);
  return {
    id: player.id, name: player.name, group: player.group, team, status,
    played: Boolean(game), gameDate: dateOnly(game?.date), level: game?.level || latest?.level || "—",
    gameStatus: currentGameStatus, performance: game ? performance(player.group, game.stat) : "Did not play",
    season: seasonLine(player.group, currentLevel.season),
    news: transaction ? `${dateOnly(transaction.date)} ${transaction.description || transaction.typeDesc}` : "No recent status change reported",
    insight: insight(player, game, currentLevel.season),
    latestGameDate: dateOnly(latest?.date),
  };
}

export async function collectSnapshot({ date = taiwanDate(), gameDate = baseballDate(), fetcher = fetch } = {}) {
  const results = await Promise.allSettled(players.map((player) => playerSnapshot(player, date, gameDate, fetcher)));
  const failures = results.filter((result) => result.status === "rejected");
  if (failures.length) throw new Error(`Could not load ${failures.length} player(s): ${failures[0].reason.message}`);
  return { date, gameDate, generatedAt: new Date().toISOString(), players: results.map((result) => result.value) };
}

export function comparable(snapshot) {
  return snapshot.players.map(({ id, team, status, played, gameDate, gameStatus, performance, season, news, latestGameDate }) =>
    ({ id, team, status, played, gameDate, gameStatus, performance, season, news, latestGameDate }));
}

export function hasChanges(previous, current) {
  return Boolean(previous) && JSON.stringify(comparable(previous)) !== JSON.stringify(comparable(current));
}

export function formatSummary(snapshot, period = "final") {
  const title = period === "morning" ? "早安速報" : "午間最終日報";
  const header = `🇹🇼⚾ Taiwan MLB Tracker｜${snapshot.date} ${title}\n比賽日：${snapshot.gameDate}（美國東岸）`;
  const sections = snapshot.players.map((player) => [
    `\n【${player.name}｜${player.team}】`,
    `比賽：${player.gameStatus}`,
    `出賽：${player.played ? "有" : "無"}｜球員狀態：${player.status}`,
    `本場：${player.performance}${player.played ? `（${player.level}）` : ""}`,
    `球季：${player.season}`,
    `動態：${player.news}`,
    `觀察：${player.insight}`,
  ].join("\n"));
  return [header, ...sections].join("\n");
}

export function formatChanges(previous, current) {
  const before = new Map(previous.players.map((player) => [player.id, JSON.stringify(comparable({ players: [player] })[0])]));
  const changed = current.players.filter((player) => before.get(player.id) !== JSON.stringify(comparable({ players: [player] })[0]));
  return [`🇹🇼⚾ Taiwan MLB Tracker｜${current.date} 資料更新`, ...changed.map((player) =>
    `\n【${player.name}】\n比賽：${player.gameStatus}${player.played ? `\n本場：${player.performance}\n球季：${player.season}` : `\n球員狀態：${player.status}｜最新比賽 ${player.latestGameDate || "—"}`}\n動態：${player.news}\n觀察：${player.insight}`)].join("\n");
}
