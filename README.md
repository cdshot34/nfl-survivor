# 3 Fudgepackers and Chris — NFL Survivor 2026

A single-page survivor pool board for four players. No server, no database, no accounts —
it's a static site that reads your picks out of a JSON file and grades them against the live
ESPN scoreboard. Free to host on GitHub Pages.

**Players:** Chris · Courtney · Colin · Gavin

## Rules the site enforces

| Rule | Behavior |
|---|---|
| One pick per week | One team per player per week |
| No rebuys | Once you're out, you're out — the row goes dark |
| Loss = out | Your team loses, you're eliminated |
| Tie = out | A tie counts as a loss |
| No team twice | Used teams are removed from the dropdown and flagged on the board |
| Deadline | 24 hours before the week's **first** kickoff — shown as a live countdown |
| Missed pick | Counts as an elimination once that week's games are final |
| Everyone dies same week | Those players split the pot |
| Survivor count | Live `N of 4 still alive` strip at the top of the board |

All of these live in `data/league.json` under `rules` if you want to change one.

> Week 1 of 2026 opens **Wed Sept 9, 8:20 PM ET** (NE @ SEA), so the Week 1 deadline is
> **Tue Sept 8, 8:20 PM ET**. The site computes this automatically each week — Thursday-opener
> weeks will lock Wednesday night.

## Weekly routine

1. Everyone texts you their pick before the deadline.
2. Open **`admin.html`** on the live site (the "Enter picks" button, top right).
3. Choose the week, set each player's team. Teams they've already burned are greyed out;
   teams on bye aren't listed at all.
4. Click **Save picks**.

That's it. The page commits `data/picks.json` to the repo for you over the GitHub API, Pages
rebuilds, and the board grades itself from there. No downloads, no git, works from a phone.

### One-time token setup

Saving needs a token, once per browser. The page walks you through it, but in short:

1. Go to **https://github.com/settings/personal-access-tokens/new** (fine-grained).
2. **Repository access** → Only select repositories → `cdshot34/nfl-survivor`.
3. **Permissions** → Repository permissions → **Contents** → **Read and write**.
4. Generate, copy, paste it into the token box on `admin.html`, hit **Save token**.

Scope it to this one repo and nothing else. The token is kept in that browser's `localStorage`
and is sent only to `api.github.com` — it is never written into the repo. Untick "remember"
on a shared machine, and use the **Forget token** button to clear it.

If a save ever fails, the **Manual fallback** section still has the Copy JSON / Download buttons
and you can paste the file into GitHub by hand.

## Files

```
index.html          the public board
admin.html          pick entry — saves straight to GitHub
assets/nfl.js       ESPN fetching, pick grading, elimination logic
assets/app.js       renders the board
assets/style.css    styling
data/league.json    players, season, rules, repo target
data/picks.json     written for you by admin.html
```

### `data/picks.json`

Week number → player id → team abbreviation. Empty string means no pick yet.

```json
{
  "1": { "chris": "PHI", "courtney": "BAL", "colin": "SF", "gavin": "" },
  "2": { "chris": "KC",  "courtney": "",    "colin": "",   "gavin": "" }
}
```

Player ids come from `data/league.json`. Team abbreviations are ESPN's
(`PHI`, `KC`, `WSH`, `LAR`, `LAC`, `LV`, `NYG`, `NYJ`, `SF`, `TB`, `GB`, …).

## Hosting

Already live at **https://cdshot34.github.io/nfl-survivor/**, served by GitHub Pages from the
`main` branch, root folder, of `cdshot34/nfl-survivor`.

If you ever move it to a different repo, update the `repo` block in `data/league.json` too —
that is what `admin.html` commits to. The repo must be **public**; Pages on a private repo
needs a paid plan.

## Running it locally

```bash
node server.js
```

Then open http://localhost:5199. (Opening `index.html` straight off disk won't work —
browsers block `fetch` on `file://` URLs.)

## Notes

- Results come from ESPN's public scoreboard endpoint. No API key, no rate limit worth worrying
  about at four players.
- Because the repo is public, picks are visible to anyone who reads `data/picks.json`. With four
  friends that's fine; if you'd rather picks stay hidden until lock, hold them in your texts and
  only commit them after the deadline passes.
- A player who picks a team on bye is treated as an invalid pick and eliminated once the week is
  final. The admin dropdown makes this impossible to do by accident.
