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
    presets: [], log: [], water: {}, targets: null,
    async load(today) {
      const from = addDays(today, -34);
      if (G.isDemo()) {
        if (!demo) demo = { presets: (await G.data('presets')).map(x => ({ ...x })), log: (await G.data('foodlog', { from, to: today })).map(x => ({ ...x })), water: Object.fromEntries((await G.data('water', { from, to: today })).map(w => [w.date, w.ml])), targets: { ...(await G.data('targets')) } };
        Object.assign(store, demo); return;
      }
      const [presets, log, water, targets] = await Promise.all([G.data('presets'), G.data('foodlog', { from, to: today }), G.data('water', { from, to: today }), G.data('targets')]);
      Object.assign(store, { presets, log, water: Object.fromEntries(water.map(w => [w.date, w.ml])), targets });
    },
    async addFood(e) {
      if (G.isDemo()) { const row = { id: 'n' + Date.now() + Math.random().toString(36).slice(2, 5), qty: 1, confidence: 'estimated', ...e }; demo.log.push(row); return row; }
      const row = await gridFetch('/api/nutrition/log', { method: 'POST', body: JSON.stringify(e) }); store.log.push(row); return row;
    },
    async logPreset(cmd, preset, date, slot) {
      if (G.isDemo()) { preset.useCount = (preset.useCount || 0) + 1; return store.addFood({ date, slot, name: preset.name, serving: preset.serving, qty: cmd.qty, presetCode: preset.code, confidence: 'exact', ...P().scale(preset, cmd.qty) }); }
      const row = await gridFetch('/api/nutrition/log-preset', { method: 'POST', body: JSON.stringify({ code: cmd.code, qty: cmd.qty, slot: cmd.slot || undefined, date }) }); store.log.push(row); return row;
    },
    async delFood(id) {
      if (!G.isDemo()) await gridFetch('/api/nutrition/log/' + id, { method: 'DELETE' });
      store.log = store.log.filter(e => e.id !== id); if (demo) demo.log = store.log;
    },
    async savePreset(p, id) {
      if (G.isDemo()) {
        if (store.presets.some(x => x.code === p.code && x.id !== id)) throw new Error(`Preset ${p.code} already exists`);
        if (id) Object.assign(store.presets.find(x => x.id === id), p); else store.presets.push({ id: 'p' + Date.now(), useCount: 0, favorite: false, ...p }); return;
      }
      const saved = await gridFetch(id ? '/api/nutrition/presets/' + id : '/api/nutrition/presets', { method: id ? 'PUT' : 'POST', body: JSON.stringify(p) });
      store.presets = id ? store.presets.map(x => (x.id === id ? saved : x)) : [...store.presets, saved];
    },
    async delPreset(id) { if (!G.isDemo()) await gridFetch('/api/nutrition/presets/' + id, { method: 'DELETE' }); store.presets = store.presets.filter(x => x.id !== id); if (demo) demo.presets = store.presets; },
    async setWater(date, ml) { if (!G.isDemo()) await gridFetch('/api/nutrition/water/' + date, { method: 'PUT', body: JSON.stringify({ ml }) }); store.water[date] = ml; },
    async saveTargets(t) { if (!G.isDemo()) store.targets = await gridFetch('/api/nutrition/targets', { method: 'PUT', body: JSON.stringify(t) }); else store.targets = demo.targets = { ...t }; },
  };

  // ── modal helper ─────────────────────────────────────────────
  function modal(title, bodyHtml, onMount) {
    document.querySelectorAll('.hl-modal').forEach(m => m.remove());
    const m = document.createElement('div'); m.className = 'hl-modal';
    m.style.cssText = 'position:fixed;inset:0;z-index:300;background:rgba(0,0,0,.65);display:flex;align-items:center;justify-content:center;padding:16px';
    m.innerHTML = `<div style="width:min(560px,100%);max-height:92vh;overflow:auto;background:var(--carbon-2);border:1px solid var(--carbon-4);border-radius:12px;padding:20px">
      <div style="display:flex;justify-content:space-between;margin-bottom:14px"><span class="hl-label">${title}</span><span class="hl-x" data-close style="font-size:16px">✕</span></div>${bodyHtml}</div>`;
    document.body.appendChild(m);
    const close = () => m.remove();
    m.addEventListener('mousedown', (e) => { if (e.target === m) close(); });
    m.querySelector('[data-close]').onclick = close;
    document.addEventListener('keydown', function esc_(e) { if (e.key === 'Escape') { close(); document.removeEventListener('keydown', esc_); } });
    onMount(m, close); return m;
  }
  const field = (label, input) => `<label style="display:block;margin-bottom:10px"><span class="hl-note" style="display:block;margin-bottom:4px;text-transform:uppercase;letter-spacing:1.2px">${label}</span>${input}</label>`;
  const inp = (name, v = '', extra = '') => `<input name="${name}" value="${esc(v)}" ${extra} style="width:100%;font:inherit;font-size:12px;color:var(--text);background:var(--carbon-1);border:1px solid var(--carbon-4);border-radius:6px;padding:8px 10px;outline:none">`;
  const sel = (name, opts, v) => `<select name="${name}" style="width:100%;font:inherit;font-size:12px;color:var(--text);background:var(--carbon-1);border:1px solid var(--carbon-4);border-radius:6px;padding:8px 10px">${opts.map(([k, l]) => `<option value="${k}" ${k === v ? 'selected' : ''}>${l}</option>`).join('')}</select>`;
  const formData = (m) => Object.fromEntries([...m.querySelectorAll('[name]')].map(e => [e.name, e.type === 'checkbox' ? e.checked : e.value.trim()]));
  const numOr = (v) => (v === '' || v == null ? NaN : Number(v));

  // ── forms ────────────────────────────────────────────────────
  function presetForm(existing, prefill, done) {
    const p = existing || prefill || {};
    modal(existing ? 'EDIT PRESET · ' + existing.code : 'NEW MEAL PRESET', `
      <div style="display:grid;grid-template-columns:1fr 2fr;gap:10px">${field('Code (e.g. S1)', inp('code', p.code || '', 'maxlength="12" autocomplete="off"'))}${field('Name', inp('name', p.name || '', 'maxlength="80"'))}</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">${field('Serving', inp('serving', p.serving || '1 serving'))}${field('Default meal', sel('defaultSlot', [['', 'Auto (by time of day)'], ...SLOTS.map(s => [s, s])], p.defaultSlot || ''))}</div>
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px">${field('Calories', inp('calories', p.calories ?? '', 'inputmode="numeric"'))}${field('Protein g', inp('protein', p.protein ?? 0, 'inputmode="decimal"'))}${field('Carbs g', inp('carbs', p.carbs ?? 0, 'inputmode="decimal"'))}${field('Fat g', inp('fat', p.fat ?? 0, 'inputmode="decimal"'))}</div>
      <div class="hl-note" id="kcalHint" style="min-height:16px;margin-bottom:10px"></div><div id="err" style="color:var(--red);font-size:11px;min-height:16px;margin-bottom:8px"></div>
      <div style="display:flex;gap:8px;justify-content:flex-end"><button class="hl-btn" data-calc>CALORIES FROM MACROS</button><button class="hl-btn pri" data-save>${existing ? 'SAVE CHANGES' : 'CREATE PRESET'}</button></div>`, (m, close) => {
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
      <div id="err" style="color:var(--red);font-size:11px;min-height:16px;margin-bottom:8px"></div><div style="text-align:right"><button class="hl-btn pri" data-save>ADD TO DIARY</button></div>`, (m, close) => {
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
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px">${field('Goal', sel('goal', [['lose', 'Lose weight'], ['maintain', 'Maintain'], ['gain', 'Gain weight']], v.goal))}${field('Pace', sel('pace', [['gentle', 'Gentle'], ['steady', 'Steady'], ['aggressive', 'Aggressive']], v.pace))}${field('Goal weight kg', inp('goalKg', v.goalKg))}</div>
      <div id="out" style="background:var(--carbon-1);border:1px solid var(--carbon-4);border-radius:8px;padding:12px;margin-bottom:10px;font-size:11px;line-height:1.8"></div>
      <details style="margin-bottom:12px"><summary class="hl-note" style="cursor:pointer">METHODOLOGY</summary><div class="hl-note" style="line-height:1.8;margin-top:6px">BMR: Mifflin-St Jeor. TDEE: BMR x standard activity multiplier (1.2 / 1.375 / 1.55 / 1.725 / 1.9). Timeline: about 3,500 kcal per lb. Protein 0.8-1.0 g/lb (1.0 when losing or athlete), fat 0.35 g/lb, carbs the remaining calories. Never below 1,500 kcal (male) or 1,200 kcal (female). General guidance, not medical advice.</div></details>
      <div style="text-align:right"><button class="hl-btn pri" data-save>SAVE AS MY TARGETS</button></div>`, (m, close) => {
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

  // ── page ─────────────────────────────────────────────────────
  G.registerPage('nutrition', {
    title: 'Nutrition', sub: 'Calories · macros · water · meal presets',
    async render(root) {
      const today = F.date(new Date()); st.date = st.date || today; if (st.date > today) st.date = today;
      await store.load(today);

      const dayLog = () => store.log.filter(e => e.date === st.date);
      const totals = (rows) => ({ cal: Math.round(S.sum(rows.map(e => e.calories))), p: Math.round(S.sum(rows.map(e => e.protein))), c: Math.round(S.sum(rows.map(e => e.carbs))), f: Math.round(S.sum(rows.map(e => e.fat))) });

      const draw = async () => {
        const tg = store.targets;
        if (!tg || !tg.calories) { root.innerHTML = `${G.empty('NO NUTRITION PLAN YET<br>Set your calorie and macro targets to begin.')}<div style="text-align:center"><button class="hl-btn pri" id="planBtn">SET UP MY PLAN</button></div>`; root.querySelector('#planBtn').onclick = () => planForm(draw); return; }
        const rows = dayLog(), t = totals(rows), water = store.water[st.date] || 0, isToday = st.date === today;
        const ids = {}; ['ringC', 'ringM', 'tr', 'split', 'prot', 'io'].forEach(k => { ids[k] = G.uid(); });
        const pretty = new Date(st.date + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });

        root.innerHTML = `
          <div class="hl-grid" style="grid-template-columns:auto 1fr auto;align-items:center;margin-bottom:12px">
            <div class="hl-pills"><button class="hl-pill" data-d="-1">‹ PREV</button><button class="hl-pill ${isToday ? 'on' : ''}" data-d="0">TODAY</button><button class="hl-pill" data-d="1" ${isToday ? 'disabled style="opacity:.35;cursor:default"' : ''}>NEXT ›</button></div>
            <div class="hl-note" style="text-transform:uppercase">${pretty}</div><div><button class="hl-btn" id="foodBtn">+ CUSTOM FOOD</button> <button class="hl-btn" id="planBtn">EDIT PLAN</button></div></div>
          ${G.card('QUICK LOG', `<div class="hl-quick"><input id="ql" autocomplete="off" spellcheck="false" placeholder="type a preset code…  S1   ·   2x S1   ·   S1 dinner"><button class="hl-btn pri" id="qlGo">LOG</button></div><div id="qlSug"></div><div id="qlMsg" class="hl-note" style="margin-top:6px"></div>`)}
          <div class="hl-grid hl-g3" style="margin-top:14px">
            ${G.card('CALORIES', `<div class="hl-ring" id="${ids.ringC}"></div><div class="hl-delta flat" style="text-align:center">${t.cal} of ${tg.calories} kcal · ${tg.calories - t.cal >= 0 ? (tg.calories - t.cal) + ' left' : (t.cal - tg.calories) + ' over'}</div>`)}
            ${G.card('MACROS · G', `<div class="hl-ring" id="${ids.ringM}"></div><div class="hl-delta flat" style="text-align:center">P ${t.p}/${tg.protein} · C ${t.c}/${tg.carbs} · F ${t.f}/${tg.fat}</div>`)}
            ${G.card('WATER', `<div class="hl-tile"><div class="hl-val">${(water / 1000).toFixed(1)}<span class="hl-unit">of ${(tg.waterMl / 1000).toFixed(1)} L</span></div>
              <div style="height:8px;border-radius:4px;background:rgba(255,255,255,.07);margin:12px 0"><div style="height:100%;width:${Math.min(100, water / tg.waterMl * 100)}%;background:var(--blue);border-radius:4px;transition:width .3s"></div></div>
              <button class="hl-btn" data-w="-250">− 250 ML</button> <button class="hl-btn pri" data-w="250">+ 250 ML</button></div>`)}
          </div>
          <div class="hl-grid hl-g21">
            ${G.card('DIARY', SLOTS.map(s => { const es = rows.filter(e => e.slot === s);
              return `<div style="margin-bottom:12px"><div class="hl-note" style="display:flex;justify-content:space-between;text-transform:uppercase;letter-spacing:1.5px"><span>${s}</span><span>${Math.round(S.sum(es.map(e => e.calories)))} kcal</span></div>
                ${es.length ? `<table class="hl-table">${es.map(e => `<tr><td>${e.presetCode ? `<span class="hl-code">${esc(e.presetCode)}</span> ` : ''}${esc(e.name)}${e.qty && e.qty !== 1 ? ' ×' + e.qty : ''}${e.confidence && e.confidence !== 'exact' ? ` <span class="hl-note">(${e.confidence === 'rough' ? 'rough' : '~'})</span>` : ''}</td><td>${e.calories} kcal</td><td>P ${e.protein} C ${e.carbs} F ${e.fat}</td><td><span class="hl-x" data-del="${e.id}">✕</span></td></tr>`).join('')}</table>` : '<div class="hl-note" style="padding:6px 0">—</div>'}</div>`; }).join(''))}
            ${G.card('MEAL PRESETS', `<table class="hl-table">${store.presets.slice().sort((a, b) => (b.favorite - a.favorite) || (b.useCount - a.useCount) || a.code.localeCompare(b.code)).map(p => `<tr><td><span class="hl-x" data-fav="${p.id}" style="color:${p.favorite ? 'var(--sig-900)' : 'inherit'}">${p.favorite ? '★' : '☆'}</span></td><td data-log="${p.code}" style="cursor:pointer"><span class="hl-code">${esc(p.code)}</span> ${esc(p.name)}</td><td>${p.calories}</td>
              <td style="white-space:nowrap"><span class="hl-x" data-edit="${p.id}" title="Edit">✎</span> <span class="hl-x" data-dup="${p.id}" title="Duplicate">⧉</span> <span class="hl-x" data-delp="${p.id}" title="Delete">✕</span></td></tr>`).join('')}</table>`, '<button class="hl-btn pri" id="newPreset">+ NEW PRESET</button>')}
          </div>
          ${G.card('TRENDS', `<div class="hl-pills" style="margin-bottom:12px"><button class="hl-pill ${st.range === 7 ? 'on' : ''}" data-r="7">7D</button><button class="hl-pill ${st.range === 30 ? 'on' : ''}" data-r="30">30D</button></div>
            <div class="hl-grid hl-g2" style="margin-bottom:0"><div><div class="hl-label" style="margin-bottom:6px">CALORIES VS TARGET</div><div class="hl-chart sm" id="${ids.tr}"></div></div><div><div class="hl-label" style="margin-bottom:6px">PROTEIN VS TARGET · G</div><div class="hl-chart sm" id="${ids.prot}"></div></div>
            <div><div class="hl-label" style="margin-bottom:6px">CALORIES IN VS OUT</div><div class="hl-chart sm" id="${ids.io}"></div><div class="hl-note" id="ioNote" style="margin-top:4px"></div></div><div><div class="hl-label" style="margin-bottom:6px">MACRO SPLIT · % OF CALORIES</div><div class="hl-chart sm" id="${ids.split}"></div></div></div>`)}
          ${G.card('YOUR PLAN', `<table class="hl-table"><tr><td>BMR</td><td>${tg.plan?.bmr ? F.num(tg.plan.bmr) + ' kcal' : '—'}</td><td>TDEE</td><td>${tg.plan?.tdee ? F.num(tg.plan.tdee) + ' kcal' : '—'}</td></tr>
            <tr><td>Daily target</td><td>${F.num(tg.calories)} kcal</td><td>Macros</td><td>P ${tg.protein} · C ${tg.carbs} · F ${tg.fat} g</td></tr>
            <tr><td>Water</td><td>${(tg.waterMl / 1000).toFixed(1)} L</td><td>Timeline</td><td>${tg.plan?.weeks ? '~' + tg.plan.weeks + ' weeks to goal' : '—'}</td></tr></table>`)}`;

        window.gridRingChart(ids.ringC, [{ label: 'Calories', value: t.cal, maxValue: tg.calories, color: t.cal > tg.calories * 1.05 ? '#f97316' : '#76b372' }], { baseInnerRadius: 70, strokeWidth: 16, defaultLabel: 'OF TARGET' });
        window.gridRingChart(ids.ringM, [{ label: 'Protein', value: t.p, maxValue: tg.protein, color: '#3b82f6' }, { label: 'Carbs', value: t.c, maxValue: tg.carbs, color: '#14b8a6' }, { label: 'Fat', value: t.f, maxValue: tg.fat, color: '#f59e0b' }], { baseInnerRadius: 42, strokeWidth: 12, defaultLabel: 'OF MACROS' });
        trends(tg, ids); bind();
      };

      const trends = async (tg, ids) => {
        const dates = Array.from({ length: st.range }, (_, i) => addDays(today, -(st.range - 1 - i))), x = dates.map(F.short);
        const by = dates.map(d => totals(store.log.filter(e => e.date === d))), logged = by.map(b => b.cal > 0);
        const colr = (v, i) => !logged[i] ? 'rgba(255,255,255,.08)' : v > tg.calories * 1.05 ? '#f97316' : v >= tg.calories * 0.95 ? '#76b372' : '#3b6839';
        const axis = { grid: { left: 42, right: 14, top: 18, bottom: 24 }, tooltip: { trigger: 'axis' }, xAxis: { type: 'category', data: x, axisLabel: { interval: Math.max(0, Math.ceil(x.length / 8) - 1) } } };
        window.ethosChart(ids.tr).setOption({ ...axis, yAxis: { type: 'value' }, series: [{ type: 'bar', barMaxWidth: 22, data: by.map((b, i) => ({ value: b.cal, itemStyle: { color: colr(b.cal, i), borderRadius: [4, 4, 0, 0] } })), markLine: { silent: true, symbol: 'none', lineStyle: { color: 'rgba(240,240,240,.38)', type: 'dashed' }, data: [{ yAxis: tg.calories }], label: { formatter: 'TARGET', color: 'rgba(240,240,240,.38)', fontSize: 9 } } }] }, true);
        window.ethosChart(ids.prot).setOption({ ...axis, yAxis: { type: 'value' }, series: [Object.assign(window.bkArea('#3b82f6', { fillOpacity: 0.15 }), { data: by.map((b, i) => (logged[i] ? b.p : null)), connectNulls: true, markLine: { silent: true, symbol: 'none', lineStyle: { color: 'rgba(240,240,240,.38)', type: 'dashed' }, data: [{ yAxis: tg.protein }], label: { formatter: 'TARGET', color: 'rgba(240,240,240,.38)', fontSize: 9 } } })] }, true);
        const lg = by.filter((_, i) => logged[i]), tot = { p: S.sum(lg.map(b => b.p)) * 4, c: S.sum(lg.map(b => b.c)) * 4, f: S.sum(lg.map(b => b.f)) * 9 };
        const sc = window.ethosChart(ids.split);
        if (lg.length) sc.setOption({ tooltip: { trigger: 'item', formatter: '{b}: {d}%' }, series: [Object.assign(window.bkPie({ radius: ['55%', '85%'] }), { data: [{ name: 'Protein', value: tot.p, itemStyle: { color: '#3b82f6' } }, { name: 'Carbs', value: tot.c, itemStyle: { color: '#14b8a6' } }, { name: 'Fat', value: tot.f, itemStyle: { color: '#f59e0b' } }], label: { show: true, formatter: '{b} {d}%', color: 'rgba(240,240,240,.65)', fontSize: 9 } })] }, true);
        else document.getElementById(ids.split).innerHTML = G.empty('NOTHING LOGGED IN THIS RANGE');
        // calories in vs out: burn comes from the health data (Fitbit); skipped quietly when it is not synced
        const burn = (await G.data('daily', { from: dates[0], to: today })).reduce((o, r) => (o[r.date] = r.caloriesTotal, o), {});
        const out = dates.map(d => burn[d] ?? null);
        window.ethosChart(ids.io).setOption({ ...axis, yAxis: { type: 'value' }, legend: { top: 0, right: 0 }, series: [Object.assign(window.bkBar('#76b372', { count: x.length }), { name: 'In', data: by.map(b => b.cal || null) }), { type: 'line', name: 'Out', data: out, symbol: 'none', lineStyle: { color: '#f97316', width: 2 }, connectNulls: true }] }, true);
        const both = dates.map((_, i) => (logged[i] && out[i] != null ? by[i].cal - out[i] : null)).filter(v => v != null);
        const note = document.getElementById('ioNote');
        if (note) note.textContent = both.length ? `NET OVER ${both.length} LOGGED DAYS: ${S.sum(both) >= 0 ? '+' : ''}${F.num(S.sum(both))} KCAL (${S.sum(both) >= 0 ? 'SURPLUS' : 'DEFICIT'})` : 'NEEDS FOOD LOGS AND SYNCED FITBIT DATA';
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
        root.querySelectorAll('[data-d]').forEach(b => b.onclick = () => { const n = +b.dataset.d; st.date = n === 0 ? today : addDays(st.date, n); if (st.date > today) st.date = today; draw(); });
        root.querySelectorAll('[data-del]').forEach(x => x.onclick = async () => { try { await store.delFood(x.dataset.del); } catch (e) { G.toast('DELETE FAILED'); } draw(); });
        root.querySelectorAll('[data-w]').forEach(b => b.onclick = async () => { try { await store.setWater(st.date, Math.max(0, (store.water[st.date] || 0) + +b.dataset.w)); } catch (e) { G.toast('SAVE FAILED'); } draw(); });
        root.querySelectorAll('[data-log]').forEach(td => td.onclick = () => doLog(td.dataset.log));
        root.querySelectorAll('[data-r]').forEach(b => b.onclick = () => { st.range = +b.dataset.r; draw(); });
        root.querySelector('#newPreset').onclick = () => presetForm(null, null, draw);
        root.querySelector('#foodBtn').onclick = () => foodForm(st.date, draw);
        root.querySelector('#planBtn').onclick = () => planForm(draw);
        root.querySelectorAll('[data-edit]').forEach(x => x.onclick = () => presetForm(store.presets.find(p => p.id === x.dataset.edit), null, draw));
        root.querySelectorAll('[data-dup]').forEach(x => x.onclick = () => { const p = store.presets.find(q => q.id === x.dataset.dup); presetForm(null, { ...p, code: '', name: p.name + ' copy' }, draw); });
        root.querySelectorAll('[data-fav]').forEach(x => x.onclick = async () => { const p = store.presets.find(q => q.id === x.dataset.fav); try { await store.savePreset({ favorite: !p.favorite }, p.id); } catch (e) { G.toast('SAVE FAILED'); } draw(); });
        root.querySelectorAll('[data-delp]').forEach(x => x.onclick = async () => { const p = store.presets.find(q => q.id === x.dataset.delp); if (!confirm(`Delete preset ${p.code} (${p.name})? Past diary entries keep their numbers.`)) return; try { await store.delPreset(p.id); } catch (e) { G.toast('DELETE FAILED'); } draw(); });
      };

      draw();
    },
  });
})();
