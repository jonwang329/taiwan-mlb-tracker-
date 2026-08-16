import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { collectSnapshot, formatChanges, formatSummary, hasChanges } from "./shared-tracker-data.mjs";

const args = new Set(process.argv.slice(2));
const modeArgument = process.argv.find(value => value.startsWith("--mode="));
const mode = modeArgument?.split("=")[1] || "changes";
const dryRun = args.has("--dry-run");
const isTest = args.has("--test");
const statePath = process.env.TRACKER_STATE_PATH || ".cache/line-tracker-state.json";
const slot = process.env.NOTIFICATION_SLOT || "";
const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
const destination = process.env.LINE_DESTINATION_ID || process.env.LINE_USER_ID;
const taiwanDate = () => new Intl.DateTimeFormat("en-CA", { timeZone:"Asia/Taipei", year:"numeric", month:"2-digit", day:"2-digit" }).format(new Date());

if (!["changes", "morning", "final", "summary"].includes(mode)) throw new Error("--mode must be changes, morning, or final.");
if (!token) throw new Error("Configuration failed: LINE_CHANNEL_ACCESS_TOKEN is not set.");
if (!destination) throw new Error("Configuration failed: set LINE_DESTINATION_ID (or legacy LINE_USER_ID).");
if (!/^[UCR]/.test(destination)) throw new Error("Configuration failed: LINE destination must begin with U, C, or R.");
console.log(`[config] Notification mode: ${mode}; slot: ${slot || "manual"}; trigger: ${isTest ? "MANUAL TEST" : "PRODUCTION"}; destination type: ${destination[0]} (ID hidden)`);

let previous = null;
try { previous = JSON.parse(await readFile(statePath, "utf8")); } catch (error) { if (error.code !== "ENOENT") throw error; }
const deliveries = previous?._deliveries && typeof previous._deliveries === "object" ? previous._deliveries : {};
const plannedDeliveryKey = !isTest && slot ? `${taiwanDate()}:${slot}` : "";
if (plannedDeliveryKey && deliveries[plannedDeliveryKey]) { console.log(`[line] Slot ${slot} was already delivered today; retry suppressed before MLB data fetch.`); process.exit(0); }

console.log("[data] Loading shared tracked-player list and official MLB / MiLB data...");
const current = await collectSnapshot({previous});
console.log(`[data] Loaded ${current.players.length} players; Taiwan report date ${current.date}; stale players ${current.stalePlayers || 0}.`);
const summaryPeriod = mode === "morning" ? "morning" : "final";
const deliveryKey = !isTest && slot ? `${current.date}:${slot}` : "";
const alreadyDelivered = Boolean(deliveryKey && deliveries[deliveryKey]);
const changed = hasChanges(previous, current);
let shouldSend = isTest || (!alreadyDelivered && (deliveryKey ? true : mode !== "changes" || changed));
let message = "";
if (isTest) message = formatSummary(current, summaryPeriod, true);
else if (mode !== "changes") message = formatSummary(current, summaryPeriod, false);
else if (previous && changed) message = formatChanges(previous, current, false);
else if (deliveryKey) message = `⚾ Taiwan MLB Tracker\nUpdate check completed. No new player changes.`;

function todayPlayers(snapshot) { return (snapshot.players || []).filter(p => p.played && p.gameDate === snapshot.date); }
function flexText(text, size="sm", weight="regular", color="#333333", wrap=true) { return {type:"text", text:String(text), size, weight, color, wrap}; }
function buildFlex(snapshot) {
  const active = todayPlayers(snapshot);
  const contents = [
    {type:"box", layout:"horizontal", alignItems:"center", contents:[
      flexText("🇹🇼⚾ TMLB Tracker","lg","bold","#111111"),
      {type:"box",layout:"vertical",flex:0,backgroundColor:"#E53935",cornerRadius:"10px",paddingAll:"6px",contents:[{type:"text",text:"LIVE",size:"xs",weight:"bold",color:"#FFFFFF",align:"center"}]}
    ]},
    flexText(`${snapshot.date}  今日出賽 ${active.length} 位`,"sm","regular","#777777")
  ];
  if (!active.length) contents.push({type:"separator",margin:"lg"}, flexText("目前沒有追蹤球員在今天出賽。","md","bold","#222222"));
  for (const p of active) {
    const live = p.liveSource || String(p.gameStatus||"").includes("LIVE");
    contents.push(
      {type:"separator",margin:"lg"},
      {type:"box",layout:"vertical",margin:"lg",spacing:"sm",contents:[
        {type:"box",layout:"horizontal",contents:[flexText(p.name,"md","bold","#111111"), flexText(live?"● LIVE":"FINAL","xs","bold",live?"#E53935":"#777777",false)]},
        flexText(`${p.team} · ${p.level}`,"xs","regular","#777777"),
        flexText(p.performance,"lg","bold","#111111"),
        flexText(`球季  ${p.season}`,"xs","regular","#777777")
      ]}
    );
  }
  return {type:"flex",altText:`Taiwan MLB Tracker｜${snapshot.date} 今日出賽 ${active.length} 位`,contents:{type:"bubble",size:"mega",body:{type:"box",layout:"vertical",spacing:"md",paddingAll:"20px",contents}}};
}

let deliveredNow = false;
if (shouldSend) {
  if (!message) message = formatSummary(current, summaryPeriod, isTest);
  if (message.length > 5000) throw new Error(`LINE message exceeds 5,000 characters (${message.length}).`);
  if (dryRun) console.log(`Dry run: would send ${isTest ? "TEST Flex" : mode} message.`);
  else {
    const lineMessage = isTest ? buildFlex(current) : {type:"text",text:message};
    const response = await fetch("https://api.line.me/v2/bot/message/push", {method:"POST",headers:{Authorization:`Bearer ${token}`,"Content-Type":"application/json"},body:JSON.stringify({to:destination,messages:[lineMessage]})});
    console.log(`[line] LINE API response status: ${response.status} ${response.statusText || ""}`.trim());
    if (!response.ok) { const detail = await response.text(); throw new Error(`LINE rejected notification (${response.status}): ${detail}`); }
    deliveredNow = true; console.log("[line] Notification succeeded.");
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
