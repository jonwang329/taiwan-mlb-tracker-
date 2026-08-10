const accessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;
const userId = process.env.LINE_USER_ID;
const dryRun = process.argv.includes("--dry-run");

if (!accessToken) {
  throw new Error("LINE_CHANNEL_ACCESS_TOKEN is required.");
}

if (!userId) {
  throw new Error("LINE_USER_ID is required.");
}

if (!userId.startsWith("U")) {
  throw new Error("LINE_USER_ID must be a LINE user ID beginning with U.");
}

const body = {
  to: userId,
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

const response = await fetch("https://api.line.me/v2/bot/message/push", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify(body),
});

if (!response.ok) {
  const details = await response.text();
  throw new Error(`LINE push failed (${response.status}): ${details}`);
}

console.log("Test message sent to LINE successfully.");
