/* Nutrition page: daily rings, preset quick-log ("S1", "2x S1 dinner"), diary, preset list.
   Demo mode keeps the diary in memory; auth mode talks to /api/nutrition. */
(function () {
  const G = window.Grid, F = G.fmt, S = G.stats, P = () => G.presets;
  const SLOTS = ['breakfast', 'lunch', 'dinner', 'snack'];
  let demoLog = null;                                       // today's entries in demo mode (mutable)

  G.registerPage('nutrition', {
    title: 'Nutrition', sub: 'Calories · macros · water · meal presets',
    async render(root) {
      const today = F.date(new Date());
      const [presets, targets] = await Promise.all([G.data('presets'), G.data('targets')]);
      const loadLog = async () => {
        if (G.isDemo()) { if (!demoLog) demoLog = (await G.data('foodlog', { from: today, to: today })).map(x => ({ ...x })); return demoLog; }
        return G.data('foodlog', { from: today, to: today });
      };
      let log = await loadLog();
      const water = { ml: 0 };
      if (!targets) { root.innerHTML = G.empty('NO NUTRITION PLAN YET<br>Set your calorie and macro targets to begin (Phase 6).'); return; }

      const draw = () => {
        const sum = (k) => Math.round(S.sum(log.map(e => e[k])));
        const t = { cal: sum('calories'), p: sum('protein'), c: sum('carbs'), f: sum('fat') };
        root.innerHTML = `
          ${G.card('QUICK LOG', `<div class="hl-quick"><input id="ql" autocomplete="off" spellcheck="false" placeholder="type a preset code…  S1   ·   2x S1   ·   S1 dinner"><button class="hl-btn pri" id="qlGo">LOG</button></div><div id="qlSug"></div>`)}
          <div class="hl-grid hl-g3" style="margin-top:14px">
            ${G.card('CALORIES', `<div class="hl-ring" id="ringC"></div><div class="hl-delta flat" style="text-align:center">${t.cal} of ${targets.calories} kcal · ${Math.max(0, targets.calories - t.cal)} left</div>`)}
            ${G.card('MACROS · G', `<div class="hl-ring" id="ringM"></div><div class="hl-delta flat" style="text-align:center">P ${t.p}/${targets.protein} · C ${t.c}/${targets.carbs} · F ${t.f}/${targets.fat}</div>`)}
            ${G.card('WATER', `<div class="hl-tile"><div class="hl-val">${(water.ml / 1000).toFixed(1)}<span class="hl-unit">of ${(targets.waterMl / 1000).toFixed(1)} L</span></div>
              <div style="height:8px;border-radius:4px;background:rgba(255,255,255,.07);margin:12px 0"><div style="height:100%;width:${Math.min(100, water.ml / targets.waterMl * 100)}%;background:var(--blue);border-radius:4px;transition:width .3s"></div></div>
              <button class="hl-btn" data-w="-250">− 250 ML</button> <button class="hl-btn pri" data-w="250">+ 250 ML</button></div>`)}
          </div>
          <div class="hl-grid hl-g21">
            ${G.card('TODAY\'S DIARY', SLOTS.map(s => { const es = log.filter(e => e.slot === s);
              return `<div style="margin-bottom:12px"><div class="hl-note" style="display:flex;justify-content:space-between;text-transform:uppercase;letter-spacing:1.5px"><span>${s}</span><span>${Math.round(S.sum(es.map(e => e.calories)))} kcal</span></div>
                ${es.length ? `<table class="hl-table">${es.map(e => `<tr><td>${e.presetCode ? `<span class="hl-code">${e.presetCode}</span> ` : ''}${e.name}${e.qty && e.qty !== 1 ? ' ×' + e.qty : ''}</td><td>${e.calories} kcal</td><td>P ${e.protein} C ${e.carbs} F ${e.fat}</td><td><span class="hl-x" data-del="${e.id}">✕</span></td></tr>`).join('')}</table>` : '<div class="hl-note" style="padding:6px 0">—</div>'}</div>`; }).join(''))}
            ${G.card('MEAL PRESETS', `<table class="hl-table">${presets.map(p => `<tr data-log="${p.code}" style="cursor:pointer"><td><span class="hl-code">${p.code}</span></td><td>${p.name}</td><td>${p.calories}</td></tr>`).join('')}</table>`, '<span class="hl-note">CLICK A ROW TO LOG</span>')}
          </div>`;

        window.gridRingChart('ringC', [{ label: 'Calories', value: t.cal, maxValue: targets.calories, color: '#76b372' }], { baseInnerRadius: 70, strokeWidth: 16, defaultLabel: 'OF TARGET' });
        window.gridRingChart('ringM', [{ label: 'Protein', value: t.p, maxValue: targets.protein, color: '#3b82f6' }, { label: 'Carbs', value: t.c, maxValue: targets.carbs, color: '#14b8a6' }, { label: 'Fat', value: t.f, maxValue: targets.fat, color: '#f59e0b' }], { baseInnerRadius: 42, strokeWidth: 12, defaultLabel: 'OF MACROS' });
        bind();
      };

      const doLog = async (text) => {
        const cmd = P().parseQuickLog(text);
        if (!cmd) { G.toast('COULD NOT READ THAT. TRY: S1, 2x S1, S1 dinner'); return; }
        const preset = presets.find(p => p.code === cmd.code);
        if (!preset) { G.toast(`NO PRESET '${cmd.code}'. CREATING PRESETS ARRIVES IN PHASE 6`); return; }
        const slot = cmd.slot || preset.defaultSlot || P().slotByHour(new Date().getHours());
        let entry;
        if (G.isDemo()) {
          entry = { id: 'n' + Date.now(), date: today, slot, name: preset.name, serving: preset.serving, qty: cmd.qty, presetCode: preset.code, confidence: 'exact', ...P().scale(preset, cmd.qty) };
          log.push(entry);
        } else {
          try { entry = await gridFetch('/api/nutrition/log-preset', { method: 'POST', body: JSON.stringify({ code: cmd.code, qty: cmd.qty, slot: cmd.slot || undefined, date: today }) }); log = await loadLog(); }
          catch (e) { G.toast(e.message || 'LOG FAILED'); return; }
        }
        draw();
        G.toast(`LOGGED ${preset.code}${cmd.qty !== 1 ? ' ×' + cmd.qty : ''}: ${preset.name.toUpperCase()} · ${entry.calories} KCAL · P ${entry.protein} C ${entry.carbs} F ${entry.fat}`, async () => {
          if (G.isDemo()) log = (demoLog = log.filter(e => e.id !== entry.id));
          else { try { await gridFetch('/api/nutrition/log/' + entry.id, { method: 'DELETE' }); log = await loadLog(); } catch (_) {} }
          draw();
        });
      };

      const bind = () => {
        const inp = root.querySelector('#ql'), sug = root.querySelector('#qlSug'); let sel = 0, list = [];
        const showSug = () => {
          list = P().suggest(inp.value, presets); sel = Math.min(sel, Math.max(0, list.length - 1));
          sug.innerHTML = list.length ? `<div class="hl-suggest">${list.map((p, i) => `<div class="${i === sel ? 'on' : ''}" data-c="${p.code}"><span><span class="hl-code">${p.code}</span> ${p.name}</span><span class="hl-note">${p.calories} kcal · P${p.protein} C${p.carbs} F${p.fat}</span></div>`).join('')}</div>` : '';
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
        root.querySelectorAll('[data-del]').forEach(x => x.onclick = async () => {
          if (G.isDemo()) log = (demoLog = log.filter(e => e.id !== x.dataset.del));
          else { try { await gridFetch('/api/nutrition/log/' + x.dataset.del, { method: 'DELETE' }); log = await loadLog(); } catch (e) { G.toast('DELETE FAILED'); } }
          draw();
        });
        root.querySelectorAll('[data-w]').forEach(b => b.onclick = () => { water.ml = Math.max(0, water.ml + +b.dataset.w); draw(); });
        root.querySelectorAll('[data-log]').forEach(tr => tr.onclick = () => doLog(tr.dataset.log));
      };

      const w = await G.data('water', { from: today, to: today }); water.ml = (w[0] && w[0].ml) || 0;
      draw();
    },
  });
})();
