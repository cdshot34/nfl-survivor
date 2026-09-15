/* Sealing picks until the deadline.

   A week's picks are encrypted with AES-256-GCM under a "reveal key". The reveal key is
   derived from the admin password with PBKDF2-SHA256 and the public salt in league.json,
   so any device that knows the password gets the same key. The GitHub Action that unseals
   picks after the deadline holds the same 32 bytes as the REVEAL_KEY repository secret.

   Shared by admin.html (browser) and scripts/reveal.js (Node 20+, same WebCrypto API). */

(function (root) {
  const subtle = root.crypto.subtle;
  const enc = new TextEncoder();
  const dec = new TextDecoder();

  // Every sealed week is padded to the same size, so the ciphertext length says nothing
  // about which teams were picked.
  const PAD = 512;

  const toB64 = bytes => {
    let bin = '';
    new Uint8Array(bytes).forEach(b => { bin += String.fromCharCode(b); });
    return btoa(bin);
  };
  const fromB64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));

  async function revealKeyFromPassword(password, hiddenPicks) {
    const base = await subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
    const bits = await subtle.deriveBits(
      { name: 'PBKDF2', salt: fromB64(hiddenPicks.salt), iterations: hiddenPicks.iterations, hash: 'SHA-256' },
      base, 256);
    return new Uint8Array(bits);
  }

  const importKey = bytes => subtle.importKey('raw', bytes, 'AES-GCM', false, ['encrypt', 'decrypt']);

  async function sealWeek(keyBytes, weekPicks) {
    const json = JSON.stringify(weekPicks);
    if (json.length > PAD) throw new Error('Week too large to seal.');
    const iv = root.crypto.getRandomValues(new Uint8Array(12));
    const ct = await subtle.encrypt({ name: 'AES-GCM', iv }, await importKey(keyBytes),
                                    enc.encode(json.padEnd(PAD, ' ')));
    return { iv: toB64(iv), ct: toB64(ct) };
  }

  async function openWeek(keyBytes, entry) {
    const pt = await subtle.decrypt({ name: 'AES-GCM', iv: fromB64(entry.iv) },
                                    await importKey(keyBytes), fromB64(entry.ct));
    return JSON.parse(dec.decode(pt));
  }

  const Seal = { revealKeyFromPassword, sealWeek, openWeek, toB64, fromB64 };
  if (typeof module !== 'undefined' && module.exports) module.exports = Seal;
  else root.Seal = Seal;
})(typeof globalThis !== 'undefined' ? globalThis : window);
