/* Runs in GitHub Actions. Moves every sealed week whose deadline has passed out of
   data/sealed.json and into data/picks.json, so the public board can grade it.

   Needs the REVEAL_KEY repository secret — the base64 key shown on admin.html under
   Device settings. Exits quietly when nothing is due. */

const fs = require('fs');
const path = require('path');
const Seal = require('../assets/seal.js');

const root = path.join(__dirname, '..');
const read = p => JSON.parse(fs.readFileSync(path.join(root, p), 'utf8'));
const write = (p, obj) => fs.writeFileSync(path.join(root, p), JSON.stringify(obj, null, 2) + '\n');

(async () => {
  const league = read('data/league.json');
  const sealedPath = league.hiddenPicks.sealedPath;
  const picksPath = league.repo.picksPath;

  const sealed = fs.existsSync(path.join(root, sealedPath)) ? read(sealedPath) : { v: 1, weeks: {} };
  const picks = read(picksPath);
  const now = new Date(process.env.REVEAL_NOW || Date.now());

  const due = Object.keys(sealed.weeks).filter(w => new Date(sealed.weeks[w].lockAt) <= now);
  if (!due.length) {
    console.log('Nothing past its deadline.');
    return;
  }

  const raw = (process.env.REVEAL_KEY || '').trim();
  if (!raw) {
    console.error(`Week ${due.join(', ')} is past the deadline but the REVEAL_KEY secret is not set.`);
    process.exit(1);
  }
  const key = Seal.fromB64(raw);
  if (key.length !== 32) {
    console.error('REVEAL_KEY is not a valid key. Copy it again from admin.html → Device settings.');
    process.exit(1);
  }

  const revealed = [];
  for (const w of due) {
    try {
      picks[w] = await Seal.openWeek(key, sealed.weeks[w]);
      delete sealed.weeks[w];
      revealed.push(w);
      console.log(`Revealed week ${w}.`);
    } catch (e) {
      console.error(`Week ${w} would not unseal. REVEAL_KEY does not match the password it was sealed with.`);
      process.exitCode = 1;
    }
  }

  if (!revealed.length) return;

  const ordered = {};
  Object.keys(picks).map(Number).sort((a, b) => a - b).forEach(w => { ordered[w] = picks[w]; });
  write(picksPath, ordered);
  write(sealedPath, sealed);

  if (process.env.GITHUB_OUTPUT) {
    fs.appendFileSync(process.env.GITHUB_OUTPUT, `weeks=${revealed.join(', ')}\n`);
  }
})().catch(e => { console.error(e); process.exit(1); });
