(() => {
  const num = value => Number(value || 0);
  const val = (value, fallback = '—') => value ?? fallback;

  function formatTodayStatLine(player, stat = {}) {
    if (player?.group === 'pitching') {
      return `${val(stat.inningsPitched, '0')} IP · ${val(stat.hits, 0)} H · ${val(stat.earnedRuns, 0)} ER · ${val(stat.baseOnBalls, 0)} BB · ${val(stat.strikeOuts, 0)} K${stat.battersFaced != null ? ` · ${stat.battersFaced} BF` : ''}`;
    }

    const events = [];
    if (stat.plateAppearances != null) events.push(`${stat.plateAppearances} PA`);
    if (num(stat.baseOnBalls)) events.push(`${stat.baseOnBalls} BB`);
    if (num(stat.strikeOuts)) events.push(`${stat.strikeOuts} K`);
    if (num(stat.hitByPitch)) events.push(`${stat.hitByPitch} HBP`);
    if (num(stat.homeRuns)) events.push(`${stat.homeRuns} HR`);
    if (num(stat.rbi)) events.push(`${stat.rbi} RBI`);
    if (num(stat.stolenBases)) events.push(`${stat.stolenBases} SB`);
    if (num(stat.caughtStealing)) events.push(`${stat.caughtStealing} CS`);
    return `${val(stat.hits, 0)}-${val(stat.atBats, 0)}${events.length ? ` · ${events.join(' · ')}` : ''}`;
  }

  window.TaiwanTodayStatLine = formatTodayStatLine;
})();
