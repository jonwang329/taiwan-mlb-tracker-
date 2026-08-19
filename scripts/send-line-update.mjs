import { collectSnapshot, formatSummary } from "./shared-tracker-data.mjs";

const args = new Set(process.argv.slice(2));
const slotArg = process.argv.find(value => value.startsWith("--slot="));
const slot = slotArg?.slice("--slot=".length) || process.env.NOTIFICATION_SLOT || "08:00";
const dryRun = args.has("--dry-run");
const isTest = args.has("--test");
const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
const destination = process.env.LINE_DESTINATION_ID || process.env.LINE_USER_ID;

const SLOT_LABELS = {
  "07:00": "早安速報",
  "08:00": "08:00 即時更新",
  "09:00": "09:00 即時更新",
  "12:00": "午間日報",
};

if (!SLOT_LABELS[slot]) throw new Error(`Unknown notification slot: ${slot}`);
if (!token) throw new Error("Configuration failed: LINE_CHANNEL_ACCESS_TOKEN is not set.");
if (!destination) throw new Error("Configuration failed: set LINE_DESTINATION_ID (or legacy LINE_USER_ID).");
if (!/^[UCR]/.test(destination)) throw new Error("Configuration failed: LINE destination must begin with U, C, or R.");

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function loadOfficialSnapshot() {
  let lastError;
  const waits = [0, 20_000, 40_000, 60_000];
  for (let attempt = 0; attempt < waits.length; attempt += 1) {
    if (waits[attempt]) {
      console.log(`[data] Waiting ${waits[attempt] / 1000}s before MLB retry ${attempt + 1}/${waits.length}...`);
      await sleep(waits[attempt]);
    }
    try {
      console.log(`[data] Fetching fresh official MLB / MiLB data, attempt ${attempt + 1}/${waits.length}...`);
      // Intentionally do not pass any previous snapshot. If official data cannot be
      // resolved now, this run must fail rather than silently reusing stale player data.
      return await collectSnapshot({ now: new Date() });
    } catch (error) {
      lastError = error;
      console.warn(`[data] Official MLB fetch failed: ${error.message}`);
    }
  }
  throw new Error(`Official MLB data unavailable after retries: ${lastError?.message || "unknown error"}`);
}

console.log(`[config] slot=${slot}; trigger=${isTest ? "MANUAL TEST" : "PRODUCTION"}; destination type=${destination[0]} (ID hidden)`);
const current = await loadOfficialSnapshot();
console.log(`[data] Loaded ${current.players.length} players from current official data; report date=${current.date}; generated=${current.generatedAt}.`);

const base = formatSummary(current, slot === "07:00" ? "morning" : "final", isTest);
let message;
if (isTest) {
  const lines = base.split("\n");
  lines[0] = `🧪 TEST — Taiwan MLB Tracker｜${slot} ${SLOT_LABELS[slot]}`;
  message = lines.join("\n");
} else {
  message = base
    .replace("早安速報", SLOT_LABELS[slot])
    .replace("午間日報", SLOT_LABELS[slot]);
}

const checkedAt = new Intl.DateTimeFormat("zh-TW", {
  timeZone: "Asia/Taipei",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
}).format(new Date());
message += `\n\n資料來源：MLB / MiLB 官方｜本次查詢 ${checkedAt}`;

if (message.length > 5000) throw new Error(`LINE message exceeds 5,000 characters (${message.length}).`);
console.log(`[message] Generated ${message.length} characters from current official data only.`);

if (dryRun) {
  console.log("Dry run: LINE send skipped.");
  console.log(message);
  process.exit(0);
}

console.log(`[line] Sending exactly one ${isTest ? "TEST " : ""}message for slot ${slot}.`);
const response = await fetch("https://api.line.me/v2/bot/message/push", {
  method: "POST",
  headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  body: JSON.stringify({ to: destination, messages: [{ type: "text", text: message }] }),
});
console.log(`[line] LINE API response status: ${response.status} ${response.statusText || ""}`.trim());
if (!response.ok) {
  const requestId = response.headers?.get?.("x-line-request-id");
  const body = await response.text().catch(() => "");
  throw new Error(`LINE rejected the notification (${response.status})${requestId ? `; request ID ${requestId}` : ""}${body ? `; ${body.slice(0, 300)}` : ""}`);
}
console.log("[line] Notification succeeded.");
