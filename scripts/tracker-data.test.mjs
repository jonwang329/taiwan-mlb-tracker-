import test from "node:test";
import assert from "node:assert/strict";
import { collectSnapshot, formatChanges, formatSummary, hasChanges, players, statusLabel } from "./tracker-data.mjs";

function response(body) {
  return { ok: true, json: async () => body };
}

async function fixtureFetch(url) {
  if (url.includes("/schedule?")) return response({ dates: [{ games: [{ status: { detailedState: "Final" } }] }] });
  if (url.includes("?hydrate=")) return response({ people: [{ currentTeam: { name: "Fixture Club" }, rosterStatus: "Active", transactions: [] }] });
  if (url.includes("stats=season")) return response({ stats: [{ splits: [{ stat: { avg: ".300", obp: ".380", ops: ".900", homeRuns: 5, rbi: 20, era: "2.50", whip: "1.10", inningsPitched: "36.0", strikeOuts: 42 } }] }] });
  if (url.includes("stats=gameLog")) return response({ stats: [{ splits: [{ date: "2026-08-09", game: { gamePk: 123 }, stat: { atBats: 4, hits: 2, homeRuns: 1, rbi: 2, inningsPitched: "6.0", strikeOuts: 7, baseOnBalls: 1, earnedRuns: 1 } }] }] });
  throw new Error(`Unexpected URL: ${url}`);
}

test("daily summary contains every player and required reporting fields", async () => {
  const snapshot = await collectSnapshot({ date: "2026-08-10", gameDate: "2026-08-09", fetcher: fixtureFetch });
  const text = formatSummary(snapshot);
  assert.equal(snapshot.players.length, players.length);
  for (const player of players) assert.match(text, new RegExp(player.name));
  for (const label of ["比賽：", "出賽：", "球員狀態：", "本場：", "球季：", "動態：", "觀察："]) assert.match(text, new RegExp(label));
  assert.match(text, /午間最終日報/);
  assert.match(text, /比賽日：2026-08-09/);
  assert.ok(text.length <= 5000);
});

test("summary periods and MLB game states are explicit", () => {
  const snapshot = { date: "2026-08-10", gameDate: "2026-08-09", players: [] };
  assert.match(formatSummary(snapshot, "morning"), /早安速報/);
  assert.equal(statusLabel({ abstractGameState: "Final", detailedState: "Final" }), "FINAL — Final");
  assert.equal(statusLabel({ abstractGameState: "Live", detailedState: "In Progress" }), "LIVE / IN PROGRESS — In Progress");
  assert.equal(statusLabel({ abstractGameState: "Preview", detailedState: "Scheduled" }), "NOT STARTED — Scheduled");
});

test("change mode skips a baseline and reports changed data", async () => {
  const baseline = await collectSnapshot({ date: "2026-08-10", gameDate: "2026-08-09", fetcher: fixtureFetch });
  assert.equal(hasChanges(null, baseline), false);
  assert.equal(hasChanges(baseline, structuredClone(baseline)), false);
  const changed = structuredClone(baseline);
  changed.players[0].season = "OPS 1.000";
  assert.equal(hasChanges(baseline, changed), true);
  assert.match(formatChanges(baseline, changed), new RegExp(players[0].name));
});
