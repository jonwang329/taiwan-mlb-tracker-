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
if (plannedDeliveryKey && deliveries[plannedDeliveryKey]) {
  console.log(`[line] Slot ${slot} was already delivered today; retry suppressed before MLB data fetch.`);
  process.exit(0);
}

console.log("[data] Loading shared tracked-player list and official MLB / MiLB data...");
const current = await collectSnapshot({previous});
console.log(`[data] Loaded ${current.players.length} players; Taiwan report date ${current.date}; schedule query ${current.scheduleWindow?.start || "—"}..${current.scheduleWindow?.end || "—"}; stale players ${current.stalePlayers || 0}.`);
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
    : `⚾ Taiwan MLB Tracker\n${taiwanTime} update check completed.\nCurrent player data was loaded and the baseline has been saved.`;
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
