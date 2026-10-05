/* Deficit page: calories burned vs eaten per day, cumulative deficit vs weight, weight log, progress photos.
   Burn is typed in from the user's own tracker app; days without an entry use the plan's TDEE and are marked ESTIMATED. */
(function () {
  const G = window.Grid, F = G.fmt, S = G.stats, D = () => G.deficit;
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const st = { range: 30, a: null, b: null, useEst: true };
  const STATUS = { ok: ['COUNTED', 'var(--green)'], today: ['IN PROGRESS', 'var(--text-muted)'], nolog: ['NO FOOD LOG', 'var(--text-muted)'], noburn: ['NO BURN ENTRY', 'var(--orange)'], check: ['CHECK LOG (UNDER 800)', 'var(--orange)'] };

  // ── image compression (client side; only small JPEGs ever leave the browser) ──
  async function compress(file) {
    if (!/^image\//.test(file.type)) throw new Error(`${file.name}: not an image`);
    let bmp; try { bmp = await createImageBitmap(file); } catch (e) { throw new Error(`${file.name}: this format can't be read in the browser (export as JPEG)`); }
    const render = (maxEdge, q) => { const k = Math.min(1, maxEdge / Math.max(bmp.width, bmp.height)), c = document.createElement('canvas'); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k); c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height); return c.toDataURL('image/jpeg', q); };
    let edge = 1280, q = 0.82, image = render(edge, q);
    while (image.length > 700000 && (q > 0.5 || edge > 800)) { if (q > 0.5) q -= 0.08; else edge -= 160; image = render(edge, q); }
    if (image.length > 700000) throw new Error(`${file.name}: still too large after compression`);
    let tq = 0.7, thumb = render(220, tq); while (thumb.length > 55000 && tq > 0.3) { tq -= 0.1; thumb = render(220, tq); }
    bmp.close && bmp.close();
    return { image, thumb };
  }

  G.registerPage('deficit', {
    sub: 'Calories burned vs eaten · weight · progress photos', dot: 'var(--pink)', foot: 'Estimates only, not medical advice.',
    async render(root) {
      const today = F.date(new Date());
      let rows = [], weight = [], photos = [], targets = null, planned = 0, tdee = null, intakeMap = {}, burnMap = {};

      const load = async () => {
        const from = D().addDays(today, -(st.range + 7)), start = D().addDays(today, -(st.range - 1));
        const [food, burn, w, ph, tg] = await Promise.all([G.data('foodlog', { from, to: today }), G.data('burn', { from, to: today }), G.data('weight', { from: D().addDays(today, -400), to: today }), G.data('photos'), G.data('targets')]);
        intakeMap = {}; food.forEach(e => { intakeMap[e.date] = (intakeMap[e.date] || 0) + e.calories; });
        burnMap = {}; (burn || []).forEach(b => { burnMap[b.date] = b.kcal; });
        weight = (w || []).slice().sort((a, b) => (a.date < b.date ? -1 : 1)); photos = (ph || []).slice().sort((a, b) => (a.date < b.date ? -1 : 1)); targets = tg;
        tdee = tg && tg.plan && tg.plan.tdee ? tg.plan.tdee : null;
        planned = tdee && tg.calories ? Math.max(0, tdee - tg.calories) : 0;
        rows = D().buildDays({ from: start, to: today, intake: intakeMap, burn: burnMap, today, estimate: tdee, useEstimate: st.useEst });
        if (photos.length >= 2 && (!photos.find(p => p.id === st.a) || !photos.find(p => p.id === st.b))) { st.a = photos[0].id; st.b = photos.at(-1).id; }
        if (photos.length < 2) { st.a = photos[0]?.id || null; st.b = null; }
      };

      const saveBurn = async (date, kcal) => {
        try { if (G.isDemo()) G.seed.setBurn(date, kcal); else await gridFetch('/api/progress/burn/' + date, { method: 'PUT', body: JSON.stringify({ kcal }) }); }
        catch (e) { return G.toast('SAVE FAILED'); }
        await load(); draw(); G.toast('BURN SAVED');
      };
      const burnModal = (date) => G.modal('CALORIES BURNED · ' + date, `${G.field('Total calories burned (kcal)', G.input('kcal', burnMap[date] ?? '', 'inputmode="numeric" placeholder="from your tracker app"'))}
          <div class="hl-note" style="line-height:1.8">Copy the day's total from your Google Health app. ${tdee ? `Without an entry, GRID uses your plan's TDEE (${F.num(tdee)} kcal) and marks the day ESTIMATED.` : 'Set a plan in Nutrition to get an automatic estimate for days you skip.'}</div><div id="err" style="color:var(--red);font-size:11px;min-height:16px;margin-top:8px"></div>
          <div class="modal-actions">${burnMap[date] != null ? '<button class="btn-delete" data-del style="margin-right:auto">REMOVE</button>' : ''}<button class="btn-cancel" data-cancel>CANCEL</button><button class="btn-save" data-save>SAVE</button></div>`, (m, close) => {
        m.querySelector('[name=kcal]').focus();
        m.querySelector('[data-cancel]').onclick = close;
        m.querySelector('[data-save]').onclick = async () => { const k = Number(m.querySelector('[name=kcal]').value); if (!Number.isInteger(k) || k < 500 || k > 12000) return (m.querySelector('#err').textContent = 'Enter a whole number from 500 to 12,000'); close(); await saveBurn(date, k); };
        const del = m.querySelector('[data-del]'); if (del) del.onclick = async () => { close(); try { if (G.isDemo()) G.seed.delBurn(date); else await gridFetch('/api/progress/burn/' + date, { method: 'DELETE' }); } catch (e) { return G.toast('DELETE FAILED'); } await load(); draw(); };
      }, 440);

      const draw = () => {
        const sum = D().summary(rows, planned), cum = D().cumulative(rows), x = rows.map(r => F.short(r.date));
        const wInRange = weight.filter(w => w.date >= rows[0].date), startKg = (weight.filter(w => w.date <= rows[0].date).at(-1) || wInRange[0])?.kg ?? null;
        const pred = startKg ? D().predictedWeight(startKg, cum) : cum.map(() => null), actualChange = wInRange.length >= 2 ? +(wInRange.at(-1).kg - wInRange[0].kg).toFixed(1) : null;
        const trend = D().weightTrend(wInRange), wk = D().weekly(rows), ids = {}; ['io', 'def', 'cum'].forEach(k => { ids[k] = G.uid(); });
        const missingBurn = rows.filter(r => r.status === 'noburn').length;

        root.innerHTML = `
          <div class="fx-bar"><div class="hl-pills">${[14, 30, 60, 90].map(r => `<button class="hl-pill ${st.range === r ? 'on' : ''}" data-r="${r}">${r}D</button>`).join('')}</div>
            <div class="fx-tools"><div class="hl-pills"><button class="hl-pill ${st.useEst ? 'on' : ''}" data-est="1" title="Use the plan's TDEE for days with no burn entry">COUNT ESTIMATED DAYS</button><button class="hl-pill ${!st.useEst ? 'on' : ''}" data-est="0">TYPED-IN ONLY</button></div><button class="hl-btn pri" id="burnBtn">+ LOG BURN</button></div></div>
          <div class="hl-note" style="margin-bottom:14px">BURN = YOUR TYPED-IN TOTAL (OR THE PLAN'S TDEE, MARKED EST.) · EATEN = FOOD LOG · TODAY IS EXCLUDED UNTIL IT ENDS</div>
          <div class="fin-group-label">OVERVIEW</div>
          <div id="t1"></div>
          <div class="fin-group-label">DAILY</div>
          <div class="hl-grid hl-g2">
            ${G.card('BURNED VS EATEN · KCAL', `<div class="hl-chart" id="${ids.io}"></div>`)}
            ${G.card('DAILY DEFICIT · KCAL', `<div class="hl-chart" id="${ids.def}"></div>`, `<span class="hl-note">${planned ? 'DASHED = PLANNED ' + planned + '/DAY' : 'SET A GOAL IN NUTRITION FOR A PLANNED DEFICIT'}</span>`)}
          </div>
          ${G.card('CUMULATIVE DEFICIT & WEIGHT', `<div class="hl-chart" id="${ids.cum}"></div>`, `<span class="hl-note">${startKg ? 'DASHED = WEIGHT PREDICTED FROM THE DEFICIT (7,700 KCAL PER KG) · DOTS = YOUR WEIGHT' : 'LOG A WEIGHT TO COMPARE'}</span>`)}
          <div class="fin-group-label" style="margin-top:16px">BREAKDOWN</div>
          <div class="hl-grid hl-g2">
            ${G.card('WEEKLY SUMMARY', wk.length ? `<table class="hl-table"><tr><th>Week of</th><th>Days</th><th>Total</th><th>Avg/day</th><th>Est. kg</th></tr>${wk.slice().reverse().map(w => `<tr><td>${w.week}</td><td>${w.days}</td><td>${F.num(w.total)}</td><td>${F.num(w.avg)}</td><td>${(w.total / D().KCAL_PER_KG).toFixed(2)}</td></tr>`).join('')}</table>` : G.empty('NO COMPLETE DAYS YET'))}
            ${G.card('RECENT DAYS', `<table class="hl-table"><tr><th>Date</th><th>Eaten</th><th>Burned</th><th>Deficit</th><th>Status</th></tr>${rows.slice().reverse().slice(0, 14).map(r => `<tr><td>${r.date}</td><td>${r.intake ? F.num(r.intake) : '—'}</td>
              <td><span class="hl-x" data-burn="${r.date}" title="Edit burn" style="color:inherit">${r.burn != null ? F.num(r.burn) : '—'}${r.burnSource === 'estimate' ? ' <span class="hl-note">EST</span>' : ''} ✎</span></td>
              <td style="color:${r.status === 'ok' ? (r.deficit >= 0 ? 'var(--green)' : 'var(--orange)') : 'var(--text-muted)'}">${r.deficit != null ? (r.deficit > 0 ? '−' : '+') + Math.abs(r.deficit) : '—'}</td><td><span class="hl-note" style="color:${STATUS[r.status][1]}">${STATUS[r.status][0]}</span></td></tr>`).join('')}</table>`, '<span class="hl-note">CLICK A BURN TO EDIT</span>')}
          </div>
          <div class="fin-group-label">BODY</div>
          <div class="hl-grid hl-g2">
            ${G.card('WEIGHT', `<div style="display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap"><input class="form-input" id="wDate" type="date" value="${today}" max="${today}" style="width:auto"><input class="form-input" id="wKg" inputmode="decimal" placeholder="kg" style="width:90px"><button class="hl-btn pri" id="wSave">LOG WEIGHT</button></div>
              <div class="hl-note" style="margin-bottom:8px">${trend != null ? `TREND ${trend > 0 ? '+' : ''}${trend} KG/WEEK` : 'TREND NEEDS A WEEK OF WEIGHT ENTRIES'}${sum.days && sum.kg ? ` · DEFICIT PREDICTS −${(sum.kg / (st.range / 7)).toFixed(2)} KG/WEEK` : ''}</div>
              ${weight.length ? `<table class="hl-table">${weight.slice(-8).reverse().map(w => `<tr><td>${w.date}</td><td>${w.kg} kg</td><td><span class="hl-x" data-wdel="${w.date}">✕</span></td></tr>`).join('')}</table>` : G.empty('NO WEIGHT ENTRIES YET')}`)}
            ${G.card('HOW TO READ THIS', `<div class="hl-note" style="line-height:1.9;text-transform:none;font-size:10px">About 7,700 kcal of deficit is roughly 1 kg of body weight. Real weight also moves with water, salt and muscle, so judge by the weekly trend, not single days. Days with no food log, intake under 800 kcal, or no burn data are skipped so they can't fake a huge deficit.${tdee ? ` Days marked EST use your plan's TDEE (${F.num(tdee)} kcal), which is only an estimate of what you really burned.` : ''}</div>`)}
          </div>
          ${G.card('PROGRESS PHOTOS', '<div id="photos"></div>', '<button class="hl-btn pri" id="addPhoto">+ ADD PHOTOS</button>')}`;

        G.tiles(root.querySelector('#t1'), [
          { label: 'AVG DAILY DEFICIT', value: sum.avg == null ? '—' : F.num(sum.avg), unit: 'kcal', note: planned ? `PLANNED ${planned}/DAY · ${sum.onTarget} OF ${sum.days} DAYS ON TARGET` : `${sum.days} COUNTED DAYS` },
          { label: 'TOTAL DEFICIT', value: F.num(sum.total), unit: 'kcal', note: `≈ ${sum.kg} KG OF BODY WEIGHT${sum.estimatedDays ? ` · ${sum.estimatedDays} DAYS ESTIMATED` : ''}` },
          { label: 'WEIGHT CHANGE', value: actualChange == null ? '—' : (actualChange > 0 ? '+' : '') + actualChange, unit: 'kg', note: startKg && sum.days ? `PREDICTED ${(-sum.kg).toFixed(1)} KG FROM DEFICIT` : 'LOG WEIGHT TO COMPARE' },
          { label: 'DEFICIT STREAK', value: sum.streak, unit: 'days', note: sum.skipped ? `${sum.skipped} DAYS SKIPPED${missingBurn ? ` (${missingBurn} NEED A BURN ENTRY)` : ''}` : 'ALL DAYS COUNTED' }]);

        const axis = { grid: { left: 46, right: 46, top: 24, bottom: 26 }, tooltip: { trigger: 'axis' }, legend: { top: 0, right: 0 }, xAxis: { type: 'category', data: x, axisLabel: { interval: Math.max(0, Math.ceil(x.length / 10) - 1) } } };
        window.ethosChart(ids.io).setOption({ ...axis, grid: { ...axis.grid, right: 14 }, yAxis: { type: 'value' }, series: [Object.assign(window.bkBar('#76b372', { count: x.length }), { name: 'Eaten', data: rows.map(r => r.intake) }), { type: 'line', name: 'Burned', data: rows.map(r => r.burn), symbol: 'none', lineStyle: { color: '#f97316', width: 2 }, connectNulls: true }] }, true);
        const col = (r) => r.status !== 'ok' ? 'rgba(255,255,255,.08)' : r.deficit < 0 ? '#f97316' : r.burnSource === 'estimate' ? '#3b6839' : planned && r.deficit < planned * 0.8 ? '#3b6839' : '#76b372';
        window.ethosChart(ids.def).setOption({ ...axis, grid: { ...axis.grid, right: 14 }, legend: { show: false }, yAxis: { type: 'value' }, tooltip: { trigger: 'axis', formatter: (p) => { const r = rows[p[0].dataIndex]; return `${r.date}<br>${r.deficit == null ? '—' : r.deficit + ' kcal'}${r.burnSource === 'estimate' ? ' (estimated burn)' : ''}`; } },
          series: [{ type: 'bar', barMaxWidth: 22, data: rows.map(r => ({ value: r.deficit, itemStyle: { color: col(r), borderRadius: [3, 3, 0, 0] } })), markLine: { silent: true, symbol: 'none', lineStyle: { color: 'rgba(240,240,240,.45)', type: 'dashed' }, data: planned ? [{ yAxis: planned }, { yAxis: 0 }] : [{ yAxis: 0 }], label: { show: false } } }] }, true);
        window.ethosChart(ids.cum).setOption({ ...axis, yAxis: [{ type: 'value', name: 'kcal', nameTextStyle: { color: 'rgba(240,240,240,.38)', fontSize: 9 } }, { type: 'value', name: 'kg', scale: true, splitLine: { show: false }, nameTextStyle: { color: 'rgba(240,240,240,.38)', fontSize: 9 } }],
          series: [Object.assign(window.bkArea('#76b372', { fillOpacity: 0.18 }), { name: 'Cumulative deficit', data: cum, connectNulls: true }),
            { type: 'line', name: 'Predicted kg', yAxisIndex: 1, data: pred, symbol: 'none', lineStyle: { color: '#9b59b6', width: 2, type: 'dashed' }, connectNulls: true },
            { type: 'scatter', name: 'Your weight', yAxisIndex: 1, data: wInRange.map(w => [F.short(w.date), w.kg]), symbolSize: 8, itemStyle: { color: '#a5f79e' } }] }, true);
        drawPhotos(); bind();
      };

      // ── photos ─────────────────────────────────────────────
      const fullImage = async (id) => { if (G.isDemo()) return G.seed.photo(id)?.image; const p = await gridFetch('/api/progress/photos/' + id); return p.image; };
      const drawPhotos = () => {
        const el = root.querySelector('#photos');
        if (!photos.length) { el.innerHTML = G.empty('NO PHOTOS YET<br>Add a photo now and another in a few weeks to see the difference.'); return; }
        const pa = photos.find(p => p.id === st.a), pb = photos.find(p => p.id === st.b);
        el.innerHTML = `<div class="hl-note" style="margin-bottom:8px">CLICK TWO PHOTOS TO COMPARE (FIRST = BEFORE, SECOND = AFTER)</div>
          <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:10px">${photos.map(p => `<div data-ph="${p.id}" style="position:relative;cursor:pointer;border:1px solid ${p.id === st.a || p.id === st.b ? 'var(--green)' : 'var(--card-border)'};border-radius:var(--radius);overflow:hidden;background:var(--bg-2)">
            <img src="${p.thumb}" alt="" style="width:100%;aspect-ratio:3/4;object-fit:cover;display:block">
            ${p.id === st.a ? '<span class="hl-code" style="position:absolute;top:6px;left:6px;background:var(--bg)">BEFORE</span>' : p.id === st.b ? '<span class="hl-code" style="position:absolute;top:6px;left:6px;background:var(--bg)">AFTER</span>' : ''}
            <span class="hl-x" data-pdel="${p.id}" style="position:absolute;top:6px;right:8px;background:var(--bg);border-radius:4px;padding:0 5px">✕</span>
            <div style="padding:6px 8px;font-size:9px;letter-spacing:1px"><div>${p.date}</div><div style="color:var(--text-muted)">${p.weightKg ? p.weightKg + ' KG' : ''}${p.note ? ' · ' + esc(p.note) : ''}</div></div></div>`).join('')}</div>
          ${pa && pb ? `<div style="margin-top:16px"><div class="fin-group-label" style="margin-bottom:8px">COMPARE · ${pa.date} → ${pb.date} · ${Math.round((new Date(pb.date) - new Date(pa.date)) / 864e5)} DAYS${pa.weightKg && pb.weightKg ? ` · ${(pb.weightKg - pa.weightKg > 0 ? '+' : '')}${(pb.weightKg - pa.weightKg).toFixed(1)} KG` : ''}</div>
            <div class="hl-pills" style="margin-bottom:10px"><button class="hl-pill on" data-cmode="side">SIDE BY SIDE</button><button class="hl-pill" data-cmode="slide">SLIDER</button></div><div id="cmp">${G.empty('LOADING IMAGES…')}</div></div>` : ''}`;
        if (pa && pb) compare('side');
        el.querySelectorAll('[data-cmode]').forEach(b => b.onclick = () => { el.querySelectorAll('[data-cmode]').forEach(x => x.classList.toggle('on', x === b)); compare(b.dataset.cmode); });
        el.querySelectorAll('[data-ph]').forEach(c => c.onclick = (e) => {
          if (e.target.dataset.pdel) return; const id = c.dataset.ph;
          if (!st.a || (st.a && st.b)) { st.a = id; st.b = null; } else if (id !== st.a) { st.b = id; if (photos.findIndex(p => p.id === st.b) < photos.findIndex(p => p.id === st.a)) [st.a, st.b] = [st.b, st.a]; }
          drawPhotos();
        });
        el.querySelectorAll('[data-pdel]').forEach(x => x.onclick = async (e) => {
          e.stopPropagation(); if (!confirm('Delete this photo? This cannot be undone.')) return;
          try { if (G.isDemo()) G.seed.delPhoto(x.dataset.pdel); else await gridFetch('/api/progress/photos/' + x.dataset.pdel, { method: 'DELETE' }); } catch (err) { return G.toast('DELETE FAILED'); }
          await load(); draw();
        });
      };
      const compare = async (mode) => {
        const cmp = root.querySelector('#cmp'); if (!cmp) return;
        let a, b; try { [a, b] = await Promise.all([fullImage(st.a), fullImage(st.b)]); } catch (e) { cmp.innerHTML = G.empty('COULD NOT LOAD IMAGES'); return; }
        if (!a || !b) { cmp.innerHTML = G.empty('COULD NOT LOAD IMAGES'); return; }
        const img = (src) => `<img src="${src}" alt="" style="width:100%;height:100%;object-fit:contain;display:block">`;
        cmp.innerHTML = mode === 'side'
          ? `<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">${[a, b].map(s => `<div style="background:var(--bg-2);border-radius:var(--radius);aspect-ratio:3/4">${img(s)}</div>`).join('')}</div>`
          : `<div style="max-width:420px;margin:0 auto"><div style="position:relative;background:var(--bg-2);border-radius:var(--radius);aspect-ratio:3/4;overflow:hidden">${img(a)}<div id="top" style="position:absolute;inset:0;clip-path:inset(0 50% 0 0)">${img(b)}</div><div id="bar" style="position:absolute;top:0;bottom:0;left:50%;width:2px;background:var(--sig-900)"></div></div>
              <input id="range" type="range" min="0" max="100" value="50" style="width:100%;margin-top:10px;accent-color:#76b372"><div class="hl-note" style="display:flex;justify-content:space-between"><span>AFTER</span><span>BEFORE</span></div></div>`;
        const r = cmp.querySelector('#range'); if (r) r.oninput = () => { cmp.querySelector('#top').style.clipPath = `inset(0 ${100 - r.value}% 0 0)`; cmp.querySelector('#bar').style.left = r.value + '%'; };
      };

      const photoDialog = () => {
        const lastKg = weight.at(-1)?.kg ?? '';
        G.modal('ADD PROGRESS PHOTOS', `${G.field('Photos (JPEG, PNG, WEBP)', '<input class="form-input" id="pf" type="file" accept="image/*" multiple>')}
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">${G.field('Date', `<input class="form-input" id="pd" type="date" value="${today}" max="${today}">`)}${G.field('Weight kg (optional)', `<input class="form-input" id="pw" value="${lastKg}" inputmode="decimal">`)}</div>
          ${G.field('Note (optional)', '<input class="form-input" id="pn" maxlength="300" placeholder="front / side / back, morning, fasted…">')}
          <div class="hl-note" style="line-height:1.7;text-transform:none">Photos are shrunk in your browser and stored privately in your account. Only you can see them.</div>
          <div id="perr" style="color:var(--red);font-size:11px;min-height:16px;margin-top:8px"></div><div class="modal-actions"><button class="btn-cancel" data-cancel>CANCEL</button><button class="btn-save" id="pgo">UPLOAD</button></div>`, (m, close) => {
          m.querySelector('[data-cancel]').onclick = close;
          m.querySelector('#pgo').onclick = async () => {
            const files = [...m.querySelector('#pf').files], err = m.querySelector('#perr'), btn = m.querySelector('#pgo');
            if (!files.length) return (err.textContent = 'Choose at least one photo');
            if (files.length > 12) return (err.textContent = 'Up to 12 photos at a time');
            const kg = m.querySelector('#pw').value.trim() === '' ? null : Number(m.querySelector('#pw').value); if (kg != null && !(kg >= 30 && kg <= 250)) return (err.textContent = 'Weight must be 30 to 250 kg');
            const date = m.querySelector('#pd').value; if (!date || date > today) return (err.textContent = 'Pick a valid date');
            btn.disabled = true; let ok = 0; const failed = [];
            for (const [i, f] of files.entries()) {
              btn.textContent = `UPLOADING ${i + 1}/${files.length}…`;
              try {
                const { image, thumb } = await compress(f), body = { date, note: m.querySelector('#pn').value.trim() || null, weightKg: kg, image, thumb };
                if (G.isDemo()) G.seed.addPhoto(body); else await gridFetch('/api/progress/photos', { method: 'POST', body: JSON.stringify(body) });
                ok++;
              } catch (e) { failed.push(e.message || f.name); }
            }
            if (kg != null && ok) { try { if (G.isDemo()) G.seed.setWeight(date, kg); else await gridFetch('/api/progress/weight/' + date, { method: 'PUT', body: JSON.stringify({ kg }) }); } catch (_) {} }
            btn.disabled = false; btn.textContent = 'UPLOAD';
            if (failed.length && !ok) return (err.textContent = failed.slice(0, 3).join(' · '));
            close(); if (ok) { await load(); draw(); }
            G.toast(`${ok} PHOTO${ok > 1 ? 'S' : ''} ADDED` + (failed.length ? ` · ${failed.length} FAILED: ${failed[0]}`.toUpperCase() : ''));
          };
        }, 480);
      };

      const bind = () => {
        root.querySelectorAll('[data-r]').forEach(b => b.onclick = async () => { st.range = +b.dataset.r; await load(); draw(); });
        root.querySelectorAll('[data-est]').forEach(b => b.onclick = async () => { st.useEst = b.dataset.est === '1'; await load(); draw(); });
        root.querySelector('#burnBtn').onclick = () => burnModal(D().addDays(today, -1));
        root.querySelectorAll('[data-burn]').forEach(x => x.onclick = () => burnModal(x.dataset.burn));
        root.querySelector('#addPhoto').onclick = photoDialog;
        root.querySelector('#wSave').onclick = async () => {
          const date = root.querySelector('#wDate').value, kg = Number(root.querySelector('#wKg').value);
          if (!date || date > today) return G.toast('PICK A VALID DATE'); if (!(kg >= 30 && kg <= 250)) return G.toast('WEIGHT MUST BE 30 TO 250 KG');
          try { if (G.isDemo()) G.seed.setWeight(date, kg); else await gridFetch('/api/progress/weight/' + date, { method: 'PUT', body: JSON.stringify({ kg }) }); } catch (e) { return G.toast('SAVE FAILED'); }
          await load(); draw(); G.toast('WEIGHT SAVED');
        };
        root.querySelectorAll('[data-wdel]').forEach(x => x.onclick = async () => { try { if (G.isDemo()) G.seed.delWeight(x.dataset.wdel); else await gridFetch('/api/progress/weight/' + x.dataset.wdel, { method: 'DELETE' }); } catch (e) { return G.toast('DELETE FAILED'); } await load(); draw(); });
      };

      await load(); draw();
    },
  });
})();
