import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { collectSnapshot, formatChanges, formatSummary, hasChanges } from "./tracker-data.mjs";

const args = new Set(process.argv.slice(2));
const modeArgument = process.argv.find((value) => value.startsWith("--mode="));
const mode = modeArgument?.split("=")[1] || "changes";
const dryRun = args.has("--dry-run");
const statePath = process.env.TRACKER_STATE_PATH || ".cache/line-tracker-state.json";
const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
const destination = process.env.LINE_DESTINATION_ID || process.env.LINE_USER_ID;

if (!['changes', 'summary'].includes(mode)) throw new Error("--mode must be changes or summary.");
if (!token) throw new Error("Configuration failed: LINE_CHANNEL_ACCESS_TOKEN is not set.");
if (!destination) throw new Error("Configuration failed: set LINE_DESTINATION_ID (or legacy LINE_USER_ID).");
if (!/^[UCR]/.test(destination)) throw new Error("Configuration failed: LINE destination must begin with U, C, or R.");
console.log(`[config] Notification mode: ${mode}; destination type: ${destination[0]} (ID hidden)`);

let previous = null;
try { previous = JSON.parse(await readFile(statePath, "utf8")); } catch (error) {
  if (error.code !== "ENOENT") throw error;
}

console.log("[data] Loading tracker data from MLB Stats API...");
const current = await collectSnapshot();
console.log(`[data] Tracker data loaded successfully: ${current.players.length} players; report date ${current.date}; game date ${current.gameDate}.`);
const shouldSend = mode === "summary" || hasChanges(previous, current);
const message = mode === "summary" ? formatSummary(current) : previous ? formatChanges(previous, current) : "";
if (message) console.log(`[message] LINE message generated successfully: ${message.length} characters.`);

if (shouldSend) {
  if (message.length > 5000) throw new Error(`LINE message exceeds 5,000 characters (${message.length}).`);
  if (dryRun) console.log(`Dry run: would send ${mode} message (${message.length} characters).`);
  else {
    console.log("[line] LINE Push API request attempted (destination and token hidden).");
    try {
      const response = await fetch("https://api.line.me/v2/bot/message/push", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ to: destination, messages: [{ type: "text", text: message }] }),
      });
      console.log(`[line] LINE API response status: ${response.status} ${response.statusText || ""}`.trim());
      if (!response.ok) {
        const requestId = response.headers?.get?.("x-line-request-id");
        throw new Error(`LINE rejected the notification (${response.status})${requestId ? `; request ID ${requestId}` : ""}. Check the Actions secret, destination, friendship/block status, and Messaging API console.`);
      }
      console.log("[line] Notification succeeded.");
    } catch (error) {
      console.error(`[line] Notification failed: ${error.message}`);
      throw error;
    }
  }
} else {
  console.log(previous ? "No tracked data changed; no LINE message sent." : "Initial baseline saved; no LINE message sent.");
}

await mkdir(dirname(statePath), { recursive: true });
const temporaryPath = `${statePath}.tmp`;
await writeFile(temporaryPath, `${JSON.stringify(current, null, 2)}\n`);
await rename(temporaryPath, statePath);
