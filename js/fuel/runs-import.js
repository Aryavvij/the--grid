/* Strava export import: .fit .gpx .tcx (+ .gz), .zip bulk exports, activities.csv.
   Everything is parsed in the browser (FIT by js/fuel/fit-decoder.js, no downloaded libraries); only normalised runs are uploaded. */
(function () {
  const G = window.Grid, RP = () => G.runParser;
  const MAX_ZIP_BYTES = 1.5 * 1024 * 1024 * 1024;
  const BATCH_BYTES = 600 * 1024, BATCH_RUNS = 40;
  const tick = () => new Promise(r => setTimeout(r, 0));

  // ── binary helpers ───────────────────────────────────────────
  async function inflate(bytes, format) {
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream(format));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }
  async function sha256(bytes) {
    const d = await crypto.subtle.digest('SHA-256', bytes);
    return [...new Uint8Array(d)].map(b => b.toString(16).padStart(2, '0')).join('');
  }
  const text = (bytes) => new TextDecoder('utf-8').decode(bytes);

  /** Minimal ZIP reader (stored + deflate). Returns [{ name, read() }]. */
  function unzip(bytes) {
    if (bytes.length > MAX_ZIP_BYTES) throw new Error('zip is over 1.5 GB: unzip it and drop the activities folder instead');
    const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    let eocd = -1;
    for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    if (eocd < 0) throw new Error('not a valid zip file');
    const count = dv.getUint16(eocd + 10, true); let off = dv.getUint32(eocd + 16, true);
    if (count === 0xffff || off === 0xffffffff) throw new Error('zip64 archives are not supported: unzip it and drop the activities folder instead');
    const out = [];
    for (let n = 0; n < count; n++) {
      if (dv.getUint32(off, true) !== 0x02014b50) throw new Error('corrupt zip directory');
      const method = dv.getUint16(off + 10, true), comp = dv.getUint32(off + 20, true);
      const nameLen = dv.getUint16(off + 28, true), extraLen = dv.getUint16(off + 30, true), cmtLen = dv.getUint16(off + 32, true), local = dv.getUint32(off + 42, true);
      const name = text(bytes.subarray(off + 46, off + 46 + nameLen));
      off += 46 + nameLen + extraLen + cmtLen;
      if (name.endsWith('/')) continue;
      out.push({ name, read: async () => {
        const lnLen = dv.getUint16(local + 26, true), leLen = dv.getUint16(local + 28, true), start = local + 30 + lnLen + leLen;
        const data = bytes.subarray(start, start + comp);
        if (method === 0) return data;
        if (method === 8) return inflate(data, 'deflate-raw');
        throw new Error('unsupported zip compression method ' + method);
      } });
    }
    return out;
  }

  /** Expand dropped files into [{ name, read() }] leaf entries (zip members, .gz inflated, plain files). */
  async function expand(files, report) {
    const out = [];
    for (const f of files) {
      const name = f.webkitRelativePath || f.name;
      try {
        if (/\.zip$/i.test(name)) { const bytes = new Uint8Array(await f.arrayBuffer()); for (const e of unzip(bytes)) out.push(await leaf(e.name, e.read)); }
        else out.push(await leaf(name, async () => new Uint8Array(await f.arrayBuffer())));
      } catch (e) { report.failed.push({ name, reason: e.message }); }
    }
    return out;
  }
  async function leaf(name, read) {
    const gz = /\.gz$/i.test(name), clean = name.replace(/\.gz$/i, '');
    return { name: clean, origName: name, read: async () => { const b = await read(); return gz ? inflate(b, 'gzip') : b; } };
  }
  const ext = (n) => (n.match(/\.([a-z0-9]+)$/i) || [])[1]?.toLowerCase();
  const base = (n) => n.split('/').pop().toLowerCase();

  // ── format parsers -> { points, meta } ───────────────────────
  const first = (el, tag) => el.getElementsByTagNameNS('*', tag)[0];
  const val = (el, tag) => first(el, tag)?.textContent?.trim();
  const numOrU = (s) => { const n = parseFloat(s); return isFinite(n) ? n : undefined; };

  function parseXml(str) {
    const doc = new DOMParser().parseFromString(str, 'application/xml');
    if (doc.getElementsByTagName('parsererror').length) throw new Error('invalid XML');
    return doc;
  }
  function parseGpx(bytes) {
    const doc = parseXml(text(bytes)), trk = first(doc, 'trk');
    if (!trk) throw new Error('no track in GPX');
    const points = [...doc.getElementsByTagNameNS('*', 'trkpt')].map(p => ({
      t: Date.parse(val(p, 'time')), lat: numOrU(p.getAttribute('lat')), lon: numOrU(p.getAttribute('lon')), ele: numOrU(val(p, 'ele')),
      hr: numOrU(val(p, 'hr')), cad: numOrU(val(p, 'cad')),
    }));
    return { points, meta: { name: val(trk, 'name') || null, sport: [...trk.children].find(c => c.localName === 'type')?.textContent?.trim() } };
  }
  function parseTcx(bytes) {
    const doc = parseXml(text(bytes)), act = first(doc, 'Activity');
    if (!act) throw new Error('no activity in TCX');
    const points = [...doc.getElementsByTagNameNS('*', 'Trackpoint')].map(p => ({
      t: Date.parse(val(p, 'Time')), lat: numOrU(val(p, 'LatitudeDegrees')), lon: numOrU(val(p, 'LongitudeDegrees')), ele: numOrU(val(p, 'AltitudeMeters')),
      dist: numOrU(val(p, 'DistanceMeters')), hr: numOrU(first(p, 'HeartRateBpm') && val(first(p, 'HeartRateBpm'), 'Value')), cad: numOrU(val(p, 'RunCadence') ?? val(p, 'Cadence')),
    }));
    return { points, meta: { sport: act.getAttribute('Sport') } };
  }
  /** FIT -> { points, meta }, through the built-in reader. */
  function parseFit(bytes) { return G.fit.toRun(G.fit.decode(bytes)); }

  // ── Strava activities.csv ────────────────────────────────────
  function csvRows(str) {
    const rows = []; let row = [], cur = '', q = false;
    for (let i = 0; i < str.length; i++) {
      const c = str[i];
      if (q) { if (c === '"') { if (str[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
      else if (c === '"') q = true;
      else if (c === ',') { row.push(cur); cur = ''; }
      else if (c === '\n') { row.push(cur); rows.push(row); row = []; cur = ''; }
      else if (c !== '\r') cur += c;
    }
    if (cur || row.length) { row.push(cur); rows.push(row); }
    return rows.filter(r => r.length > 1);
  }
  /** Handles Strava's duplicate column names (Distance twice: km then metres; Elapsed Time twice). */
  function parseStravaCsv(bytes) {
    const rows = csvRows(text(bytes)); if (rows.length < 2) throw new Error('empty CSV');
    const head = rows[0].map(h => h.trim());
    const col = (name) => head.map((h, i) => (h === name ? i : -1)).filter(i => i >= 0);
    if (!col('Activity Date').length || !col('Activity Type').length) throw new Error('not a Strava activities.csv');
    const num = (row, name, pickLast) => { const idx = col(name); if (!idx.length) return null; const i = pickLast ? idx.at(-1) : idx[0]; const n = parseFloat(row[i]); return isFinite(n) ? n : null; };
    const str = (row, name) => { const i = col(name)[0]; return i == null ? null : (row[i] || '').trim() || null; };
    return rows.slice(1).map(r => {
      const dists = col('Distance'), d1 = num(r, 'Distance', false), d2 = num(r, 'Distance', true);
      const distanceM = dists.length > 1 ? d2 : d1 == null ? null : d1 < 200 ? d1 * 1000 : d1;      // single column: km in older exports
      return { id: str(r, 'Activity ID'), startTime: Date.parse((str(r, 'Activity Date') || '') + ' UTC'), name: str(r, 'Activity Name'), sport: str(r, 'Activity Type'), gear: str(r, 'Activity Gear'),
        filename: str(r, 'Filename'), distanceM, movingSec: num(r, 'Moving Time', true) ?? num(r, 'Elapsed Time', false), elapsedSec: num(r, 'Elapsed Time', false),
        avgHr: num(r, 'Average Heart Rate', false), maxHr: num(r, 'Max Heart Rate', false), elevGainM: num(r, 'Elevation Gain', false), calories: num(r, 'Calories', false) };
    }).filter(r => r.id && isFinite(r.startTime));
  }

  // ── pipeline ─────────────────────────────────────────────────
  const sameRun = (a, b) => Math.abs(new Date(a.startTime) - new Date(b.startTime)) <= 90000 && Math.abs(a.distanceM - b.distanceM) <= Math.max(50, b.distanceM * 0.03);

  /**
   * Parse files into runs. opts: { existing: [{startTime, distanceM}], maxHr, onProgress }.
   * Returns { runs, skipped:[{name,reason}], failed:[{name,reason}], duplicates, ignored }.
   */
  async function parse(files, opts = {}) {
    const report = { runs: [], skipped: [], failed: [], duplicates: 0, ignored: 0 };
    const entries = await expand(files, report);
    const seenHash = new Set(), known = (opts.existing || []).slice();
    const progress = (done, total, name) => opts.onProgress && opts.onProgress({ done, total, name });

    // activities.csv first: gives names/gear/calories to track files and summary runs for the rest
    let csv = [];
    for (const e of entries.filter(e => base(e.name) === 'activities.csv')) {
      try { csv = csv.concat(parseStravaCsv(await e.read())); } catch (err) { report.failed.push({ name: e.name, reason: err.message }); }
    }
    const csvByFile = new Map(); csv.forEach(r => { if (r.filename) csvByFile.set(base(r.filename.replace(/\.gz$/i, '')), r); });
    const matchedCsv = new Set();

    const tracks = entries.filter(e => ['fit', 'gpx', 'tcx'].includes(ext(e.name)));
    report.ignored = entries.length - tracks.length - entries.filter(e => base(e.name) === 'activities.csv').length;
    const accept = (run, name) => {
      if (seenHash.has(run.fileHash) || known.some(k => sameRun(run, k))) { report.duplicates++; return; }
      seenHash.add(run.fileHash); known.push(run); report.runs.push(run);
    };

    let done = 0;
    for (const e of tracks) {
      progress(done++, tracks.length + 1, e.name); await tick();
      try {
        const bytes = await e.read(), hash = await sha256(bytes), fmt = ext(e.name);
        const { points, meta } = fmt === 'fit' ? await parseFit(bytes) : fmt === 'gpx' ? parseGpx(bytes) : parseTcx(bytes);
        const row = csvByFile.get(base(e.name)); if (row) matchedCsv.add(row.id);
        const r = RP().buildRun(points, { ...meta, name: row?.name || meta.name, gear: row?.gear, calories: row?.calories ?? meta.calories, sport: row?.sport || meta.sport, sourceFormat: fmt, fileHash: hash, maxHr: opts.maxHr });
        if (!r.ok) { report.skipped.push({ name: e.name, reason: r.reason }); continue; }
        accept(r.run, e.name);
      } catch (err) { report.failed.push({ name: e.name, reason: err.message || String(err) }); }
    }

    // CSV rows with no uploaded track file become summary-only runs
    progress(done, tracks.length + 1, 'activities.csv');
    for (const row of csv) {
      if (matchedCsv.has(row.id)) continue;
      if (!RP().isRunSport(row.sport) || !/run/i.test(row.sport || '')) { report.ignored++; continue; }
      const r = RP().buildSummaryRun({ ...row, fileHash: 'csv:' + row.id });
      if (!r.ok) { report.skipped.push({ name: 'activities.csv #' + row.id, reason: r.reason }); continue; }
      accept(r.run, 'activities.csv');
    }
    progress(tracks.length + 1, tracks.length + 1, '');
    return report;
  }

  /** Upload runs in size-capped batches. Demo mode adds to the in-memory seed instead. */
  async function upload(runs) {
    if (G.isDemo()) { G.seed.addRuns(runs); return { imported: runs.length, duplicates: 0 }; }
    let imported = 0, duplicates = 0, batch = [], bytes = 0;
    const flush = async () => {
      if (!batch.length) return;
      const r = await gridFetch('/api/runs/import', { method: 'POST', body: JSON.stringify({ runs: batch }) });
      imported += r.imported; duplicates += r.duplicates; batch = []; bytes = 0;
    };
    for (const run of runs) {
      const size = JSON.stringify(run).length;
      if (batch.length && (bytes + size > BATCH_BYTES || batch.length >= BATCH_RUNS)) await flush();
      batch.push(run); bytes += size;
    }
    await flush();
    return { imported, duplicates };
  }

  /** Parse + upload. Returns the combined report. */
  async function run(files, opts = {}) {
    const rep = await parse(files, opts);
    if (rep.runs.length) {
      try { const up = await upload(rep.runs); rep.imported = up.imported; rep.duplicates += up.duplicates; }
      catch (e) { rep.uploadError = e.message || 'upload failed'; rep.imported = 0; }
    } else rep.imported = 0;
    delete rep.runs;
    return rep;
  }

  G.runImport = { parse, upload, run, unzip, parseGpx, parseTcx, parseFit, parseStravaCsv, csvRows, sameRun };
})();
