import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { collectSnapshot, formatChanges, formatSummary, hasChanges } from "./tracker-data.mjs";

const args = new Set(process.argv.slice(2));
const modeArgument = process.argv.find((value) => value.startsWith("--mode="));
const mode = modeArgument?.split("=")[1] || "changes";
const dryRun = args.has("--dry-run");
const statePath = process.env.TRACKER_STATE_PATH || ".cache/line-tracker-state.json";
const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
const userId = process.env.LINE_USER_ID;

if (!['changes', 'summary'].includes(mode)) throw new Error("--mode must be changes or summary.");
if (!token) throw new Error("LINE_CHANNEL_ACCESS_TOKEN is required.");
if (!userId?.startsWith("U")) throw new Error("LINE_USER_ID must be a LINE user ID beginning with U.");

let previous = null;
try { previous = JSON.parse(await readFile(statePath, "utf8")); } catch (error) {
  if (error.code !== "ENOENT") throw error;
}

const current = await collectSnapshot();
const shouldSend = mode === "summary" || hasChanges(previous, current);
const message = mode === "summary" ? formatSummary(current) : previous ? formatChanges(previous, current) : "";

if (shouldSend) {
  if (message.length > 5000) throw new Error(`LINE message exceeds 5,000 characters (${message.length}).`);
  if (dryRun) console.log(`Dry run: would send ${mode} message (${message.length} characters).`);
  else {
    const response = await fetch("https://api.line.me/v2/bot/message/push", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ to: userId, messages: [{ type: "text", text: message }] }),
    });
    if (!response.ok) throw new Error(`LINE push failed (${response.status}): ${await response.text()}`);
    console.log(`${mode === "summary" ? "Daily summary" : "Changed data"} sent to LINE.`);
  }
} else {
  console.log(previous ? "No tracked data changed; no LINE message sent." : "Initial baseline saved; no LINE message sent.");
}

await mkdir(dirname(statePath), { recursive: true });
const temporaryPath = `${statePath}.tmp`;
await writeFile(temporaryPath, `${JSON.stringify(current, null, 2)}\n`);
await rename(temporaryPath, statePath);
