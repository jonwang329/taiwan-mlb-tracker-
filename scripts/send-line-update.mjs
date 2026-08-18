import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { formatChanges, formatSummary, hasChanges } from "./shared-tracker-data.mjs";

const args = new Set(process.argv.slice(2));
const modeArgument = process.argv.find(value => value.startsWith("--mode="));
const mode = modeArgument?.split("=")[1] || "changes";
const dryRun = args.has("--dry-run");
const isTest = args.has("--test");
const statePath = process.env.TRACKER_STATE_PATH || ".cache/line-tracker-state.json";
const slot = process.env.NOTIFICATION_SLOT || "";
const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
const destination = process.env.LINE_DESTINATION_ID || process.env.LINE_USER_ID;
const dashboardSnapshotPath = process.env.DASHBOARD_SNAPSHOT_PATH || "data/dashboard-snapshot.js";
const MAX_CANONICAL_AGE_MS = 90 * 60 * 1000;
const taiwanDate = () => new Intl.DateTimeFormat("en-CA", { timeZone:"Asia/Taipei", year:"numeric", month:"2-digit", day:"2-digit" }).format(new Date());

if (!["changes", "morning", "final", "summary"].includes(mode)) throw new Error("--mode must be changes, morning, final, or summary.");
if (!token) throw new Error("Configuration failed: LINE_CHANNEL_ACCESS_TOKEN is not set.");
if (!destination) throw new Error("Configuration failed: set LINE_DESTINATION_ID (or legacy LINE_USER_ID).");
if (!/^[UCR]/.test(destination)) throw new Error("Configuration failed: LINE destination must begin with U, C, or R.");
console.log(`[config] Notification mode: ${mode}; slot: ${slot || "manual"}; trigger: ${isTest ? "MANUAL TEST" : "PRODUCTION"}; destination type: ${destination[0]} (ID hidden)`);

function number(value) { return Number(value || 0); }
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
function hasAppearance(group, stat = {}) {
  return group === "pitching"
    ? number(stat.battersFaced) > 0 || number(stat.pitchesThrown) > 0 || number(stat.inningsPitched) > 0
    : number(stat.plateAppearances) > 0 || number(stat.atBats) > 0 || number(stat.runs) > 0 || number(stat.baseOnBalls) > 0 || number(stat.hitByPitch) > 0 || number(stat.sacFlies) > 0 || number(stat.sacBunts) > 0;
}
async function loadCanonicalDashboardSnapshot() {
  const text = await readFile(dashboardSnapshotPath, "utf8");
  const match = text.match(/window\.CENTRAL_DASHBOARD_SNAPSHOT\s*=\s*(.*);\s*$/s);
  if (!match) throw new Error("Canonical dashboard snapshot is unreadable; refusing to send LINE data.");
  const source = JSON.parse(match[1]);
  if (!Array.isArray(source.players) || !Array.isArray(source.results) || source.players.length !== source.results.length) {
    throw new Error("Canonical dashboard snapshot has mismatched players/results; refusing to send LINE data.");
  }
  const ageMs = Date.now() - Number(source.savedAt || 0);
  if (!Number.isFinite(ageMs) || ageMs < 0 || ageMs > MAX_CANONICAL_AGE_MS) {
    throw new Error(`Canonical dashboard snapshot is stale (${Math.round(ageMs / 60000)} min); refusing to send a possibly-wrong LINE report.`);
  }
  const date = taiwanDate();
  const players = source.players.map((player, index) => {
    const result = source.results[index] || {};
    const today = result.today?.date === date && hasAppearance(player.group, result.today?.stat || {}) ? result.today : null;
    const todayGamePk = today?.game?.gamePk;
    const todayLog = todayGamePk ? (result.games || []).find(game => game?.game?.gamePk === todayGamePk) : null;
    const team = todayLog?.team?.name || result.latest?.team?.name || player.org || "Team unavailable";
    return {
      id: player.id,
      name: player.name,
      group: player.group,
      team,
      status: team,
      played: Boolean(today),
      gameDate: today ? date : "",
      level: today?.level || result.latest?.level || "—",
      gameStatus: today ? (today.live ? "LIVE / IN PROGRESS — canonical dashboard" : "RECORDED — canonical dashboard") : "NO GAME — canonical dashboard",
      performance: today ? performance(player.group, today.stat) : "Did not play",
      season: seasonLine(player.group, result.season || {}),
      latestGameDate: today ? date : String(result.latest?.date || "").slice(0, 10),
      liveSource: Boolean(today?.live),
    };
  });
  const active = players.filter(player => player.played).map(player => `${player.name}: ${player.performance}`);
  console.log(`[data] Canonical dashboard snapshot age ${Math.round(ageMs / 60000)} min; Taiwan date ${date}; today active ${active.length}.`);
  active.forEach(line => console.log(`[data] ${line}`));
  return { date, gameDate: date, generatedAt: new Date(Number(source.savedAt)).toISOString(), stalePlayers: 0, players };
}

