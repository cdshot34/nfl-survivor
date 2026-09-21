/* Runs in GitHub Actions. Moves every sealed week whose deadline has passed out of
   data/sealed.json and into data/picks.json, so the public board can grade it.

   Needs the REVEAL_KEY repository secret — the base64 key shown on admin.html under
   Device settings.

   With CHECK_KEY=1 (the "Check REVEAL_KEY" box when running the workflow by hand) it also
   reports whether that secret matches the key the picks were sealed with, and fails if not.
   Without it, a scheduled run only complains when a week is actually due. */

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
  const checking = process.env.CHECK_KEY === '1';

  const due = Object.keys(sealed.weeks).filter(w => new Date(sealed.weeks[w].lockAt) <= now);

  /* ---- what shape is the secret in? ---- */

  const raw = (process.env.REVEAL_KEY || '').trim();
  let key = null, keyProblem = null, mine = null;
  if (!raw) {
    keyProblem = 'The REVEAL_KEY secret is not set. Add it at Settings → Secrets and variables → Actions.';
  } else {
    try { key = Seal.fromB64(raw); } catch (e) { key = null; }
    if (!key || key.length !== 32) {
      keyProblem = 'REVEAL_KEY is not a valid key — it should be the exact string copied from ' +
                   'admin.html → Device settings, with no quotes or spaces.';
      key = null;
    } else {
      mine = await Seal.fingerprint(key);
    }
  }

  const theirs = sealed.keyFingerprint || null;
  if (mine) console.log(`REVEAL_KEY fingerprint:  ${mine}`);
  if (theirs) console.log(`picks were sealed with:  ${theirs}`);
  const mismatch = mine && theirs && mine !== theirs;
  const mismatchMsg =
    `REVEAL_KEY (${mine}) is not the key your picks were sealed with (${theirs}). ` +
    'Copy the key again from admin.html → Device settings, on the device you save picks from.';

  if (checking) {
    if (keyProblem) { console.error(keyProblem); process.exit(1); }
    if (!theirs) {
      console.error('No fingerprint recorded yet. Save picks once from admin.html, then run this again.');
      process.exit(1);
    }
    if (mismatch) { console.error(mismatchMsg); process.exit(1); }
    console.log('REVEAL_KEY matches the key your picks are sealed with.');
  } else if (keyProblem && !due.length) {
    console.log('Note: ' + keyProblem);
  }

  /* ---- reveal anything past its deadline ---- */

  if (!due.length) {
    console.log('Nothing past its deadline.');
    return;
  }
  if (keyProblem) {
    console.error(`Week ${due.join(', ')} is past the deadline. ${keyProblem}`);
    process.exit(1);
  }
  if (mismatch) {
    console.error(`Week ${due.join(', ')} is past the deadline. ${mismatchMsg}`);
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
      console.error(`Week ${w} would not unseal. ${mismatchMsg}`);
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
