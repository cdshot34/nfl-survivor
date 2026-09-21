# 3 Fudgepackers and Chris — NFL Survivor 2026

A single-page survivor pool board for four players. No server, no database, no accounts —
it's a static site that reads your picks out of a JSON file and grades them against the live
ESPN scoreboard. Free to host on GitHub Pages.

**Players:** Chris · Courtney · Colin · Gavin

## Rules the site enforces

| Rule | Behavior |
|---|---|
| One pick per week | One team per player per week |
| No rebuys | Once you're out, you're out — unless the commissioner grants one (below) |
| Loss = out | Your team loses, you're eliminated |
| Tie = out | A tie counts as a loss |
| No team twice | Used teams are removed from the dropdown and flagged on the board |
| Deadline | 24 hours before the week's **first** kickoff — shown as a live countdown |
| Missed pick | Counts as an elimination once that week's games are final |
| Everyone dies same week | Those players split the pot — unless a restart is declared (below) |
| Survivor count | Live `N of 4 still alive` strip at the top of the board |
| Pick entry | Password protected; the GitHub token is encrypted at rest in the browser |

All of these live in `data/league.json` under `rules` if you want to change one.

### Restarts

If everyone left goes down in the same week, you can bring them all back instead of splitting.
Add an entry to `restarts` in `data/league.json`:

```json
"restarts": [
  { "week": 2, "note": "Week 1 teams stay burned. Nobody can take their original pick again." }
]
```

From that week on, the players who went out together are alive again. What carries over:

- **Used teams stay burned.** Their earlier picks are still greyed out in the entry dropdowns and
  would be flagged as a reuse on the board.
- **The history stays.** The losing week stays red on the season board, and revived players get
  a ↺ marker.
- **It only fires after a real wipeout.** If anyone is still alive when the restart week comes
  round, the entry does nothing.

The 2026 season already has one: all four went out in Week 1 (ARI beat LAC, NYG beat DAL), so
everyone is back in from Week 2.

### Rebuys

A restart covers a whole wipeout. To bring back **one** player while the others are still in,
add a `rebuys` entry instead:

```json
"rebuys": [
  { "week": 3, "player": "colin", "note": "Colin bought back in after losing Week 2." }
]
```

`player` is an id from `players`. From that week the player is alive again, and as with a
restart their used teams stay burned — the entry dropdown keeps every team they have already
picked greyed out, in a losing week as much as a winning one. The board shows a 💸 banner and a
↺ next to their name, and the losing week stays red on the season board.

A rebuy aimed at someone who is still alive does nothing, so a stale entry can't quietly hand
anyone an extra life. Money side of a rebuy is between you four; the site only tracks who is in.

The 2026 season has one: Colin lost Week 2 with TB and bought back in from Week 3.

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
- **Also:** keeps picks secret until the deadline — see *Hidden picks* below.
- **Doesn't:** protect the board. The board is public on purpose.

**Use the same password on every device.** It is also where the key that hides picks comes from,
so a device with a different password can't open that week's hidden picks.

If a save ever fails, the **Manual fallback** section still has Copy JSON / Download and you can
paste the file into GitHub by hand.

## Hidden picks

Picks saved before a week's deadline are **encrypted**. The board shows who has a pick in
(🔒 and "3 of 4 picks in · hidden"), but not which team, until the deadline passes.

Hiding them on the page wouldn't be enough: `data/picks.json` and the commit history are
public. So the picks never go into the repo as readable text before the deadline:

- **Before the deadline**, a save writes that week to `data/sealed.json`, encrypted with
  AES-256-GCM. The key comes from your admin password (PBKDF2-SHA256, 600k iterations, using the
  salt in `league.json`). Every sealed week is padded to the same size, and the commit message
  just says "hidden until the deadline".
- **After the deadline**, the **Reveal picks** GitHub Action
  (`.github/workflows/reveal.yml`) runs every 15 minutes. It unseals any week whose deadline has
  passed and moves it into `picks.json`, and the board starts grading it.

### One-time setup: the `REVEAL_KEY` secret

The Action needs the key. On `admin.html`, unlock, open **Device settings**, click **Copy** next
to *Reveal key*, then add it at
**https://github.com/cdshot34/nfl-survivor/settings/secrets/actions/new**:

- Name: `REVEAL_KEY`
- Secret: paste the key

GitHub keeps Actions secrets private, even in a public repo. The key comes from your password,
so it only changes if you change the password — update the secret if you do.

### If the Action doesn't run

GitHub's scheduled runs can lag, and they won't work at all without the secret. Either way,
`admin.html` shows a **Reveal now** button once a deadline has passed. You can also trigger the
Action by hand from the repo's **Actions** tab → *Reveal picks* → *Run workflow*.

### Limits worth knowing

- Anyone can copy `sealed.json` and try to guess the password offline. A long password makes that
  pointless; a short one doesn't. The only thing it would reveal is picks, early.
- Picks that were already public stay in the git history. Hiding starts from the first save
  after this was added.
- The **Manual fallback** JSON on `admin.html` shows every pick in the clear. Pasting it into
  `picks.json` before a deadline makes those picks public.

## Files

```
index.html          the public board
admin.html          pick entry — password gated, saves straight to GitHub
assets/nfl.js       ESPN fetching, pick grading, elimination logic
assets/app.js       renders the board
assets/seal.js      encrypts and decrypts hidden weeks (browser and the Action)
assets/style.css    styling
data/league.json    players, season, rules, repo target
data/picks.json     picks that are public — written by admin.html and the Action
data/sealed.json    picks still hidden until their deadline
scripts/reveal.js   unseals weeks past their deadline
.github/workflows/reveal.yml   runs reveal.js every 15 minutes
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
- Picks stay encrypted until the deadline (see *Hidden picks*). Once a week is revealed, it is
  public in `data/picks.json` like everything else.
- A player who picks a team on bye is treated as an invalid pick and eliminated once the week is
  final. The admin dropdown makes this impossible to do by accident.
