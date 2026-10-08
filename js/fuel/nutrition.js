/* Nutrition page: day diary, preset quick-log + preset manager, custom foods, trends, plan editor.
   Demo mode keeps everything in memory for the session; login mode talks to /api/nutrition. */
(function () {
  const G = window.Grid, F = G.fmt, S = G.stats, P = () => G.presets;
  const SLOTS = ['breakfast', 'lunch', 'dinner', 'snack'];
  const LEVELS = [['sedentary', 'Sedentary (desk, little exercise)'], ['light', 'Lightly active (1-3 days/wk)'], ['moderate', 'Moderately active (3-5 days/wk)'], ['very', 'Very active (6-7 days/wk)'], ['athlete', 'Athlete (2x/day training)']];
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const addDays = (iso, n) => { const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + n); return F.date(d); };
  const st = { date: null, range: 7 };
  let demo = null;                                           // demo-mode working copy (survives page re-renders)

  // ── data layer: same calls in both modes ─────────────────────
  const store = {
    presets: [], log: [], water: {}, burn: {}, targets: null,
    async load(today) {
      const from = addDays(today, -34);
      if (G.isDemo()) {
        if (!demo) demo = {
          presets: (await G.data('presets')).map(x => ({ ...x })),
          log: (await G.data('foodlog', { from, to: today })).map(x => ({ ...x })),
          water: Object.fromEntries((await G.data('water', { from, to: today })).map(w => [w.date, w.ml])),
          burn: Object.fromEntries((await G.data('burn', { from, to: today })).map(b => [b.date, b.kcal])),
          targets: { ...(await G.data('targets')) }
        };
        Object.assign(store, demo); return;
      }
      const [presets, log, water, burn, targets] = await Promise.all([
        G.data('presets'),
        G.data('foodlog', { from, to: today }),
        G.data('water', { from, to: today }),
        G.data('burn', { from, to: today }),
        G.data('targets')
      ]);
      Object.assign(store, {
        presets,
        log,
        water: Object.fromEntries(water.map(w => [w.date, w.ml])),
        burn: Object.fromEntries((burn || []).map(b => [b.date, b.kcal])),
        targets,
        _q: { from, to: today }
      });
    },
    /** Saves change the store in place; write it back to the page cache so the next visit opens on it. */
    persist() {
      if (G.isDemo() || !store._q || !G.cacheSet) return;
      G.cacheSet('presets', {}, store.presets);
      G.cacheSet('foodlog', store._q, store.log);
      G.cacheSet('water', store._q, Object.entries(store.water).map(([date, ml]) => ({ date, ml })));
      G.cacheSet('burn', store._q, Object.entries(store.burn).map(([date, kcal]) => ({ date, kcal })));
      G.cacheSet('targets', {}, store.targets);
    },
    async addFood(e) {
      if (G.isDemo()) { const row = { id: 'n' + Date.now() + Math.random().toString(36).slice(2, 5), qty: 1, confidence: 'estimated', ...e }; demo.log.push(row); return row; }
      const row = await gridFetch('/api/nutrition/log', { method: 'POST', body: JSON.stringify(e) }); store.log.push(row); store.persist(); return row;
    },
    async logPreset(cmd, preset, date, slot) {
      if (G.isDemo()) { preset.useCount = (preset.useCount || 0) + 1; return store.addFood({ date, slot, name: preset.name, serving: preset.serving, qty: cmd.qty, presetCode: preset.code, confidence: 'exact', ...P().scale(preset, cmd.qty) }); }
      const row = await gridFetch('/api/nutrition/log-preset', { method: 'POST', body: JSON.stringify({ code: cmd.code, qty: cmd.qty, slot: cmd.slot || undefined, date }) }); store.log.push(row); store.persist(); return row;
    },
    async editFood(id, patch) {
      if (G.isDemo()) { const row = store.log.find(e => e.id === id); Object.assign(row, patch); return row; }
      const row = await gridFetch('/api/nutrition/log/' + id, { method: 'PUT', body: JSON.stringify(patch) });
      store.log = store.log.map(e => (e.id === id ? row : e)); store.persist(); return row;
    },
    /** Copy every entry of one day onto another (preset links are not kept; the numbers are). */
    async copyDay(from, to) {
      const src = store.log.filter(e => e.date === from); let n = 0;
      for (const e of src) { await store.addFood({ date: to, slot: e.slot, name: e.name, serving: e.serving || null, qty: e.qty || 1, calories: e.calories, protein: e.protein, carbs: e.carbs, fat: e.fat, confidence: e.confidence || 'estimated' }); n++; }
      return n;
    },
    async delFood(id) {
      if (!G.isDemo()) await gridFetch('/api/nutrition/log/' + id, { method: 'DELETE' });
      store.log = store.log.filter(e => e.id !== id); if (demo) demo.log = store.log; store.persist();
    },
    async savePreset(p, id) {
      if (G.isDemo()) {
        if (store.presets.some(x => x.code === p.code && x.id !== id)) throw new Error(`Preset ${p.code} already exists`);
        if (id) Object.assign(store.presets.find(x => x.id === id), p); else store.presets.push({ id: 'p' + Date.now(), useCount: 0, favorite: false, ...p }); return;
      }
      const saved = await gridFetch(id ? '/api/nutrition/presets/' + id : '/api/nutrition/presets', { method: id ? 'PUT' : 'POST', body: JSON.stringify(p) });
      store.presets = id ? store.presets.map(x => (x.id === id ? saved : x)) : [...store.presets, saved]; store.persist();
    },
    async delPreset(id) { if (!G.isDemo()) await gridFetch('/api/nutrition/presets/' + id, { method: 'DELETE' }); store.presets = store.presets.filter(x => x.id !== id); if (demo) demo.presets = store.presets; store.persist(); },
    async setWater(date, ml) { if (!G.isDemo()) await gridFetch('/api/nutrition/water/' + date, { method: 'PUT', body: JSON.stringify({ ml }) }); store.water[date] = ml; store.persist(); },
    async setBurn(date, kcal) {
      if (!G.isDemo()) await gridFetch('/api/progress/burn/' + date, { method: 'PUT', body: JSON.stringify({ kcal }) });
      else if (G.seed?.setBurn) G.seed.setBurn(date, kcal);
      store.burn[date] = kcal;
      if (demo) demo.burn[date] = kcal;
      store.persist();
    },
    async saveTargets(t) { if (!G.isDemo()) store.targets = await gridFetch('/api/nutrition/targets', { method: 'PUT', body: JSON.stringify(t) }); else store.targets = demo.targets = { ...t }; store.persist(); },
    async applyGoal(goalKey) {
      // goalKey: 'maintain' | 'cut' | 'bulk'
      const t = store.targets || {};
      const pl = t.plan || { sex: 'male', age: 21, kg: 72, cm: 175, level: 'moderate', pace: 'steady' };
      const calcGoal = goalKey === 'cut' ? 'lose' : goalKey === 'bulk' ? 'gain' : 'maintain';
      const goalKg = pl.goalKg || (calcGoal === 'lose' ? Math.round(pl.kg * 0.94) : calcGoal === 'gain' ? Math.round(pl.kg * 1.06) : pl.kg);
      const res = G.calc.plan({ ...pl, goal: calcGoal, goalKg, pace: pl.pace || 'steady' });
      if (res.ok) {
        await store.saveTargets({
          calories: res.calories,
          protein: res.protein,
          carbs: res.carbs,
          fat: res.fat,
          waterMl: res.waterMl,
          plan: { ...pl, goal: calcGoal, goalKg, bmr: res.bmr, tdee: res.tdee, weeks: res.weeks }
        });
      }
    },
  };

  const modal = G.modal, field = G.field, inp = G.input, sel = G.select, formData = G.formData;
  const numOr = (v) => (v === '' || v == null ? NaN : Number(v));

  // ── forms ────────────────────────────────────────────────────
  function presetForm(existing, prefill, done) {
    const p = existing || prefill || {};
    modal(existing ? 'EDIT PRESET · ' + existing.code : 'NEW MEAL PRESET', `
      <div style="display:grid;grid-template-columns:1fr 2fr;gap:10px">${field('Code (e.g. S1)', inp('code', p.code || '', 'maxlength="12" autocomplete="off"'))}${field('Name', inp('name', p.name || '', 'maxlength="80"'))}</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">${field('Serving', inp('serving', p.serving || '1 serving'))}${field('Default meal', sel('defaultSlot', [['', 'Auto (by time of day)'], ...SLOTS.map(s => [s, s])], p.defaultSlot || ''))}</div>
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px">${field('Calories', inp('calories', p.calories ?? '', 'inputmode="numeric"'))}${field('Protein g', inp('protein', p.protein ?? 0, 'inputmode="decimal"'))}${field('Carbs g', inp('carbs', p.carbs ?? 0, 'inputmode="decimal"'))}${field('Fat g', inp('fat', p.fat ?? 0, 'inputmode="decimal"'))}</div>
      <div class="hl-note" id="kcalHint" style="min-height:16px;margin-bottom:10px"></div><div id="err" style="color:var(--red);font-size:11px;min-height:16px;margin-bottom:8px"></div>
      <div class="modal-actions"><button class="btn-cancel" data-cancel>CANCEL</button><button class="btn-cancel" data-calc>CALORIES FROM MACROS</button><button class="btn-save" data-save>${existing ? 'SAVE CHANGES' : 'CREATE PRESET'}</button></div>`, (m, close) => {
      const hint = () => { const d = formData(m), est = Math.round(4 * (+d.protein || 0) + 4 * (+d.carbs || 0) + 9 * (+d.fat || 0)), kc = +d.calories; m.querySelector('#kcalHint').style.color = '';
        if (kc >= 0 && est && Math.abs(kc - est) > 0.1 * Math.max(kc, est)) { m.querySelector('#kcalHint').textContent = `HEADS UP: ${d.protein || 0}P / ${d.carbs || 0}C / ${d.fat || 0}F is about ${est} kcal, not ${kc}.`; m.querySelector('#kcalHint').style.color = 'var(--orange)'; } else m.querySelector('#kcalHint').textContent = est ? `MACROS ≈ ${est} KCAL` : ''; };
      m.querySelectorAll('input').forEach(i => i.addEventListener('input', hint)); hint();
      m.querySelector('[data-calc]').onclick = () => { const d = formData(m); m.querySelector('[name=calories]').value = Math.round(4 * (+d.protein || 0) + 4 * (+d.carbs || 0) + 9 * (+d.fat || 0)); hint(); };
      m.querySelector('[data-save]').onclick = async () => {
        const d = formData(m), err = m.querySelector('#err'), code = d.code.toUpperCase();
        if (!/^[A-Z0-9_]{1,12}$/.test(code)) return (err.textContent = 'Code: 1-12 letters, digits or _');
        if (!d.name) return (err.textContent = 'Name is required');
        const kcal = numOr(d.calories), pr = numOr(d.protein), cb = numOr(d.carbs), ft = numOr(d.fat);
        if (!(kcal >= 0 && kcal <= 10000)) return (err.textContent = 'Calories must be 0 to 10,000');
        if (![pr, cb, ft].every(v => v >= 0 && v <= 5000)) return (err.textContent = 'Macros must be 0 to 5,000 g');
        if (store.presets.some(x => x.code === code && x.id !== existing?.id)) return (err.textContent = `Preset ${code} already exists`);
        try { await store.savePreset({ code, name: d.name, serving: d.serving || null, calories: Math.round(kcal), protein: pr, carbs: cb, fat: ft, defaultSlot: d.defaultSlot || null }, existing?.id); close(); done(); }
        catch (e) { err.textContent = e.message || 'Could not save'; }
      };
    });
  }

  function foodForm(date, done) {
    modal('ADD CUSTOM FOOD', `
      ${field('Name', inp('name', '', 'maxlength="120"'))}
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">${field('Meal', sel('slot', SLOTS.map(s => [s, s]), P().slotByHour(new Date().getHours())))}${field('Serving', inp('serving', '', 'placeholder="1 bowl"'))}</div>
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px">${field('Calories', inp('calories', ''))}${field('Protein g', inp('protein', 0))}${field('Carbs g', inp('carbs', 0))}${field('Fat g', inp('fat', 0))}</div>
      ${field('How sure are you?', sel('confidence', [['exact', 'Exact (label / weighed)'], ['estimated', 'Estimated'], ['rough', 'Rough guess']], 'estimated'))}
      <label style="display:flex;gap:8px;align-items:center;font-size:11px;margin-bottom:10px"><input type="checkbox" name="asPreset"> SAVE AS A PRESET</label>
      <div id="codeRow" style="display:none">${field('Preset code', inp('code', '', 'maxlength="12"'))}</div>
      <div id="err" style="color:var(--red);font-size:11px;min-height:16px;margin-bottom:8px"></div><div class="modal-actions"><button class="btn-cancel" data-cancel>CANCEL</button><button class="btn-save" data-save>ADD TO DIARY</button></div>`, (m, close) => {
      m.querySelector('[name=asPreset]').onchange = (e) => { m.querySelector('#codeRow').style.display = e.target.checked ? 'block' : 'none'; };
      m.querySelector('[data-save]').onclick = async () => {
        const d = formData(m), err = m.querySelector('#err'), kcal = numOr(d.calories), pr = numOr(d.protein), cb = numOr(d.carbs), ft = numOr(d.fat);
        if (!d.name) return (err.textContent = 'Name is required');
        if (!(kcal >= 0 && kcal <= 10000)) return (err.textContent = 'Calories must be 0 to 10,000');
        if (![pr, cb, ft].every(v => v >= 0 && v <= 5000)) return (err.textContent = 'Macros must be 0 to 5,000 g');
        const code = (d.code || '').toUpperCase();
        if (d.asPreset) { if (!/^[A-Z0-9_]{1,12}$/.test(code)) return (err.textContent = 'Preset code: 1-12 letters, digits or _'); if (store.presets.some(x => x.code === code)) return (err.textContent = `Preset ${code} already exists`); }
        try {
          await store.addFood({ date, slot: d.slot, name: d.name, serving: d.serving || null, qty: 1, calories: Math.round(kcal), protein: pr, carbs: cb, fat: ft, confidence: d.confidence });
          if (d.asPreset) await store.savePreset({ code, name: d.name, serving: d.serving || null, calories: Math.round(kcal), protein: pr, carbs: cb, fat: ft, defaultSlot: d.slot });
          close(); done();
        } catch (e) { err.textContent = e.message || 'Could not save'; }
      };
    });
  }

  function planForm(done) {
    const t = store.targets || {}, pl = t.plan || {};
    const v = { sex: pl.sex || 'male', age: pl.age ?? 21, kg: pl.kg ?? 72, cm: pl.cm ?? 175, level: pl.level || 'moderate', goal: pl.goal || 'maintain', pace: pl.pace || 'steady', goalKg: pl.goalKg ?? '' };
    modal('EDIT PLAN', `
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px">${field('Sex', sel('sex', [['male', 'Male'], ['female', 'Female']], v.sex))}${field('Age', inp('age', v.age))}${field('Weight kg', inp('kg', v.kg))}${field('Height cm', inp('cm', v.cm))}</div>
      ${field('Activity level', sel('level', LEVELS, v.level))}
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px">${field('Goal', sel('goal', [['maintain', 'Maintenance (Maintain)'], ['lose', 'Cut (Lose Weight)'], ['gain', 'Bulk (Gain Muscle)']], v.goal))}${field('Pace', sel('pace', [['gentle', 'Gentle'], ['steady', 'Steady'], ['aggressive', 'Aggressive']], v.pace))}${field('Goal weight kg', inp('goalKg', v.goalKg))}</div>
      <div id="out" style="background:var(--carbon-1);border:1px solid var(--carbon-4);border-radius:8px;padding:12px;margin-bottom:10px;font-size:11px;line-height:1.8"></div>
      <details style="margin-bottom:12px"><summary class="hl-note" style="cursor:pointer">METHODOLOGY</summary><div class="hl-note" style="line-height:1.8;margin-top:6px">BMR: Mifflin-St Jeor. TDEE: BMR x standard activity multiplier. Cut: deficit for fat loss (higher protein 1.0 g/lb). Maintenance: energy balance. Bulk: controlled surplus for hypertrophy. Never below 1,500 kcal (male) or 1,200 kcal (female). General guidance, not medical advice.</div></details>
      <div class="modal-actions"><button class="btn-cancel" data-cancel>CANCEL</button><button class="btn-save" data-save>SAVE AS MY TARGETS</button></div>`, (m, close) => {
      let last = null;
      const run = () => {
        const d = formData(m), goalKg = numOr(d.goalKg), out = m.querySelector('#out');
        last = G.calc.plan({ sex: d.sex, age: numOr(d.age), kg: numOr(d.kg), cm: numOr(d.cm), level: d.level, goal: d.goal, pace: d.pace, goalKg }); last.inputs = { sex: d.sex, age: numOr(d.age), kg: numOr(d.kg), cm: numOr(d.cm), level: d.level, goal: d.goal, pace: d.pace, goalKg: isNaN(goalKg) ? null : goalKg };
        m.querySelector('[name=goalKg]').disabled = d.goal === 'maintain'; m.querySelector('[name=pace]').disabled = d.goal === 'maintain';
        out.innerHTML = last.ok ? `BMR <b>${F.num(last.bmr)}</b> · TDEE <b>${F.num(last.tdee)}</b> · TARGET <b style="color:var(--green)">${F.num(last.calories)} kcal</b> (${last.adjust >= 0 ? '+' : ''}${last.adjust})<br>PROTEIN <b>${last.protein} g</b> · CARBS <b>${last.carbs} g</b> · FAT <b>${last.fat} g</b> · WATER <b>${(last.waterMl / 1000).toFixed(1)} L</b>
          ${last.weeks ? `<br>ABOUT <b>${last.weeks} WEEKS</b> TO GOAL AT ${last.weeklyKg} KG/WEEK` : ''}${last.notes.map(n => `<br><span style="color:var(--orange)">${esc(n)}</span>`).join('')}` : `<span style="color:var(--red)">${esc(last.error)}</span>`;
      };
      m.querySelectorAll('input,select').forEach(e => e.addEventListener('input', run)); m.querySelectorAll('select').forEach(e => e.addEventListener('change', run)); run();
      m.querySelector('[data-save]').onclick = async () => {
        if (!last.ok) return;
        try { await store.saveTargets({ calories: last.calories, protein: last.protein, carbs: last.carbs, fat: last.fat, waterMl: last.waterMl, plan: { ...last.inputs, bmr: last.bmr, tdee: last.tdee, weeks: last.weeks } }); close(); done(); G.toast('TARGETS SAVED'); }
        catch (e) { G.toast((e.message || 'SAVE FAILED').toUpperCase()); }
      };
    });
  }

  const STARTERS = [['B1', 'Oats & Whey', 410, 32, 48, 9, 'breakfast'], ['B2', '3 Egg Toast', 380, 24, 28, 18, 'breakfast'], ['S1', 'Protein Bar', 210, 20, 22, 7, 'snack'], ['S2', 'Greek Yogurt & Fruit', 180, 17, 22, 2, 'snack'],
    ['S3', 'Peanut Butter Banana', 290, 9, 38, 12, 'snack'], ['L1', 'Chicken Rice Bowl', 620, 48, 70, 14, 'lunch'], ['L2', 'Dal Rice Combo', 580, 22, 92, 11, 'lunch'], ['D1', 'Paneer Wrap', 540, 28, 52, 24, 'dinner'],
    ['SHAKE', 'Post-workout Shake', 260, 40, 18, 3, 'snack'], ['COFFEE', 'Black Coffee', 5, 0, 1, 0, 'breakfast']];

  /** Edit a diary entry. Changing the quantity rescales the numbers live from the original, so 1x -> 2x just works. */
  function foodEditForm(entry, done) {
    const q0 = entry.qty || 1, base = { calories: entry.calories, protein: entry.protein, carbs: entry.carbs, fat: entry.fat };
    modal('EDIT ENTRY', `${field('Name', inp('name', entry.name, 'maxlength="120"'))}
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px">${field('Quantity', inp('qty', q0, 'inputmode="decimal"'))}${field('Meal', sel('slot', SLOTS.map(s => [s, s]), entry.slot))}${field('How sure?', sel('confidence', [['exact', 'Exact'], ['estimated', 'Estimated'], ['rough', 'Rough']], entry.confidence || 'estimated'))}</div>
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px">${field('Calories', inp('calories', entry.calories))}${field('Protein g', inp('protein', entry.protein))}${field('Carbs g', inp('carbs', entry.carbs))}${field('Fat g', inp('fat', entry.fat))}</div>
      <div class="hl-note" style="text-transform:none;line-height:1.7">Change the quantity to rescale the numbers, or type them yourself.</div>
      <div id="err" style="color:var(--red);font-size:11px;min-height:16px;margin-top:6px"></div><div class="modal-actions"><button class="btn-cancel" data-cancel>CANCEL</button><button class="btn-save" data-save>SAVE</button></div>`, (m, close) => {
      m.querySelector('[name=qty]').addEventListener('input', (e) => { const q = Number(e.target.value); if (!(q > 0) || !(q0 > 0)) return; const k = q / q0;
        m.querySelector('[name=calories]').value = Math.round(base.calories * k); ['protein', 'carbs', 'fat'].forEach(n => { m.querySelector('[name=' + n + ']').value = +(base[n] * k).toFixed(1); }); });
      m.querySelector('[data-save]').onclick = async () => {
        const d = formData(m), err = m.querySelector('#err'), qty = numOr(d.qty), kcal = numOr(d.calories), pr = numOr(d.protein), cb = numOr(d.carbs), ft = numOr(d.fat);
        if (!d.name) return (err.textContent = 'Name is required'); if (!(qty >= 0.1 && qty <= 50)) return (err.textContent = 'Quantity must be 0.1 to 50');
        if (!(kcal >= 0 && kcal <= 10000)) return (err.textContent = 'Calories must be 0 to 10,000'); if (![pr, cb, ft].every(v => v >= 0 && v <= 5000)) return (err.textContent = 'Macros must be 0 to 5,000 g');
        try { await store.editFood(entry.id, { name: d.name, qty, slot: d.slot, confidence: d.confidence, calories: Math.round(kcal), protein: pr, carbs: cb, fat: ft }); close(); done(); } catch (e) { err.textContent = e.message || 'Could not save'; }
      };
    }, 520);
  }

  // ── page ─────────────────────────────────────────────────────
  G.registerPage('nutrition', {
    sub: 'Calories · macros · water · meal presets', dot: 'var(--orange)', foot: 'General guidance, not medical advice.',
    async render(root) {
      const today = F.date(new Date()); st.date = st.date || today; if (st.date > today) st.date = today;
      await store.load(today);

      const dayLog = () => store.log.filter(e => e.date === st.date);
      const totals = (rows) => ({ cal: Math.round(S.sum(rows.map(e => e.calories))), p: Math.round(S.sum(rows.map(e => e.protein))), c: Math.round(S.sum(rows.map(e => e.carbs))), f: Math.round(S.sum(rows.map(e => e.fat))) });

      const draw = async () => {
        const noPlan = !store.targets || !store.targets.calories;
        const tg = noPlan ? { calories: 0, protein: 0, carbs: 0, fat: 0, waterMl: 3000, plan: null } : store.targets;
        const currentGoal = tg.plan?.goal === 'lose' ? 'cut' : tg.plan?.goal === 'gain' ? 'bulk' : 'maintain';
        const rows = dayLog(), t = totals(rows), water = store.water[st.date] || 0, isToday = st.date === today;
        const burnToday = store.burn[st.date] || null;
        const estTdee = tg.plan?.tdee || 2400;
        const effectiveBurn = burnToday || estTdee;
        const netDeficit = effectiveBurn - t.cal;
        let targetDeficit = parseInt(localStorage.getItem('nutritionDeficitTarget') || '', 10);
        if (isNaN(targetDeficit) || targetDeficit <= 0) targetDeficit = 1000;
        const ids = {}; ['ringC', 'splitRing', 'defChart', 'protChart'].forEach(k => { ids[k] = G.uid(); });
        const pretty = new Date(st.date + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });

        const totKcalFromMacros = t.p * 4 + t.c * 4 + t.f * 9;
        const protPct = totKcalFromMacros ? Math.round((t.p * 4 / totKcalFromMacros) * 100) : 0;
        const carbPct = totKcalFromMacros ? Math.round((t.c * 4 / totKcalFromMacros) * 100) : 0;
        const fatPct = totKcalFromMacros ? Math.max(0, 100 - protPct - carbPct) : 0;

        root.innerHTML = `
          <div class="hl-grid" style="grid-template-columns:auto 1fr auto;align-items:center;margin-bottom:12px">
            <div class="hl-pills"><button class="hl-pill" data-d="-1">‹ PREV</button><button class="hl-pill ${isToday ? 'on' : ''}" data-d="0">TODAY</button><button class="hl-pill" data-d="1" ${isToday ? 'disabled style="opacity:.35;cursor:default"' : ''}>NEXT ›</button></div>
            <div class="hl-note" style="text-transform:uppercase">${pretty}</div><div><button class="hl-btn" id="foodBtn">+ CUSTOM FOOD</button> <button class="hl-btn ${noPlan ? 'pri' : ''}" id="planBtn">${noPlan ? 'SET UP PLAN' : 'EDIT PLAN'}</button></div></div>
          ${noPlan ? G.card('SET UP YOUR PLAN', `<div class="hl-note" style="text-transform:none;line-height:1.8;font-size:10px;margin-bottom:12px">You can already log food below. Add your age, height, weight and goal to get a daily calorie target, macros, water goal and a timeline, calculated with the standard Mifflin-St Jeor formula (never below 1,500 kcal for men or 1,200 for women).</div><button class="hl-btn pri" id="planBtn2">SET UP MY PLAN</button>`) : ''}
          
          <!-- Goal mode selection: Maintenance, Cut, Bulk -->
          <div style="display:flex;align-items:center;gap:12px;margin-bottom:14px;flex-wrap:wrap">
            <span class="hl-note" style="letter-spacing:1.5px;color:var(--text-muted)">GOAL MODE:</span>
            <div class="hl-pills">
              <button class="hl-pill ${currentGoal === 'maintain' ? 'on' : ''}" data-goal="maintain">MAINTENANCE</button>
              <button class="hl-pill ${currentGoal === 'cut' ? 'on' : ''}" data-goal="cut">CUT</button>
              <button class="hl-pill ${currentGoal === 'bulk' ? 'on' : ''}" data-goal="bulk">BULK</button>
            </div>
            <span class="hl-note" style="color:var(--text-muted);font-size:10px">
              ${currentGoal === 'cut' ? 'DEFICIT TARGET ACTIVE · HIGHER PROTEIN & WATER' : currentGoal === 'bulk' ? 'SURPLUS ACTIVE · HIGHER CARBS' : 'ENERGY BALANCE · WEIGHT MAINTENANCE'}
            </span>
          </div>

          <!-- Quick log & burned calories -->
          ${G.card('QUICK LOG & BURN', `
            <div class="hl-quick"><input id="ql" autocomplete="off" spellcheck="false" placeholder="type a preset code…  S1   ·   2x S1   ·   S1 dinner"><button class="hl-btn pri" id="qlGo">LOG</button></div>
            <div id="qlSug"></div><div id="qlMsg" class="hl-note" style="margin-top:6px"></div>
            <div style="display:flex;align-items:center;justify-content:space-between;margin-top:14px;padding:10px 14px;background:var(--carbon-1);border:1px solid var(--carbon-4);border-radius:6px;flex-wrap:wrap;gap:10px">
              <div style="display:flex;align-items:center;gap:10px">
                <span class="hl-note" style="letter-spacing:1px;white-space:nowrap;color:var(--text)">CALORIES BURNED TODAY:</span>
                <input id="burnInp" type="number" min="0" max="15000" placeholder="${estTdee}" value="${burnToday || ''}" style="width:100px;font:inherit;font-size:11px;background:var(--carbon-2);border:1px solid var(--carbon-4);color:var(--text);border-radius:4px;padding:5px 8px">
                <button class="hl-btn pri" id="saveBurnBtn" style="padding:5px 12px">SAVE BURN</button>
              </div>
              <div class="hl-note" id="burnFeedback">${burnToday ? `TODAY: <b style="color:${netDeficit >= targetDeficit ? 'var(--green)' : netDeficit >= 0 ? '#a5f79e' : 'var(--orange)'}">${netDeficit >= 0 ? '+' : ''}${netDeficit} KCAL DEFICIT</b> (BURN ${burnToday} − INTAKE ${t.cal})` : `EST. TDEE: ${estTdee} KCAL · DEFICIT: ${estTdee - t.cal} KCAL`}</div>
            </div>`)}

          <div class="fin-group-label" style="margin-top:16px">TODAY</div>
          <div class="hl-grid hl-g3">
            ${G.card('CALORIES', `
              <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:160px;text-align:center">
                <div class="hl-ring" id="${ids.ringC}" style="margin:0 auto 10px auto"></div>
                <div class="fx-sub" style="text-align:center">${noPlan ? t.cal + ' kcal eaten · set a plan to see your target' : t.cal + ' of ' + tg.calories + ' kcal · ' + (tg.calories - t.cal >= 0 ? (tg.calories - t.cal) + ' left' : (t.cal - tg.calories) + ' over')}</div>
              </div>`)}
            ${G.card('MACRO SPLIT · % OF CALORIES', `
              <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:160px;text-align:center">
                <div class="hl-chart" id="${ids.splitRing}" style="height:140px;width:100%"></div>
                <div class="fx-sub" style="text-align:center">${totKcalFromMacros ? `P ${t.p}g (${protPct}%) · C ${t.c}g (${carbPct}%) · F ${t.f}g (${fatPct}%)` : 'No macros logged today'}</div>
              </div>`)}
            ${G.card('WATER', `
              <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:160px;text-align:center">
                <div class="fin-stat-val" style="display:flex;align-items:baseline;justify-content:center;gap:6px;margin-bottom:12px">
                  <span style="font-size:32px;font-weight:700;color:var(--text);letter-spacing:-0.5px">${(water / 1000).toFixed(1)}</span>
                  <span class="u" style="font-size:11px;color:var(--text-muted);letter-spacing:1.2px;text-transform:uppercase">OF ${(tg.waterMl / 1000).toFixed(1)} L</span>
                </div>
                <div style="width:85%;max-width:260px;height:8px;border-radius:4px;background:rgba(255,255,255,.07);margin-bottom:18px;overflow:hidden">
                  <div style="height:100%;width:${Math.min(100, water / tg.waterMl * 100)}%;background:var(--blue);border-radius:4px;transition:width .3s"></div>
                </div>
                <div style="display:flex;gap:10px;justify-content:center">
                  <button class="hl-btn" data-w="-250" style="padding:6px 14px">− 250 ML</button>
                  <button class="hl-btn pri" data-w="250" style="padding:6px 14px">+ 250 ML</button>
                </div>
              </div>`)}
          </div>
          <div class="hl-grid hl-g21">
            ${G.card('DIARY', `
              <div style="display:grid;grid-template-columns:minmax(180px,2fr) 95px 75px 75px 75px 46px;align-items:center;padding:8px 10px;font-size:9px;font-weight:700;letter-spacing:1.2px;color:var(--text-muted);text-transform:uppercase;border-bottom:1px solid rgba(255,255,255,0.08);margin-bottom:10px">
                <span>FOOD ITEM</span>
                <span style="text-align:right">CALORIES</span>
                <span style="text-align:right">PROTEIN</span>
                <span style="text-align:right">CARBS</span>
                <span style="text-align:right">FAT</span>
                <span></span>
              </div>
              ${SLOTS.map(s => {
                const es = rows.filter(e => e.slot === s);
                const slotKcal = Math.round(S.sum(es.map(e => e.calories)));
                return `<div style="margin-bottom:18px">
                  <div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid rgba(255,255,255,0.04);margin-bottom:8px">
                    <span style="font-size:10px;font-weight:700;letter-spacing:1.5px;color:var(--text-muted);text-transform:uppercase">${s}</span>
                    <span style="font-size:11px;font-family:monospace;letter-spacing:1px;color:var(--text);tabular-nums">${slotKcal} KCAL</span>
                  </div>
                  ${es.length ? `
                    <div style="display:flex;flex-direction:column;gap:4px">
                      ${es.map(e => `
                        <div style="display:grid;grid-template-columns:minmax(180px,2fr) 95px 75px 75px 75px 46px;align-items:center;padding:6px 10px;border-radius:4px;transition:background .15s;font-size:11px" onmouseover="this.style.background='rgba(255,255,255,0.02)'" onmouseout="this.style.background='transparent'">
                          <div style="display:flex;align-items:center;gap:10px;overflow:hidden;padding-right:10px">
                            ${e.presetCode ? `<span class="hl-code" style="color:var(--green);border-color:rgba(118,179,114,0.3);padding:2px 6px;font-size:10px">${esc(e.presetCode)}</span>` : ''}
                            <span style="color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(e.name)}${e.qty && e.qty !== 1 ? ' <span style="color:var(--text-muted);font-size:10px">×' + e.qty + '</span>' : ''}</span>
                          </div>
                          <div style="font-family:monospace;text-align:right;color:var(--text);tabular-nums">${e.calories} <span style="font-size:9px;color:var(--text-muted)">kcal</span></div>
                          <div style="font-family:monospace;text-align:right;color:var(--text-muted);tabular-nums">${e.protein}<span style="font-size:9px">g</span></div>
                          <div style="font-family:monospace;text-align:right;color:var(--text-muted);tabular-nums">${e.carbs}<span style="font-size:9px">g</span></div>
                          <div style="font-family:monospace;text-align:right;color:var(--text-muted);tabular-nums">${e.fat}<span style="font-size:9px">g</span></div>
                          <div style="text-align:right;white-space:nowrap">
                            <span class="hl-x" data-editfood="${e.id}" title="Edit" style="cursor:pointer;opacity:0.6;margin-right:6px">✎</span>
                            <span class="hl-x" data-del="${e.id}" title="Delete" style="cursor:pointer;opacity:0.6">✕</span>
                          </div>
                        </div>
                      `).join('')}
                    </div>
                  ` : `<div style="padding:4px 10px;font-size:11px;color:var(--text-muted);letter-spacing:2px">—</div>`}
                </div>`;
              }).join('')}
              <div style="display:grid;grid-template-columns:minmax(180px,2fr) 95px 75px 75px 75px 46px;align-items:center;padding:12px 10px;margin-top:14px;border-top:1px solid rgba(255,255,255,0.12);background:rgba(255,255,255,0.02);border-radius:4px;font-size:11px;font-weight:700">
                <div style="color:var(--green);letter-spacing:1.5px;font-size:10px;text-transform:uppercase">TOTAL</div>
                <div style="font-family:monospace;text-align:right;color:var(--text);tabular-nums">${t.cal} <span style="font-size:9px;color:var(--text-muted);font-weight:normal">kcal</span></div>
                <div style="font-family:monospace;text-align:right;color:var(--text-muted);tabular-nums">${t.p}<span style="font-size:9px;font-weight:normal">g</span></div>
                <div style="font-family:monospace;text-align:right;color:var(--text-muted);tabular-nums">${t.c}<span style="font-size:9px;font-weight:normal">g</span></div>
                <div style="font-family:monospace;text-align:right;color:var(--text-muted);tabular-nums">${t.f}<span style="font-size:9px;font-weight:normal">g</span></div>
                <div></div>
              </div>`, '<button class="hl-btn" id="copyDay" title="Copy yesterday\'s entries onto this day">COPY PREVIOUS DAY</button> <button class="hl-btn" id="expFood">EXPORT CSV</button>')}
            ${G.card('MEAL PRESETS', `${store.presets.length ? '' : `<div class="hl-empty" style="padding:18px 8px">NO PRESETS YET<br>A preset is a saved meal: type its code (like S1) to log it in one go.<br><br><button class="hl-btn pri" id="starter">ADD 10 STARTER PRESETS</button></div>`}<table class="hl-table">${store.presets.slice().sort((a, b) => (b.favorite - a.favorite) || (b.useCount - a.useCount) || a.code.localeCompare(b.code)).map(p => `<tr><td><span class="hl-x" data-fav="${p.id}" style="color:${p.favorite ? 'var(--sig-900)' : 'inherit'}">${p.favorite ? '★' : '☆'}</span></td><td data-log="${p.code}" style="cursor:pointer"><span class="hl-code">${esc(p.code)}</span> ${esc(p.name)}</td><td>${p.calories}</td>
              <td style="white-space:nowrap"><span class="hl-x" data-edit="${p.id}" title="Edit">✎</span> <span class="hl-x" data-dup="${p.id}" title="Duplicate">⧉</span> <span class="hl-x" data-delp="${p.id}" title="Delete">✕</span></td></tr>`).join('')}</table>`, '<button class="hl-btn pri" id="newPreset">+ NEW PRESET</button>')}
          </div>
          <div class="fin-group-label">TRENDS & PLAN</div>
          ${G.card('TRENDS', `
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;flex-wrap:wrap;gap:10px">
              <div class="hl-pills"><button class="hl-pill ${st.range === 7 ? 'on' : ''}" data-r="7">7D</button><button class="hl-pill ${st.range === 30 ? 'on' : ''}" data-r="30">30D</button></div>
              <div style="display:flex;align-items:center;gap:8px">
                <span class="hl-note" style="letter-spacing:1px">TARGET DEFICIT:</span>
                <input id="defTgInp" type="number" min="0" max="3000" step="50" value="${targetDeficit}" style="width:75px;background:var(--carbon-2);border:1px solid var(--carbon-4);color:var(--text);font:inherit;font-size:11px;padding:3px 8px;border-radius:4px">
                <span class="hl-note">KCAL</span>
              </div>
            </div>
            <div class="hl-grid hl-g2" style="margin-bottom:0">
              <div><div class="hl-label" style="margin-bottom:6px">DEFICIT TRACKING (BURN − INTAKE)</div><div class="hl-chart sm" id="${ids.defChart}"></div></div>
              <div><div class="hl-label" style="margin-bottom:6px">PROTEIN VS TARGET · G</div><div class="hl-chart sm" id="${ids.protChart}"></div></div>
            </div>`)}
          ${G.card('YOUR PLAN', noPlan ? G.empty('NO PLAN YET<br>Use SET UP PLAN above to calculate your targets.') : `<table class="hl-table"><tr><td>BMR</td><td>${tg.plan?.bmr ? F.num(tg.plan.bmr) + ' kcal' : '—'}</td><td>TDEE</td><td>${tg.plan?.tdee ? F.num(tg.plan.tdee) + ' kcal' : '—'}</td></tr>
            <tr><td>Daily target</td><td>${F.num(tg.calories)} kcal</td><td>Macros</td><td>P ${tg.protein} · C ${tg.carbs} · F ${tg.fat} g</td></tr>
            <tr><td>Water</td><td>${(tg.waterMl / 1000).toFixed(1)} L</td><td>Timeline</td><td>${tg.plan?.weeks ? '~' + tg.plan.weeks + ' weeks to goal' : '—'}</td></tr></table>`)}`;

        window.gridRingChart(ids.ringC, [{ label: 'Calories', value: noPlan ? 0 : t.cal, maxValue: noPlan ? 1 : tg.calories, color: t.cal > tg.calories * 1.05 ? '#f97316' : '#76b372' }], { baseInnerRadius: 70, strokeWidth: 16, defaultLabel: noPlan ? 'NO TARGET YET' : 'OF TARGET' });
        
        // Render top macro split donut chart
        const scRing = window.ethosChart(ids.splitRing);
        if (scRing) {
          if (totKcalFromMacros > 0) {
            scRing.setOption({
              tooltip: { trigger: 'item', formatter: '{b}: {c} kcal ({d}%)' },
              series: [Object.assign(window.bkPie ? window.bkPie({ radius: ['52%', '82%'] }) : { type: 'pie', radius: ['52%', '82%'] }, {
                data: [
                  { name: 'Protein', value: t.p * 4, itemStyle: { color: '#3b82f6' } },
                  { name: 'Carbs', value: t.c * 4, itemStyle: { color: '#14b8a6' } },
                  { name: 'Fat', value: t.f * 9, itemStyle: { color: '#f59e0b' } }
                ],
                label: { show: true, formatter: '{b}\n{d}%', color: 'rgba(240,240,240,.65)', fontSize: 9 }
              })]
            }, true);
          } else {
            scRing.clear();
          }
        }

        trends(tg, ids, targetDeficit); bind();
      };

      const trends = async (tg, ids, targetDeficit) => {
        const dates = Array.from({ length: st.range }, (_, i) => addDays(today, -(st.range - 1 - i))), x = dates.map(F.short);
        const by = dates.map(d => totals(store.log.filter(e => e.date === d))), logged = by.map(b => b.cal > 0);
        const defData = dates.map((d, i) => {
          const b = store.burn[d] || (tg.plan?.tdee || 2400);
          const intake = by[i].cal;
          const def = b - intake;
          const colr = def >= targetDeficit ? '#76b372' : def >= 0 ? '#3b6839' : '#f97316';
          return { value: def, itemStyle: { color: colr, borderRadius: def >= 0 ? [4, 4, 0, 0] : [0, 0, 4, 4] } };
        });

        const axis = { grid: { left: 42, right: 14, top: 18, bottom: 24 }, xAxis: { type: 'category', data: x, axisLabel: { interval: Math.max(0, Math.ceil(x.length / 8) - 1) } } };
        
        // Deficit tracking chart
        window.ethosChart(ids.defChart).setOption({
          ...axis,
          tooltip: {
            trigger: 'axis',
            formatter: (p) => {
              const idx = p[0].dataIndex, dt = dates[idx], b = store.burn[dt] || (tg.plan?.tdee || 2400), i = by[idx].cal, def = b - i;
              return `${dt}<br>Burn: ${b} kcal<br>Intake: ${i} kcal<br><b>Deficit: ${def >= 0 ? '+' : ''}${def} kcal</b> (Target: ${targetDeficit} kcal)`;
            }
          },
          yAxis: { type: 'value', name: 'kcal', nameTextStyle: { color: 'rgba(240,240,240,.38)', fontSize: 9 } },
          series: [{
            type: 'bar',
            barMaxWidth: 22,
            data: defData,
            markLine: {
              silent: true,
              symbol: 'none',
              data: [
                { yAxis: targetDeficit, lineStyle: { color: '#a5f79e', type: 'dashed' }, label: { formatter: 'TARGET ' + targetDeficit, color: '#a5f79e', fontSize: 9 } },
                { yAxis: 0, lineStyle: { color: 'rgba(255,255,255,.15)', type: 'solid' }, label: { show: false } }
              ]
            }
          }]
        }, true);

        // Protein chart
        window.ethosChart(ids.protChart).setOption({
          ...axis,
          tooltip: { trigger: 'axis' },
          yAxis: { type: 'value', name: 'g', nameTextStyle: { color: 'rgba(240,240,240,.38)', fontSize: 9 } },
          series: [Object.assign(window.bkArea('#3b82f6', { fillOpacity: 0.15 }), {
            data: by.map((b, i) => (logged[i] ? b.p : null)),
            connectNulls: true,
            markLine: { silent: true, symbol: 'none', lineStyle: { color: 'rgba(240,240,240,.38)', type: 'dashed' }, data: tg.protein ? [{ yAxis: tg.protein }] : [], label: { formatter: 'TARGET', color: 'rgba(240,240,240,.38)', fontSize: 9 } }
          })]
        }, true);
      };

      const msg = (t, action) => { const el = root.querySelector('#qlMsg'); if (!el) return; el.innerHTML = esc(t) + (action ? ` <button class="hl-btn pri" id="qlAct">${action}</button>` : ''); };
      const doLog = async (text) => {
        const cmd = P().parseQuickLog(text);
        if (!cmd) return msg('COULD NOT READ THAT. TRY: S1 · 2x S1 · S1 dinner');
        const preset = store.presets.find(p => p.code === cmd.code);
        if (!preset) { msg(`NO PRESET '${cmd.code}'.`, 'CREATE IT'); root.querySelector('#qlAct').onclick = () => presetForm(null, { code: cmd.code }, draw); return; }
        const slot = cmd.slot || preset.defaultSlot || P().slotByHour(new Date().getHours());
        let entry; try { entry = await store.logPreset(cmd, preset, st.date, slot); } catch (e) { return G.toast((e.message || 'LOG FAILED').toUpperCase()); }
        await draw();
        G.toast(`LOGGED ${preset.code}${cmd.qty !== 1 ? ' ×' + cmd.qty : ''}: ${preset.name.toUpperCase()} · ${entry.calories} KCAL · P ${entry.protein} C ${entry.carbs} F ${entry.fat}`, async () => { try { await store.delFood(entry.id); } catch (_) {} draw(); });
      };

      const bind = () => {
        const inp = root.querySelector('#ql'), sug = root.querySelector('#qlSug'); let sel = 0, list = [];
        const showSug = () => {
          list = P().suggest(inp.value, store.presets); sel = Math.min(sel, Math.max(0, list.length - 1));
          sug.innerHTML = list.length ? `<div class="hl-suggest">${list.map((p, i) => `<div class="${i === sel ? 'on' : ''}" data-c="${esc(p.code)}"><span><span class="hl-code">${esc(p.code)}</span> ${esc(p.name)}</span><span class="hl-note">${p.calories} kcal · P${p.protein} C${p.carbs} F${p.fat}</span></div>`).join('')}</div>` : '';
          sug.querySelectorAll('[data-c]').forEach(d => d.onclick = () => { inp.value = d.dataset.c; submit(); });
        };
        const submit = () => { const v = inp.value; if (!v.trim()) return; inp.value = ''; sug.innerHTML = ''; doLog(v); };
        inp.oninput = () => { sel = 0; showSug(); };
        inp.onkeydown = (e) => {
          if (e.key === 'Enter') { e.preventDefault(); if (list.length && !P().parseQuickLog(inp.value)) inp.value = list[sel].code; submit(); }
          else if (e.key === 'ArrowDown') { e.preventDefault(); sel = Math.min(list.length - 1, sel + 1); showSug(); }
          else if (e.key === 'ArrowUp') { e.preventDefault(); sel = Math.max(0, sel - 1); showSug(); }
          else if (e.key === 'Escape') { inp.value = ''; sug.innerHTML = ''; }
        };
        root.querySelector('#qlGo').onclick = submit;
        
        // Calories burned saving
        const saveBurn = root.querySelector('#saveBurnBtn');
        if (saveBurn) {
          saveBurn.onclick = async () => {
            const val = parseInt(root.querySelector('#burnInp').value, 10);
            if (!(val >= 0 && val <= 15000)) return G.toast('ENTER A VALID CALORIE BURN (0 - 15,000)');
            try {
              await store.setBurn(st.date, val);
              G.toast(`BURN SAVED FOR ${st.date}: ${val} KCAL`);
              await draw();
            } catch (e) {
              G.toast((e.message || 'COULD NOT SAVE BURN').toUpperCase());
            }
          };
        }

        // Goal mode buttons
        root.querySelectorAll('[data-goal]').forEach(b => {
          b.onclick = async () => {
            try {
              await store.applyGoal(b.dataset.goal);
              G.toast(`GOAL SWITCHED TO ${b.dataset.goal.toUpperCase()}`);
              await draw();
            } catch (e) {
              G.toast((e.message || 'COULD NOT UPDATE GOAL').toUpperCase());
            }
          };
        });

        // Deficit target input
        const dtInp = root.querySelector('#defTgInp');
        if (dtInp) {
          dtInp.onchange = (e) => {
            const v = parseInt(e.target.value, 10);
            if (v > 0) {
              localStorage.setItem('nutritionDeficitTarget', String(v));
              draw();
            }
          };
        }

        root.querySelectorAll('[data-d]').forEach(b => b.onclick = () => { const n = +b.dataset.d; st.date = n === 0 ? today : addDays(st.date, n); if (st.date > today) st.date = today; draw(); });
        root.querySelectorAll('[data-del]').forEach(x => x.onclick = async () => { try { await store.delFood(x.dataset.del); } catch (e) { G.toast('DELETE FAILED'); } draw(); });
        root.querySelectorAll('[data-w]').forEach(b => b.onclick = async () => { try { await store.setWater(st.date, Math.max(0, (store.water[st.date] || 0) + +b.dataset.w)); } catch (e) { G.toast('SAVE FAILED'); } draw(); });
        root.querySelectorAll('[data-log]').forEach(td => td.onclick = () => doLog(td.dataset.log));
        root.querySelectorAll('[data-r]').forEach(b => b.onclick = () => { st.range = +b.dataset.r; draw(); });
        root.querySelector('#newPreset').onclick = () => presetForm(null, null, draw);
        const pb2 = root.querySelector('#planBtn2'); if (pb2) pb2.onclick = () => planForm(draw);
        const starter = root.querySelector('#starter');
        if (starter) starter.onclick = async () => { starter.disabled = true; starter.textContent = 'ADDING…'; try { for (const [code, name, kcal, p, c, f, slot] of STARTERS) await store.savePreset({ code, name, serving: '1 serving', calories: kcal, protein: p, carbs: c, fat: f, defaultSlot: slot }); G.toast('10 STARTER PRESETS ADDED. EDIT THEM TO MATCH YOUR MEALS'); } catch (e) { G.toast((e.message || 'COULD NOT ADD PRESETS').toUpperCase()); } draw(); };
        root.querySelectorAll('[data-editfood]').forEach(x => x.onclick = () => foodEditForm(store.log.find(e => e.id === x.dataset.editfood), draw));
        const cd = root.querySelector('#copyDay');
        if (cd) cd.onclick = async () => {
          const prev = addDays(st.date, -1), n = store.log.filter(e => e.date === prev).length;
          if (!n) return G.toast('NOTHING LOGGED ON ' + prev);
          if (dayLog().length && !confirm(`This day already has ${dayLog().length} entries. Copy ${n} more from ${prev}?`)) return;
          try { const c = await store.copyDay(prev, st.date); G.toast(`COPIED ${c} ENTRIES FROM ${prev}`); } catch (e) { G.toast((e.message || 'COPY FAILED').toUpperCase()); } draw();
        };
        const ex = root.querySelector('#expFood');
        if (ex) ex.onclick = () => G.csv('grid-food-log.csv', [['date', 'meal', 'name', 'quantity', 'calories', 'protein_g', 'carbs_g', 'fat_g', 'confidence', 'preset_code'], ...store.log.slice().sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0)).map(e => [e.date, e.slot, e.name, e.qty || 1, e.calories, e.protein, e.carbs, e.fat, e.confidence, e.presetCode])]);
        root.querySelector('#foodBtn').onclick = () => foodForm(st.date, draw);
        root.querySelector('#planBtn').onclick = () => planForm(draw);
        root.querySelectorAll('[data-edit]').forEach(x => x.onclick = () => presetForm(store.presets.find(p => p.id === x.dataset.edit), null, draw));
        root.querySelectorAll('[data-dup]').forEach(x => x.onclick = () => { const p = store.presets.find(q => q.id === x.dataset.dup); presetForm(null, { ...p, code: '', name: p.name + ' copy' }, draw); });
        root.querySelectorAll('[data-fav]').forEach(x => x.onclick = async () => { const p = store.presets.find(q => q.id === x.dataset.fav); try { await store.savePreset({ favorite: !p.favorite }, p.id); } catch (e) { G.toast('SAVE FAILED'); } draw(); });
        root.querySelectorAll('[data-delp]').forEach(x => x.onclick = async () => { const p = store.presets.find(q => q.id === x.dataset.delp); if (!confirm(`Delete preset ${p.code} (${p.name})? Past diary entries keep their numbers.`)) return; try { await store.delPreset(p.id); } catch (e) { G.toast('DELETE FAILED'); } draw(); });
      };

      await draw();
    },
  });
})();
