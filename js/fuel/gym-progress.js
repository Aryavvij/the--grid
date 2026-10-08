/* Gym integrated components:
   - Exercise Progression chart in Muscle Growth window
   - Training Calendar heatmap in Overview & Log window
   Reads localStorage.gymLogs and gymExerciseRegistry. */
(function () {
  const G = window.Grid, F = G?.fmt, S = G?.stats, M = () => G?.gym;
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const st = { name: null, range: 180 };

  const readLogs = () => {
    try {
      const v = JSON.parse(localStorage.getItem('gymLogs') || '[]');
      return Array.isArray(v) ? v.filter(l => l && typeof l === 'object') : [];
    } catch (e) { return []; }
  };

  function getToday() {
    return F?.date ? F.date(new Date()) : new Date().toISOString().slice(0, 10);
  }

  function renderGymTrainingCalendar() {
    const el = document.getElementById('gymTrainingCalendar');
    if (!el || !window.Grid?.heat || !window.Grid?.gym) return;
    const logs = readLogs();
    const today = getToday();
    const valid = logs.filter(l => M().validDate(l.date));
    const days = {};
    valid.forEach(l => { days[l.date] = (days[l.date] || 0) + M().sessionVolume(l); });
    G.heat('gymTrainingCalendar', {
      range: [M().addDays(today, -181), today],
      days: Object.entries(days).map(([date, v]) => ({ date, v: Math.round(v) })),
      unit: ' kg'
    });
  }

  function renderGymExerciseProgression() {
    const chartEl = document.getElementById('exProgChart');
    const selEl = document.getElementById('exProgSel');
    if (!chartEl || !selEl || !window.Grid?.gym) return;
    const logs = readLogs();
    const today = getToday();
    const valid = logs.filter(l => M().validDate(l.date));

    let names = M().exerciseNames(valid);
    if (!names.length) {
      try {
        const reg = JSON.parse(localStorage.getItem('gymExerciseRegistry') || '{}');
        Object.values(reg).forEach(mg => ((mg && mg.exercises) || []).forEach(e => {
          if (e.name && !names.includes(e.name.toUpperCase())) names.push(e.name.toUpperCase());
        }));
      } catch (e) {}
    }

    if (!names.length) {
      chartEl.innerHTML = G.empty ? G.empty('NO WORKOUTS LOGGED YET<br>Log a session on the WEEKLY SPLIT tab and your progress shows up here.') : '<div class="hl-empty">NO WORKOUTS LOGGED YET</div>';
      selEl.innerHTML = '<option>NO EXERCISES</option>';
      return;
    }

    if (!st.name || !names.includes(st.name)) st.name = names[0];

    selEl.innerHTML = names.map(n => `<option value="${esc(n)}" ${n === st.name ? 'selected' : ''}>${esc(n)}</option>`).join('');
    selEl.onchange = (e) => {
      st.name = e.target.value;
      drawProgression(valid, today);
    };

    const pills = document.querySelectorAll('#exProgPills .hl-pill');
    pills.forEach(b => {
      b.onclick = () => {
        st.range = +b.dataset.rng;
        pills.forEach(x => x.classList.toggle('on', x === b));
        drawProgression(valid, today);
      };
    });

    drawProgression(valid, today);
  }

  function drawProgression(validLogs, today) {
    const chartEl = document.getElementById('exProgChart');
    const chip = document.getElementById('exProgChip');
    if (!chartEl || !st.name) return;

    const all = M().withPRs(M().history(validLogs, st.name));
    const from = st.range >= 9999 ? '0000-00-00' : M().addDays(today, -st.range);
    const pts = all.filter(p => p.date >= from);

    if (chip) {
      const plateau = M().plateau(all, today);
      const last3 = all.slice(-3);
      const trendUp = last3.length === 3 && last3[2].e1rm > last3[0].e1rm;
      chip.innerHTML = plateau
        ? '<span class="hl-chip"><span class="dot" style="background:var(--orange)"></span>PLATEAU · NO NEW BEST IN 4+ WEEKS</span>'
        : trendUp
          ? '<span class="hl-chip"><span class="dot"></span>TRENDING UP</span>'
          : '';
    }

    const c = window.ethosChart ? window.ethosChart(chartEl) : null;
    if (!c) return;
    if (!pts.length) {
      c.clear();
      return;
    }

    c.setOption({
      grid: { left: 48, right: 48, top: 40, bottom: 26 },
      tooltip: { trigger: 'axis' },
      legend: {
        top: 4,
        right: 48,
        itemGap: 24,
        textStyle: { color: 'rgba(240,240,240,0.65)', fontSize: 10 }
      },
      xAxis: {
        type: 'category',
        data: pts.map(p => F?.short ? F.short(p.date) : p.date.slice(5)),
        axisLabel: { interval: Math.max(0, Math.ceil(pts.length / 10) - 1) }
      },
      yAxis: [
        { type: 'value', scale: true, name: 'e1RM (kg)', nameTextStyle: { color: 'rgba(240,240,240,.38)', fontSize: 9 } },
        { type: 'value', scale: true, splitLine: { show: false } }
      ],
      series: [
        Object.assign(window.bkArea ? window.bkArea('#76b372', { fillOpacity: 0.12 }) : {}, {
          name: 'Est. 1RM',
          data: pts.map(p => p.e1rm),
          symbol: 'circle',
          symbolSize: (v, p) => (pts[p.dataIndex]?.pr ? 11 : 4),
          itemStyle: { color: (p) => (pts[p.dataIndex]?.pr ? '#a5f79e' : '#76b372') }
        }),
        {
          type: 'scatter',
          name: 'Top set kg',
          yAxisIndex: 1,
          data: pts.map(p => p.weight),
          symbolSize: 6,
          itemStyle: { color: '#3b82f6' },
          tooltip: { valueFormatter: (v) => v + ' kg' }
        }
      ]
    }, true);
    c.resize();
  }

  window.renderGymTrainingCalendar = renderGymTrainingCalendar;
  window.renderGymExerciseProgression = renderGymExerciseProgression;

  function initIfActive() {
    const split = document.getElementById('gym-split');
    if (split && split.style.display !== 'none') renderGymTrainingCalendar();
    const muscle = document.getElementById('gym-muscle');
    if (muscle && muscle.style.display !== 'none') renderGymExerciseProgression();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initIfActive);
  } else {
    initIfActive();
  }
})();
