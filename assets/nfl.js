/* Shared data layer: ESPN fetching, pick grading, elimination logic.
   Used by both the public board (app.js) and the pick entry page (admin.html). */

const ESPN = 'https://site.api.espn.com/apis/site/v2/sports/football/nfl';

const Survivor = (() => {

  const weekCache = new Map();

  async function getJSON(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${res.status} from ${url}`);
    return res.json();
  }

  async function loadConfig() {
    const bust = `?v=${Date.now()}`;
    const [league, picks] = await Promise.all([
      getJSON('data/league.json' + bust),
      getJSON('data/picks.json' + bust)
    ]);
    return { league, picks };
  }

  /* Which week is the NFL actually in right now? */
  async function currentWeek(league) {
    try {
      const d = await getJSON(`${ESPN}/scoreboard`);
      if (d.season && d.season.type === league.seasonType && d.season.year === league.season) {
        return clampWeek(d.week.number, league);
      }
      // Preseason / postseason / wrong year -> fall back to the schedule itself.
      if (d.season && d.season.year === league.season && d.season.type < league.seasonType) {
        return league.firstWeek;
      }
    } catch (e) { /* fall through */ }
    return league.lastWeek;
  }

  function clampWeek(n, league) {
    return Math.min(league.lastWeek, Math.max(league.firstWeek, n));
  }

  /* One week of games, normalized. */
  async function loadWeek(league, week) {
    if (weekCache.has(week)) return weekCache.get(week);
    const url = `${ESPN}/scoreboard?dates=${league.season}&seasontype=${league.seasonType}&week=${week}`;
    const d = await getJSON(url);
    const games = (d.events || []).map(ev => {
      const comp = ev.competitions[0];
      const home = comp.competitors.find(c => c.homeAway === 'home');
      const away = comp.competitors.find(c => c.homeAway === 'away');
      const st = ev.status.type;
      const hs = Number(home.score), as = Number(away.score);
      let winner = null;
      if (st.completed) winner = hs > as ? home.team.abbreviation
                               : as > hs ? away.team.abbreviation
                               : 'TIE';
      return {
        id: ev.id,
        kickoff: new Date(ev.date),
        shortName: ev.shortName,
        detail: st.shortDetail,
        state: st.state,             // pre | in | post
        completed: st.completed,
        home: home.team.abbreviation, homeName: home.team.shortDisplayName, homeScore: hs,
        away: away.team.abbreviation, awayName: away.team.shortDisplayName, awayScore: as,
        winner
      };
    }).sort((a, b) => a.kickoff - b.kickoff);

    const teams = new Set();
    games.forEach(g => { teams.add(g.home); teams.add(g.away); });

    const out = {
      week,
      games,
      teamsPlaying: teams,
      firstKickoff: games.length ? games[0].kickoff : null,
      lockAt: games.length
        ? new Date(games[0].kickoff.getTime() - league.lockHoursBeforeFirstGame * 3600e3)
        : null,
      allFinal: games.length > 0 && games.every(g => g.completed),
      anyStarted: games.some(g => g.state !== 'pre')
    };
    weekCache.set(week, out);
    return out;
  }

  function gameFor(weekData, team) {
    return weekData.games.find(g => g.home === team || g.away === team) || null;
  }

  /* Grade one pick against a loaded week.
     -> 'win' | 'loss' | 'live' | 'pending' | 'bye' | 'none' */
  function gradePick(league, weekData, team) {
    if (!team) return { status: 'none', game: null };
    const g = gameFor(weekData, team);
    if (!g) return { status: 'bye', game: null };
    if (!g.completed) return { status: g.state === 'in' ? 'live' : 'pending', game: g };
    if (g.winner === 'TIE') {
      return { status: league.rules.tieCountsAsLoss ? 'loss' : 'win', game: g, tie: true };
    }
    return { status: g.winner === team ? 'win' : 'loss', game: g };
  }

  /* Walk the season week by week and work out who is still alive. */
  /* opts.throughWeek: ignore restarts after this week (the admin page asks
     "who is alive going into week N"). The board passes nothing. */
  function standings(league, picks, weeks, opts = {}) {
    const state = {};
    league.players.forEach(p => {
      state[p.id] = {
        player: p, alive: true, outWeek: null, outReason: null,
        used: [], byWeek: {}, wins: 0, revivals: []
      };
    });

    const weekNums = Object.keys(weeks).map(Number).sort((a, b) => a - b);
    const restarts = (league.restarts || [])
      .filter(r => opts.throughWeek == null || r.week <= opts.throughWeek);
    const restartApplied = [];
    const timeline = [...new Set([...weekNums, ...restarts.map(r => r.week)])].sort((a, b) => a - b);

    for (const wk of timeline) {
      // A restart only fires after a wipeout: nobody alive, and it brings back exactly the
      // players who went down together last. Used teams carry over.
      const restart = restarts.find(r => r.week === wk);
      if (restart && !league.players.some(p => state[p.id].alive)) {
        const lastOut = Math.max(0, ...league.players.map(p => state[p.id].outWeek || 0));
        const back = league.players.map(p => state[p.id]).filter(s => s.outWeek === lastOut);
        back.forEach(s => {
          s.revivals.push({ outWeek: s.outWeek, outReason: s.outReason, week: wk });
          s.alive = true; s.outWeek = null; s.outReason = null;
        });
        if (back.length) restartApplied.push({ ...restart, players: back, outWeek: lastOut });
      }

      const wd = weeks[wk];
      if (!wd) continue;
      for (const p of league.players) {
        const s = state[p.id];
        const team = (picks[wk] || {})[p.id] || '';
        if (!s.alive) { s.byWeek[wk] = { status: 'dead', team: '' }; continue; }

        const graded = gradePick(league, wd, team);
        const dup = team && !league.rules.allowTeamReuse && s.used.includes(team);
        const cell = { status: graded.status, team, game: graded.game, tie: graded.tie, dup };

        if (team) s.used.push(team);

        if (graded.status === 'win') { s.wins++; }
        else if (graded.status === 'loss') { s.alive = false; s.outWeek = wk; s.outReason = graded.tie ? 'tie' : 'loss'; }
        else if (graded.status === 'bye' && wd.allFinal) { s.alive = false; s.outWeek = wk; s.outReason = 'bye'; }
        else if (graded.status === 'none' && wd.allFinal && league.rules.eliminateOnMissedPick
                 && Object.prototype.hasOwnProperty.call(picks, wk)) {
          // Only a week the commissioner actually opened in picks.json can kill someone for
          // not picking. A week that was never recorded at all penalizes nobody.
          s.alive = false; s.outWeek = wk; s.outReason = 'nopick';
        }

        s.byWeek[wk] = cell;
      }
    }

    const rows = league.players.map(p => state[p.id]);
    const alive = rows.filter(r => r.alive);
    const lastDeathWeek = Math.max(0, ...rows.filter(r => !r.alive).map(r => r.outWeek || 0));

    let outcome = null;
    if (alive.length === 1 && rows.length > 1) {
      outcome = { kind: 'winner', players: alive };
    } else if (alive.length === 0 && lastDeathWeek) {
      // Nobody left: whoever lasted longest takes it. If several went down together, they split.
      const co = rows.filter(r => r.outWeek === lastDeathWeek);
      outcome = co.length === 1
        ? { kind: 'winner', players: co }
        : { kind: 'split', players: co, week: lastDeathWeek };
    } else if (alive.length > 1 && weekNums.length &&
               Math.max(...weekNums) >= league.lastWeek && weeks[league.lastWeek] &&
               weeks[league.lastWeek].allFinal) {
      outcome = { kind: 'split-season', players: alive };
    }

    return { rows, alive, outcome, restarts: restartApplied };
  }

  function usedTeams(league, picks, playerId, throughWeek) {
    const used = [];
    Object.keys(picks).map(Number).sort((a, b) => a - b).forEach(w => {
      if (throughWeek != null && w >= throughWeek) return;
      const t = (picks[w] || {})[playerId];
      if (t) used.push(t);
    });
    return used;
  }

  return { getJSON, loadConfig, currentWeek, loadWeek, gameFor, gradePick, standings, usedTeams, clampWeek };
})();

/* Team logo from ESPN's CDN. */
function logoFor(abbr) {
  return `https://a.espncdn.com/i/teamlogos/nfl/500/${String(abbr).toLowerCase()}.png`;
}

function fmtDateTime(d) {
  if (!d) return '';
  return d.toLocaleString(undefined, {
    weekday: 'short', month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit'
  });
}
