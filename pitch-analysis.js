(() => {
  const V11 = 'https://statsapi.mlb.com/api/v1.1';
  const feedCache = new Map();
  const levelEligible = level => level === 'MLB' || level === 'AAA';
  const finite = v => Number.isFinite(Number(v));
  const fmt = (v, digits=1) => finite(v) ? Number(v).toFixed(digits) : '—';
  const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));

  function levelFor(result) {
    try {
      if (typeof currentLevel === 'function') return currentLevel(result);
    } catch (_) {}
    return result?.latest?.level || result?.levels?.find(x => x.season)?.level || '—';
  }

  function gameFor(result, level) {
    if (result?.today?.game?.gamePk && result.today.level === level) {
      return { gamePk: result.today.game.gamePk, date: result.today.date, live: Boolean(result.today.live) };
    }
    const sameLevel = (result?.games || []).find(g => g?.game?.gamePk && g.level === level);
    const fallback = sameLevel || (result?.games || []).find(g => g?.game?.gamePk);
    return fallback ? { gamePk: fallback.game.gamePk, date: fallback.date, live: false } : null;
  }

  async function fetchFeed(gamePk) {
    if (feedCache.has(gamePk)) return feedCache.get(gamePk);
    const task = fetch(`${V11}/game/${gamePk}/feed/live?_=${Date.now()}`, {
      cache: 'no-store',
      headers: { Accept: 'application/json', 'Cache-Control': 'no-cache' }
    }).then(r => {
      if (!r.ok) throw new Error(`MLB game feed ${r.status}`);
      return r.json();
    }).catch(error => {
      feedCache.delete(gamePk);
      throw error;
    });
    feedCache.set(gamePk, task);
    return task;
  }

  function normalizedPitch(event, sequence) {
    const pd = event?.pitchData || {};
    const c = pd.coordinates || {};
    const h = event?.hitData || null;
    return {
      sequence,
      pitchNumber: event?.pitchNumber ?? sequence,
      type: event?.details?.type?.description || event?.details?.type?.code || 'Pitch',
      typeCode: event?.details?.type?.code || '',
      description: event?.details?.description || '',
      speed: pd.startSpeed ?? null,
      endSpeed: pd.endSpeed ?? null,
      zone: pd.zone ?? null,
      pX: c.pX ?? null,
      pZ: c.pZ ?? null,
      szTop: pd.strikeZoneTop ?? null,
      szBottom: pd.strikeZoneBottom ?? null,
      balls: event?.count?.balls ?? null,
      strikes: event?.count?.strikes ?? null,
      hit: h ? {
        exitVelocity: h.launchSpeed ?? null,
        launchAngle: h.launchAngle ?? null,
        distance: h.totalDistance ?? null,
        trajectory: h.trajectory || '',
        hardness: h.hardness || ''
      } : null
    };
  }

  function plateAppearances(feed, playerId) {
    const plays = feed?.liveData?.plays?.allPlays || [];
    return plays
      .filter(pa => Number(pa?.matchup?.batter?.id) === Number(playerId))
      .map((pa, paIndex) => {
        const pitches = (pa?.playEvents || [])
          .filter(e => e?.isPitch)
          .map((e, i) => normalizedPitch(e, i + 1));
        return {
          paIndex: paIndex + 1,
          inning: pa?.about?.inning ?? '—',
          half: pa?.about?.halfInning || '',
          result: pa?.result?.event || pa?.result?.description || '—',
          description: pa?.result?.description || '',
          pitcher: pa?.matchup?.pitcher?.fullName || '—',
          pitches
        };
      });
  }

  function zoneBounds(pitches) {
    const tops = pitches.map(p => Number(p.szTop)).filter(Number.isFinite);
    const bottoms = pitches.map(p => Number(p.szBottom)).filter(Number.isFinite);
    const avg = values => values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
    return { top: avg(tops) ?? 3.5, bottom: avg(bottoms) ?? 1.5 };
  }

  function inHeart(pitch, bounds) {
    if (!finite(pitch.pX) || !finite(pitch.pZ)) return false;
    const center = (bounds.top + bounds.bottom) / 2;
    const halfHeight = (bounds.top - bounds.bottom) / 2;
    return Math.abs(Number(pitch.pX)) <= 0.55 &&
      Math.abs(Number(pitch.pZ) - center) <= halfHeight * 0.48;
  }

  function isHardHit(pitch) {
    return finite(pitch?.hit?.exitVelocity) && Number(pitch.hit.exitVelocity) >= 95;
  }

  function allPitches(pas) {
    return pas.flatMap(pa => pa.pitches);
  }

  function summaryFor(pas) {
    const pitches = allPitches(pas);
    if (!pitches.length) return '這場比賽沒有可用的逐球追蹤資料。';

    const bounds = zoneBounds(pitches);
    const maxVelo = pitches.map(p => Number(p.speed)).filter(Number.isFinite);
    const hard = pitches.filter(isHardHit);
    const damageCandidates = pitches.filter(p => inHeart(p, bounds) && p.hit);
    const typeCounts = new Map();
    pitches.forEach(p => typeCounts.set(p.type, (typeCounts.get(p.type) || 0) + 1));
    const topType = [...typeCounts.entries()].sort((a, b) => b[1] - a[1])[0];
    const hardest = pitches
      .filter(p => finite(p?.hit?.exitVelocity))
      .sort((a, b) => Number(b.hit.exitVelocity) - Number(a.hit.exitVelocity))[0];

    const parts = [
      `本場 ${pas.length} PA、看了 ${pitches.length} 球`,
      topType ? `最多是 ${topType[0]} ${topType[1]} 球` : '',
      maxVelo.length ? `最快 ${Math.max(...maxVelo).toFixed(1)} mph` : '',
      hard.length ? `${hard.length} 球形成 95+ mph 強勁擊球` : '沒有 95+ mph 強勁擊球',
      damageCandidates.length ? `中央甜蜜帶有 ${damageCandidates.length} 球被打進場內` : '中央甜蜜帶沒有被打進場內的球'
    ].filter(Boolean);

    if (hardest) {
      parts.push(`最強擊球 ${Number(hardest.hit.exitVelocity).toFixed(1)} mph${finite(hardest.hit.launchAngle) ? `、LA ${Number(hardest.hit.launchAngle).toFixed(0)}°` : ''}`);
    }
    return parts.join('；') + '。';
  }

  function pitchOutcome(pitch, bounds) {
    const heart = inHeart(pitch, bounds);
    if (heart && isHardHit(pitch)) return '<b class="pitch-flag danger">失投候選</b>';
    if (heart && pitch.hit) return '<b class="pitch-flag warning">中央甜蜜帶</b>';
    if (isHardHit(pitch)) return '<b class="pitch-flag hard">強勁擊球</b>';
    return '';
  }

  function contactText(pitch) {
    if (!pitch.hit) return '';
    const bits = [];
    if (finite(pitch.hit.exitVelocity)) bits.push(`EV ${fmt(pitch.hit.exitVelocity)} mph`);
    if (finite(pitch.hit.launchAngle)) bits.push(`LA ${fmt(pitch.hit.launchAngle, 0)}°`);
    if (finite(pitch.hit.distance)) bits.push(`${fmt(pitch.hit.distance, 0)} ft`);
    if (pitch.hit.trajectory) bits.push(esc(pitch.hit.trajectory.replaceAll('_', ' ')));
    return bits.length ? `<span class="contact-line">${bits.join(' · ')}</span>` : '';
  }

  function pitchRows(pa, bounds) {
    if (!pa.pitches.length) return '<p class="pitch-empty">這個打席沒有逐球追蹤欄位。</p>';
    return `<div class="pitch-table">
      ${pa.pitches.map(p => `<div class="pitch-row">
        <span class="pitch-no">${p.pitchNumber}</span>
        <span><b>${esc(p.type)}</b><small>${esc(p.description)}</small></span>
        <span class="pitch-speed">${finite(p.speed) ? `${fmt(p.speed)} <small>mph</small>` : '—'}</span>
        <span class="pitch-count">${p.balls ?? '—'}-${p.strikes ?? '—'}</span>
        <span class="pitch-location">${finite(p.pX) && finite(p.pZ) ? `x ${fmt(p.pX,2)} · z ${fmt(p.pZ,2)}` : '位置 —'}</span>
        <span>${pitchOutcome(p, bounds)}${contactText(p)}</span>
      </div>`).join('')}
    </div>`;
  }

  function mapSvg(pas) {
    const pitches = allPitches(pas).filter(p => finite(p.pX) && finite(p.pZ));
    if (!pitches.length) return '<div class="pitch-map unavailable">本場沒有位置座標</div>';
    const bounds = zoneBounds(pitches);
    const w = 210, h = 230, left = 18, right = 192, top = 12, bottom = 216;
    const xMin = -1.5, xMax = 1.5, zMin = 0.5, zMax = 4.5;
    const sx = x => left + (Number(x) - xMin) / (xMax - xMin) * (right - left);
    const sy = z => bottom - (Number(z) - zMin) / (zMax - zMin) * (bottom - top);
    const zx1 = sx(-0.83), zx2 = sx(0.83), zy1 = sy(bounds.top), zy2 = sy(bounds.bottom);
    const center = (bounds.top + bounds.bottom) / 2;
    const halfHeight = (bounds.top - bounds.bottom) / 2;
    const hx1 = sx(-0.55), hx2 = sx(0.55), hy1 = sy(center + halfHeight * 0.48), hy2 = sy(center - halfHeight * 0.48);

    return `<div class="pitch-map">
      <svg viewBox="0 0 ${w} ${h}" role="img" aria-label="本場投球位置圖">
        <rect class="zone-box" x="${zx1}" y="${zy1}" width="${zx2-zx1}" height="${zy2-zy1}"></rect>
        <line class="zone-grid" x1="${zx1 + (zx2-zx1)/3}" y1="${zy1}" x2="${zx1 + (zx2-zx1)/3}" y2="${zy2}"></line>
        <line class="zone-grid" x1="${zx1 + 2*(zx2-zx1)/3}" y1="${zy1}" x2="${zx1 + 2*(zx2-zx1)/3}" y2="${zy2}"></line>
        <line class="zone-grid" x1="${zx1}" y1="${zy1 + (zy2-zy1)/3}" x2="${zx2}" y2="${zy1 + (zy2-zy1)/3}"></line>
        <line class="zone-grid" x1="${zx1}" y1="${zy1 + 2*(zy2-zy1)/3}" x2="${zx2}" y2="${zy1 + 2*(zy2-zy1)/3}"></line>
        <rect class="heart-box" x="${hx1}" y="${hy1}" width="${hx2-hx1}" height="${hy2-hy1}"></rect>
        ${pitches.map((p, i) => {
          const cls = inHeart(p, bounds) && isHardHit(p) ? 'damage' : isHardHit(p) ? 'hard' : inHeart(p, bounds) ? 'heart' : 'normal';
          return `<g class="pitch-point ${cls}">
            <circle cx="${sx(p.pX)}" cy="${sy(p.pZ)}" r="8"></circle>
            <text x="${sx(p.pX)}" y="${sy(p.pZ)+3}" text-anchor="middle">${i+1}</text>
            <title>${i+1}. ${esc(p.type)} ${finite(p.speed)?`${fmt(p.speed)} mph`:''} ${esc(p.description)}</title>
          </g>`;
        }).join('')}
      </svg>
      <div class="pitch-map-legend"><span><i class="normal"></i>一般</span><span><i class="heart"></i>中央甜蜜帶</span><span><i class="hard"></i>95+ mph</span><span><i class="damage"></i>失投候選</span></div>
    </div>`;
  }

  function paCards(pas) {
    const pitches = allPitches(pas);
    const bounds = zoneBounds(pitches);
    return `<div class="pa-list">${pas.map((pa, index) => {
      const contact = [...pa.pitches].reverse().find(p => p.hit);
      return `<details class="pa-card" ${index === pas.length - 1 ? 'open' : ''}>
        <summary>
          <span>${pa.inning}局${pa.half === 'top' ? '上' : pa.half === 'bottom' ? '下' : ''} · PA ${index+1}</span>
          <strong>${esc(pa.result)}</strong>
          <small>vs ${esc(pa.pitcher)} · ${pa.pitches.length} pitches</small>
          ${contact && finite(contact.hit?.exitVelocity) ? `<b>EV ${fmt(contact.hit.exitVelocity)} mph</b>` : ''}
        </summary>
        ${pitchRows(pa, bounds)}
      </details>`;
    }).join('')}</div>`;
  }

  function sectionHtml(player, result, game, pas) {
    const pitches = allPitches(pas);
    const maxVelo = pitches.map(p => Number(p.speed)).filter(Number.isFinite);
    const hard = pitches.filter(isHardHit).length;
    const bounds = zoneBounds(pitches);
    const damage = pitches.filter(p => inHeart(p, bounds) && p.hit).length;
    const gameDate = game?.date ? String(game.date).slice(0,10) : '最近一場';
    const savant = `https://baseballsavant.mlb.com/gamefeed?gamePk=${encodeURIComponent(game.gamePk)}`;
    const gameday = `https://www.mlb.com/gameday/${encodeURIComponent(game.gamePk)}/`;

    return `<section class="pitch-analysis" data-game-pk="${game.gamePk}">
      <div class="pitch-analysis-head">
        <div><span>PITCH-BY-PITCH · ${esc(levelFor(result))}</span><h4>逐球打席分析</h4><p>${esc(gameDate)}${game.live ? ' · LIVE' : ''}</p></div>
        <div class="pitch-source-links"><a href="${gameday}" target="_blank" rel="noopener">MLB Gameday ↗</a><a href="${savant}" target="_blank" rel="noopener">Savant ↗</a></div>
      </div>
      <div class="pitch-kpis">
        <div><span>PA</span><b>${pas.length}</b></div>
        <div><span>看球數</span><b>${pitches.length}</b></div>
        <div><span>最快球速</span><b>${maxVelo.length ? `${Math.max(...maxVelo).toFixed(1)}` : '—'}<small> mph</small></b></div>
        <div><span>95+ EV</span><b>${hard}</b></div>
        <div><span>失投候選</span><b>${damage}</b></div>
      </div>
      <div class="pitch-readout"><b>快速判讀</b><p>${esc(summaryFor(pas))}</p></div>
      <div class="pitch-analysis-grid">
        ${mapSvg(pas)}
        ${paCards(pas)}
      </div>
      <p class="pitch-method-note">「失投候選」不是官方判定：這裡只標示進入中央甜蜜帶、且被打進場內的球；95+ mph 強勁擊球另行標記。官方逐球資料仍以 MLB / Baseball Savant 為準。</p>
    </section>`;
  }

  function statusHtml(level, game, message) {
    return `<section class="pitch-analysis pitch-status">
      <div class="pitch-analysis-head"><div><span>PITCH-BY-PITCH · ${esc(level)}</span><h4>逐球打席分析</h4></div></div>
      <p>${esc(message)}</p>
      ${game?.gamePk ? `<a href="https://baseballsavant.mlb.com/gamefeed?gamePk=${encodeURIComponent(game.gamePk)}" target="_blank" rel="noopener">查看 Baseball Savant 官方 Gamefeed ↗</a>` : ''}
    </section>`;
  }

  async function renderOne(player, result) {
    const detail = document.querySelector(`#player-${player.id}`);
    if (!detail || player.group !== 'hitting') return;
    detail.querySelector('.pitch-analysis')?.remove();

    const level = levelFor(result);
    if (!levelEligible(level)) return;

    const game = gameFor(result, level);
    if (!game?.gamePk) {
      detail.insertAdjacentHTML('beforeend', statusHtml(level, null, '目前找不到 MLB / Triple-A 可分析的最近一場 gamePk。'));
      return;
    }

    detail.insertAdjacentHTML('beforeend', statusHtml(level, game, '正在讀取官方逐球資料…'));
    try {
      const feed = await fetchFeed(game.gamePk);
      if (!document.body.contains(detail)) return;
      const pas = plateAppearances(feed, player.id);
      detail.querySelector('.pitch-analysis')?.remove();
      if (!pas.length) {
        detail.insertAdjacentHTML('beforeend', statusHtml(level, game, '官方 game feed 已取得，但這場沒有找到此打者的逐球打席資料。'));
        return;
      }
      detail.insertAdjacentHTML('beforeend', sectionHtml(player, result, game, pas));
    } catch (error) {
      console.warn('Pitch-by-pitch analysis unavailable', player.name, game.gamePk, error);
      if (!document.body.contains(detail)) return;
      detail.querySelector('.pitch-analysis')?.remove();
      detail.insertAdjacentHTML('beforeend', statusHtml(level, game, '逐球資料目前暫時無法讀取；主站 box score 與 season 資料不受影響。'));
    }
  }

  let renderToken = 0;
  async function renderPitchAnalysis() {
    const token = ++renderToken;
    if (typeof players === 'undefined' || typeof lastResults === 'undefined') return;
    const snapshotPlayers = Array.isArray(players) ? [...players] : [];
    const snapshotResults = Array.isArray(lastResults) ? [...lastResults] : [];
    const jobs = snapshotPlayers.map((player, i) => ({ player, result: snapshotResults[i] }))
      .filter(x => x.result && x.player?.group === 'hitting' && levelEligible(levelFor(x.result)));
    for (const job of jobs) {
      if (token !== renderToken) return;
      await renderOne(job.player, job.result);
    }
  }

  document.addEventListener('tracker:players-loaded', () => renderPitchAnalysis().catch(() => {}));
  window.addEventListener('pageshow', () => setTimeout(() => renderPitchAnalysis().catch(() => {}), 0), { once: true });
  setTimeout(() => renderPitchAnalysis().catch(() => {}), 0);
})();
