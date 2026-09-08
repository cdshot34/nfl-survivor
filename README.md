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
| Pick entry | Password protected; the GitHub token is encrypted at rest in the browser |

All of these live in `data/league.json` under `rules` if you want to change one.

> Week 1 of 2026 opens **Wed Sept 9, 8:20 PM ET** (NE @ SEA), so the Week 1 deadline is
> **Tue Sept 8, 8:20 PM ET**. The site computes this automatically each week — Thursday-opener
> weeks will lock Wednesday night.

## Weekly routine

1. Everyone texts you their pick before the deadline.
2. Open **`admin.html`** on the live site (the "Enter picks" button, top right).
3. Choose the week, set each player's team. Teams they've already burned are greyed out;
   teams on bye aren't listed at all.
4. Click **Save picks**. (First unlock the page with your password.)

That's it. The page commits `data/picks.json` to the repo for you over the GitHub API, Pages
rebuilds, and the board grades itself from there. No downloads, no git, works from a phone.

### One-time setup per device

The entry page is password protected. First visit on a new browser asks for two things:

1. A **GitHub token** — https://github.com/settings/personal-access-tokens/new (fine-grained),
   Repository access → Only select repositories → `cdshot34/nfl-survivor`,
   Permissions → Repository permissions → **Contents** → **Read and write**.
2. A **password** of your choosing (8+ characters).

The token is encrypted with the password (PBKDF2-SHA256, 250k iterations → AES-256-GCM) and only
the ciphertext is kept, in that browser's `localStorage`. The password itself is never stored
anywhere — a successful decrypt is what proves it was right.

After that, every visit shows a lock screen. Enter the password to reveal the form. It re-locks on
reload, on the **Lock** button, and after 30 minutes idle.

**There is no password reset.** Forget it and you clear the device and set up again with a new
token. Nothing is lost — the picks live in the repo.

#### What the password does and doesn't do

- **Does:** stop anyone else using the pick form, and make the stored token unusable without it —
  so someone at your unlocked laptop still cannot commit.
- **Doesn't:** hide the picks. `data/picks.json` is in a public repo and readable by anyone.
  The password guards *writing*, not *reading*.

If a save ever fails, the **Manual fallback** section still has Copy JSON / Download and you can
paste the file into GitHub by hand.

## Files

```
index.html          the public board
admin.html          pick entry — password gated, saves straight to GitHub
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
