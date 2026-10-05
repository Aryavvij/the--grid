/* Meal-preset quick-log parser. Pure functions (also loaded by node for tests).
   "S1"  "2x S1"  "S1 x2"  "S1 dinner"  "dinner 2x S1"  ->  { code, qty, slot } */
(function (root) {
  const SLOTS = { breakfast: 'breakfast', bfast: 'breakfast', lunch: 'lunch', dinner: 'dinner', snack: 'snack', snacks: 'snack' };

  function parseQuickLog(text) {
    const toks = String(text || '').trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (!toks.length) return null;
    let qty = 1, slot = null, code = null;
    for (let i = 0; i < toks.length; i++) {
      const t = toks[i];
      let m;
      if ((m = t.match(/^(\d+(?:\.\d+)?)x$/))) { qty = +m[1]; continue; }          // 2x
      if ((m = t.match(/^x(\d+(?:\.\d+)?)$/))) { qty = +m[1]; continue; }          // x2
      if ((m = t.match(/^(\d+(?:\.\d+)?)$/)) && toks[i + 1] === 'x') { qty = +m[1]; i++; continue; } // 2 x
      if (t === 'x' && /^\d+(\.\d+)?$/.test(toks[i + 1] || '')) { qty = +toks[++i]; continue; }       // x 2
      if (SLOTS[t]) { slot = SLOTS[t]; continue; }
      if (/^[a-z0-9_]{1,12}$/.test(t) && !code) { code = t.toUpperCase(); continue; }
      return null;                                                                 // unparseable token
    }
    if (!code || !(qty > 0) || qty > 20) return null;
    return { code, qty, slot };
  }

  /** Autocomplete: presets whose code starts with, or name contains, the typed code. */
  function suggest(text, presets, limit) {
    const p = parseQuickLog(text);
    const q = (p ? p.code : String(text || '').trim().replace(/^\S*x\s+/i, '').split(/\s+/)[0] || '').toLowerCase();
    if (!q) return [];
    return presets.filter(x => x.code.toLowerCase().startsWith(q) || (q.length >= 3 && x.name.toLowerCase().includes(q)))
      .sort((a, b) => (b.code.toLowerCase() === q) - (a.code.toLowerCase() === q) || a.code.localeCompare(b.code)).slice(0, limit || 6);
  }

  /** Macros for a preset x qty, rounded the same way the API does. */
  function scale(p, qty) {
    return { calories: Math.round(p.calories * qty), protein: +(p.protein * qty).toFixed(1), carbs: +(p.carbs * qty).toFixed(1), fat: +(p.fat * qty).toFixed(1) };
  }

  /** Default meal slot by hour when the user doesn't say. */
  function slotByHour(h) { return h < 11 ? 'breakfast' : h < 16 ? 'lunch' : h < 21 ? 'dinner' : 'snack'; }

  const api = { parseQuickLog, suggest, scale, slotByHour };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else (root.Grid = root.Grid || {}).presets = api;
})(typeof window !== 'undefined' ? window : globalThis);