let previous = null;
try { previous = JSON.parse(await readFile(statePath, "utf8")); } catch (error) { if (error.code !== "ENOENT") throw error; }
const deliveries = previous?._deliveries && typeof previous._deliveries === "object" ? previous._deliveries : {};
const plannedDeliveryKey = !isTest && slot ? `${taiwanDate()}:${slot}` : "";
if (plannedDeliveryKey && deliveries[plannedDeliveryKey]) {
  console.log(`[line] Slot ${slot} was already delivered today; retry suppressed before canonical snapshot read.`);
  process.exit(0);
}

console.log("[data] Loading the SAME canonical snapshot used by the dashboard/menu; LINE will not re-query MLB independently.");
const current = await loadCanonicalDashboardSnapshot();
const summaryPeriod = mode === "morning" ? "morning" : "final";
const deliveryKey = !isTest && slot ? `${current.date}:${slot}` : "";
const alreadyDelivered = Boolean(deliveryKey && deliveries[deliveryKey]);
const changed = hasChanges(previous, current);
let shouldSend = isTest || (!alreadyDelivered && (deliveryKey ? true : mode !== "changes" || changed));
let message = "";

if (isTest) message = formatSummary(current, summaryPeriod, true);
else if (mode !== "changes") message = formatSummary(current, summaryPeriod, false);
else if (previous && changed) message = formatChanges(previous, current, false);
else if (deliveryKey) {
  const taiwanTime = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Taipei", dateStyle: "short", timeStyle: "short", hour12: false }).format(new Date());
  message = previous
    ? `⚾ Taiwan MLB Tracker\n${taiwanTime} update check completed.\nNo new player changes since the previous update.`
    : `⚾ Taiwan MLB Tracker\n${taiwanTime} update check completed.\nCurrent canonical dashboard data was loaded and the baseline has been saved.`;
}
if (message) console.log(`[message] Generated ${message.length} characters.`);

let deliveredNow = false;
if (shouldSend) {
  if (!message) message = isTest ? formatSummary(current, summaryPeriod, true) : `⚾ Taiwan MLB Tracker\nUpdate check completed.`;
  if (message.length > 5000) throw new Error(`LINE message exceeds 5,000 characters (${message.length}).`);
  if (dryRun) console.log(`Dry run: would send ${isTest ? "TEST " : ""}${mode} message.`);
  else {
    console.log(`[line] Send attempt UTC: ${new Date().toISOString()}`);
    console.log(`[line] Send attempt Taiwan: ${new Intl.DateTimeFormat("en-CA", {timeZone:"Asia/Taipei", dateStyle:"short", timeStyle:"medium", hour12:false}).format(new Date())}`);
    const response = await fetch("https://api.line.me/v2/bot/message/push", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ to: destination, messages: [{ type: "text", text: message }] }),
    });
    console.log(`[line] LINE API response status: ${response.status} ${response.statusText || ""}`.trim());
    if (!response.ok) {
      const requestId = response.headers?.get?.("x-line-request-id");
      throw new Error(`LINE rejected the notification (${response.status})${requestId ? `; request ID ${requestId}` : ""}.`);
    }
    deliveredNow = true;
    console.log("[line] Notification succeeded.");
  }
} else if (alreadyDelivered) console.log(`[line] Slot ${slot} was already delivered today; retry suppressed.`);
else console.log(previous ? "No tracked data changed; no LINE message sent." : "Initial baseline saved; no LINE message sent.");

if (!isTest && !alreadyDelivered) {
  const nextState = { ...current, _deliveries: { ...deliveries } };
  if (deliveredNow && deliveryKey) nextState._deliveries[deliveryKey] = new Date().toISOString();
  await mkdir(dirname(statePath), { recursive: true });
  const temporaryPath = `${statePath}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(nextState, null, 2)}\n`);
  await rename(temporaryPath, statePath);
} else if (alreadyDelivered) console.log("[state] Retry did not overwrite the successful slot snapshot.");
else console.log("[test] Manual test does not modify the production snapshot.");
