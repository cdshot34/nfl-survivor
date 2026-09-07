/* Public survivor board. */

(async function () {
  const $ = id => document.getElementById(id);

  let league, picks, week, weeks = {}, table, focus;

  try {
    ({ league, picks } = await Survivor.loadConfig());
  } catch (e) {
    return fail('Could not load league data. Check that data/league.json and data/picks.json exist.');
  }

  document.title = `${league.leagueName} — NFL Survivor ${league.season}`;
  $('league-name').textContent = league.leagueName;
  $('tagline').textContent = league.tagline || '';

  try {
    week = await Survivor.currentWeek(league);
    const needed = new Set([week]);
    Object.keys(picks).map(Number).forEach(w => {
      if (w >= league.firstWeek && w <= league.lastWeek) needed.add(w);
    });
    const loaded = await Promise.all(
      [...needed].sort((a, b) => a - b).map(w => Survivor.loadWeek(league, w))
    );
    loaded.forEach(wd => { weeks[wd.week] = wd; });
  } catch (e) {
    return fail('Could not reach the ESPN scoreboard. Results will appear once it is back.');
  }

  // If the current week is already in the books, point the page at the next one.
  focus = week;
  while (weeks[focus] && weeks[focus].allFinal && focus < league.lastWeek) {
    focus++;
    if (!weeks[focus]) weeks[focus] = await Survivor.loadWeek(league, focus);
  }

  table = Survivor.standings(league, picks, weeks);

  renderDeadline(weeks[focus]);
  renderSurvivors();
  renderBanner();
  renderPlayers(focus);
  renderBoard();
  renderGames(weeks[focus]);
  $('updated').textContent = 'Last refreshed ' + new Date().toLocaleTimeString();

  /* ---------- deadline ---------- */

  function renderDeadline(wd) {
    if (!wd || !wd.lockAt) return;
    $('deadline-bar').hidden = false;
    $('dl-week-num').textContent = `Week ${wd.week}`;
    $('dl-when').textContent =
      `Deadline ${fmtDateTime(wd.lockAt)} · first kickoff ${fmtDateTime(wd.firstKickoff)}`;

    const tick = () => {
      const ms = wd.lockAt - new Date();
      if (ms <= 0) {
        $('dl-label').textContent = 'Picks are';
        $('dl-timer').textContent = 'LOCKED';
        $('deadline-bar').classList.add('locked');
        $('deadline-bar').classList.remove('urgent');
        return;
      }
      const s = Math.floor(ms / 1000);
      const d = Math.floor(s / 86400);
      const h = Math.floor((s % 86400) / 3600);
      const m = Math.floor((s % 3600) / 60);
      const sec = s % 60;
      $('dl-timer').textContent =
        (d ? d + 'd ' : '') + h + 'h ' + String(m).padStart(2, '0') + 'm ' + String(sec).padStart(2, '0') + 's';
      $('deadline-bar').classList.toggle('urgent', ms < 6 * 3600e3);
    };
    tick();
    setInterval(tick, 1000);
  }

  /* ---------- survivor counter ---------- */

  function renderSurvivors() {
    const total = table.rows.length;
    const alive = table.alive.length;
    $('survivors').hidden = false;
    $('surv-num').textContent = alive;
    $('surv-total').textContent = total;
    $('survivors').classList.toggle('thin', alive <= 2 && alive > 0);
    $('survivors').classList.toggle('over', alive === 0);

    // Board order, so the strip reads the same way every week.
    $('surv-chips').innerHTML = table.rows.map(r =>
      `<span class="surv-chip ${r.alive ? 'in' : 'out'}" style="--accent:${r.player.color}">` +
        `<span class="dot"></span>${r.player.name}` +
        (r.alive ? '' : `<span class="wk">wk ${r.outWeek}</span>`) +
      `</span>`).join('');
  }

  /* ---------- outcome banner ---------- */

  function renderBanner() {
    const o = table.outcome;
    if (!o) return;
    const names = o.players.map(r => r.player.name).join(' & ');
    const b = $('banner');
    b.hidden = false;
    if (o.kind === 'winner') {
      b.className = 'banner champ';
      b.innerHTML = `<span class="b-emoji">🏆</span><div><b>${names}</b> is the last one standing.` +
        `<br><span class="b-sub">Everybody else is out. Pay the man.</span></div>`;
    } else if (o.kind === 'split') {
      b.className = 'banner split';
      b.innerHTML = `<span class="b-emoji">🤝</span><div>Everyone left went down in <b>Week ${o.week}</b>.` +
        `<br><span class="b-sub">${names} split the pot.</span></div>`;
    } else {
      b.className = 'banner split';
      b.innerHTML = `<span class="b-emoji">🤝</span><div>Season over with <b>${names}</b> still alive.` +
        `<br><span class="b-sub">Split the pot.</span></div>`;
    }
  }

  /* ---------- player cards ---------- */

  function renderPlayers(focusWeek) {
    const host = $('players');
    host.innerHTML = '';
    const sorted = [...table.rows].sort((a, b) =>
      (b.alive - a.alive) || (b.wins - a.wins) || a.player.name.localeCompare(b.player.name));

    for (const r of sorted) {
      const cell = r.byWeek[focusWeek] || { status: 'none', team: '' };
      const used = Survivor.usedTeams(league, picks, r.player.id);
      const el = document.createElement('article');
      el.className = 'pcard' + (r.alive ? '' : ' dead');
      el.style.setProperty('--accent', r.player.color);

      let pickHTML;
      if (!r.alive) {
        pickHTML = `<div class="pcard-out">Eliminated in Week ${r.outWeek} — ${reasonText(r.outReason)}</div>`;
      } else if (cell.team) {
        const g = cell.game;
        pickHTML =
          `<div class="pcard-pick">` +
            `<img src="${logoFor(cell.team)}" alt="" width="40" height="40">` +
            `<div class="pp-text"><b>${cell.team}</b>` +
            `<span>${g ? g.shortName : 'no game — bye week'}</span></div>` +
            `<span class="pill ${cell.status}">${statusText(cell.status, cell.tie)}</span>` +
          `</div>`;
      } else {
        pickHTML = `<div class="pcard-nopick">No pick entered for Week ${focusWeek}</div>`;
      }

      const usedStrip = used.length
        ? `<div class="used">` + used.map(t =>
            `<img src="${logoFor(t)}" title="${t}" alt="${t}" width="20" height="20">`).join('') + `</div>`
        : '';

      el.innerHTML =
        `<header><span class="pname">${r.player.name}</span>` +
        `<span class="pstate">${r.alive ? 'ALIVE' : 'OUT'}</span></header>` +
        pickHTML +
        `<footer><span>${r.wins} week${r.wins === 1 ? '' : 's'} survived</span>` +
        `<span>${32 - new Set(used).size} teams left</span></footer>` +
        usedStrip;

      host.appendChild(el);
    }
  }

  /* ---------- season board ---------- */

  function renderBoard() {
    const wks = [];
    for (let w = league.firstWeek; w <= league.lastWeek; w++) wks.push(w);

    let html = '<thead><tr><th class="corner">Week</th>' +
      wks.map(w => `<th class="${w === focus ? 'now' : ''}">${w}</th>`).join('') +
      '</tr></thead><tbody>';

    for (const r of table.rows) {
      html += `<tr class="${r.alive ? '' : 'dead'}" style="--accent:${r.player.color}">` +
        `<th class="pname-cell">${r.player.name}${r.alive ? '' : ' <span class="skull">💀</span>'}</th>`;

      for (const w of wks) {
        const now = w === focus ? 'now' : '';
        const c = r.byWeek[w];
        if (!c || c.status === 'dead' || (!c.team && !weeks[w])) {
          html += `<td class="cell empty ${now}"></td>`;
        } else if (!c.team) {
          html += `<td class="cell none ${now}" title="No pick entered">–</td>`;
        } else {
          const cls = c.status === 'bye' ? 'loss' : c.status;
          const tip = `Week ${w}: ${c.team}` + (c.game ? ' · ' + c.game.shortName : '') +
            (c.dup ? ' · REUSED TEAM' : '');
          html += `<td class="cell ${cls} ${now} ${c.dup ? 'dup' : ''}" title="${tip}">` +
            `<img src="${logoFor(c.team)}" alt="${c.team}" width="26" height="26"></td>`;
        }
      }
      html += '</tr>';
    }
    $('board').innerHTML = html + '</tbody>';
  }

  /* ---------- week scoreboard ---------- */

  function renderGames(wd) {
    if (!wd) return;
    $('games-week').textContent = wd.week;

    const pickedBy = {};
    for (const r of table.rows) {
      const c = r.byWeek[wd.week];
      if (c && c.team) (pickedBy[c.team] = pickedBy[c.team] || []).push(r.player);
    }

    const side = (g, abbr, name, score, isWinner) =>
      `<div class="team ${isWinner ? 'w' : ''}">` +
        `<img src="${logoFor(abbr)}" alt="" width="28" height="28">` +
        `<span class="tname">${name}</span>` +
        (pickedBy[abbr] || []).map(p =>
          `<span class="tag" style="--accent:${p.color}">${p.name}</span>`).join('') +
        `<span class="score">${g.state === 'pre' ? '' : score}</span>` +
      `</div>`;

    $('games').innerHTML = wd.games.map(g =>
      `<article class="game ${g.state}">` +
        side(g, g.away, g.awayName, g.awayScore, g.winner === g.away) +
        side(g, g.home, g.homeName, g.homeScore, g.winner === g.home) +
        `<div class="gstatus">${g.state === 'pre' ? fmtDateTime(g.kickoff) : g.detail}</div>` +
      `</article>`).join('');
  }

  /* ---------- helpers ---------- */

  function statusText(s, tie) {
    return {
      win: 'WON', loss: tie ? 'TIE — OUT' : 'LOST', live: 'LIVE',
      pending: 'LOCKED IN', bye: 'BYE — INVALID', none: 'NO PICK'
    }[s] || s;
  }

  function reasonText(r) {
    return {
      loss: 'lost the game', tie: 'tie counts as a loss',
      bye: 'picked a team on bye', nopick: 'never turned in a pick'
    }[r] || r;
  }

  function fail(msg) {
    const b = document.getElementById('banner');
    b.hidden = false;
    b.className = 'banner err';
    b.textContent = msg;
  }
})();
