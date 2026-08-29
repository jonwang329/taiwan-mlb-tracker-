#!/usr/bin/env python3
import json
import math
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

SEASON = 2026
SPORT_IDS = [1, 11, 12, 13, 14, 16]
BASE = "https://statsapi.mlb.com/api/v1"
OUT = Path("data/league-benchmarks.js")


def get_json(path, params=None):
    url = f"{BASE}{path}"
    if params:
        url += "?" + urllib.parse.urlencode(params, doseq=True)
    req = urllib.request.Request(url, headers={"User-Agent": "taiwan-mlb-tracker/league-benchmark"})
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.load(resp)


def ip_to_outs(value):
    if value is None:
        return 0
    text = str(value)
    if "." in text:
        whole, frac = text.split(".", 1)
        return int(whole) * 3 + int(frac[:1] or 0)
    return int(text) * 3


def safe_rate(n, d):
    return (float(n) / float(d)) if d else None


def round_or_none(value, digits=4):
    if value is None or not math.isfinite(value):
        return None
    return round(value, digits)


def team_stat(team_id, group):
    payload = get_json(f"/teams/{team_id}/stats", {
        "stats": "season",
        "group": group,
        "season": SEASON,
    })
    stats = payload.get("stats") or []
    splits = stats[0].get("splits") if stats else []
    return (splits[0].get("stat") if splits else {}) or {}


leagues = {}
seen_teams = set()

for sport_id in SPORT_IDS:
    teams_payload = get_json("/teams", {"sportId": sport_id, "season": SEASON})
    for team in teams_payload.get("teams", []):
        team_id = team.get("id")
        league = team.get("league") or {}
        league_id = league.get("id")
        if not team_id or not league_id or team_id in seen_teams:
            continue
        seen_teams.add(team_id)
        bucket = leagues.setdefault(str(league_id), {
            "leagueId": league_id,
            "leagueName": league.get("name") or "",
            "sportId": sport_id,
            "teams": 0,
            "hitting": {"ab": 0, "h": 0, "pa": 0, "bb": 0, "so": 0},
            "pitching": {"outs": 0, "er": 0, "h": 0, "bb": 0, "so": 0, "bf": 0},
        })
        try:
            hit = team_stat(team_id, "hitting")
            pit = team_stat(team_id, "pitching")
        except Exception as exc:
            print(f"WARN team {team_id}: {exc}")
            continue

        bucket["teams"] += 1
        h = bucket["hitting"]
        h["ab"] += int(hit.get("atBats") or 0)
        h["h"] += int(hit.get("hits") or 0)
        h["pa"] += int(hit.get("plateAppearances") or 0)
        h["bb"] += int(hit.get("baseOnBalls") or 0)
        h["so"] += int(hit.get("strikeOuts") or 0)

        p = bucket["pitching"]
        p["outs"] += ip_to_outs(pit.get("inningsPitched"))
        p["er"] += int(pit.get("earnedRuns") or 0)
        p["h"] += int(pit.get("hits") or 0)
        p["bb"] += int(pit.get("baseOnBalls") or 0)
        p["so"] += int(pit.get("strikeOuts") or 0)
        p["bf"] += int(pit.get("battersFaced") or 0)

out = {
    "season": SEASON,
    "generatedAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
    "source": "MLB/MiLB Stats API team season aggregates",
    "leagues": {},
}

for league_id, bucket in leagues.items():
    h = bucket.pop("hitting")
    p = bucket.pop("pitching")
    ip = p["outs"] / 3 if p["outs"] else 0
    out["leagues"][league_id] = {
        **bucket,
        "avg": round_or_none(safe_rate(h["h"], h["ab"]), 3),
        "hitterKPct": round_or_none((safe_rate(h["so"], h["pa"]) or 0) * 100, 1) if h["pa"] else None,
        "hitterBBPct": round_or_none((safe_rate(h["bb"], h["pa"]) or 0) * 100, 1) if h["pa"] else None,
        "era": round_or_none((p["er"] * 9 / ip) if ip else None, 2),
        "whip": round_or_none(((p["bb"] + p["h"]) / ip) if ip else None, 2),
        "pitcherKPct": round_or_none((safe_rate(p["so"], p["bf"]) or 0) * 100, 1) if p["bf"] else None,
        "pitcherBBPct": round_or_none((safe_rate(p["bb"], p["bf"]) or 0) * 100, 1) if p["bf"] else None,
    }

OUT.parent.mkdir(parents=True, exist_ok=True)
OUT.write_text("window.LEAGUE_BENCHMARKS=" + json.dumps(out, ensure_ascii=False, separators=(",", ":")) + ";\n", encoding="utf-8")
print(f"Wrote {OUT} with {len(out['leagues'])} leagues")
