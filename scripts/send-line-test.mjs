const accessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;
const destination = process.env.LINE_DESTINATION_ID || process.env.LINE_USER_ID;
const dryRun = process.argv.includes("--dry-run");

if (!accessToken) {
  throw new Error("LINE_CHANNEL_ACCESS_TOKEN is required.");
}

if (!destination) {
  throw new Error("LINE_DESTINATION_ID (or legacy LINE_USER_ID) is required.");
}

if (!/^[UCR]/.test(destination)) {
  throw new Error("LINE destination must begin with U, C, or R.");
}
console.log(`[config] Destination type: ${destination[0]} (ID hidden).`);

const body = {
  to: destination,
  messages: [
    {
      type: "text",
      text: "Taiwan MLB Tracker test: LINE notifications are connected! ⚾🇹🇼",
    },
  ],
};

if (dryRun) {
  console.log("Dry run successful. No LINE message was sent.");
  process.exit(0);
}

console.log("[line] LINE Push API request attempted (destination and token hidden).");
const response = await fetch("https://api.line.me/v2/bot/message/push", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify(body),
});

console.log(`[line] LINE API response status: ${response.status} ${response.statusText || ""}`.trim());
if (!response.ok) throw new Error(`LINE notification failed (${response.status}). Check the Actions secrets and Messaging API destination.`);

console.log("[line] Test notification succeeded.");
