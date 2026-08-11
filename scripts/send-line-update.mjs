import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { collectSnapshot, formatChanges, formatSummary, hasChanges } from "./shared-tracker-data.mjs";

const args = new Set(process.argv.slice(2));
const modeArgument = process.argv.find(value => value.startsWith("--mode="));
const mode = modeArgument?.split("=")[1] || "changes";
const dryRun = args.has("--dry-run");
const isTest = args.has("--test");
const statePath = process.env.TRACKER_STATE_PATH || ".cache/line-tracker-state.json";
const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
const destination = process.env.LINE_DESTINATION_ID || process.env.LINE_USER_ID;

if (!["changes", "morning", "final", "summary"].includes(mode)) throw new Error("--mode must be changes, morning, or final.");
if (!token) throw new Error("Configuration failed: LINE_CHANNEL_ACCESS_TOKEN is not set.");
if (!destination) throw new Error("Configuration failed: set LINE_DESTINATION_ID (or legacy LINE_USER_ID).");
if (!/^[UCR]/.test(destination)) throw new Error("Configuration failed: LINE destination must begin with U, C, or R.");
console.log(`[config] Notification mode: ${mode}; trigger: ${isTest ? "MANUAL TEST" : "PRODUCTION"}; destination type: ${destination[0]} (ID hidden)`);

let previous = null;
try { previous = JSON.parse(await readFile(statePath, "utf8")); } catch (error) { if (error.code !== "ENOENT") throw error; }

console.log("[data] Loading shared tracked-player list and MLB Stats API data...");
const current = await collectSnapshot();
console.log(`[data] Loaded ${current.players.length} players; report date ${current.date}; game date ${current.gameDate}.`);
const summaryPeriod = mode === "morning" ? "morning" : "final";
const shouldSend = isTest || mode !== "changes" || hasChanges(previous, current);
let message = "";
if (isTest) message = formatSummary(current, summaryPeriod, true);
else if (mode !== "changes") message = formatSummary(current, summaryPeriod, false);
else if (previous) message = formatChanges(previous, current, false);
if (message) console.log(`[message] Generated ${message.length} characters.`);

if (shouldSend) {
  if (!message) message = isTest ? formatSummary(current, summaryPeriod, true) : "";
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
    console.log("[line] Notification succeeded.");
  }
} else console.log(previous ? "No tracked data changed; no LINE message sent." : "Initial baseline saved; no LINE message sent.");

if (!isTest) {
  await mkdir(dirname(statePath), { recursive: true });
  const temporaryPath = `${statePath}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(current, null, 2)}\n`);
  await rename(temporaryPath, statePath);
} else console.log("[test] Manual test does not modify the production snapshot.");
