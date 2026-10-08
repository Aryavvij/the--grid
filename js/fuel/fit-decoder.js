/* Garmin FIT file reader, built in so Runs never depends on a downloaded library.
   Reads the parts a run needs (time, position, altitude, distance, speed, heart rate, cadence, session summary) and
   skips everything else by the sizes in the file's own definitions, so unknown messages and developer fields are safe.
   Handles: 12- and 14-byte headers, compressed timestamp headers, big- and little-endian definitions, developer fields,
   array fields, invalid-value markers, several FIT files chained in one, and files cut short (keeps what was read).
   The CRC is not checked (a bad CRC should not lose a run). Pure functions, no DOM: also loaded by node for tests. */
(function (root) {
  const FIT_EPOCH_S = 631065600;                    // seconds from 1970-01-01 to the FIT epoch 1989-12-31
  const MIN_REAL_TS = 0x10000000;                   // smaller timestamps are device uptime, not dates

  // base type number -> [size in bytes, invalid-value marker (null = none)]
  const BASE = {
    0: [1, 0xff], 1: [1, 0x7f], 2: [1, 0xff], 3: [2, 0x7fff], 4: [2, 0xffff], 5: [4, 0x7fffffff], 6: [4, 0xffffffff],
    7: [1, null], 8: [4, null], 9: [8, null], 10: [1, 0], 11: [2, 0], 12: [4, 0], 13: [1, 0xff], 14: [8, null], 15: [8, null], 16: [8, null],
  };
  function readNum(dv, p, type, le) {
    switch (type) {
      case 0: case 2: case 10: case 13: return dv.getUint8(p);
      case 1: return dv.getInt8(p);
      case 3: return dv.getInt16(p, le);
      case 4: case 11: return dv.getUint16(p, le);
      case 5: return dv.getInt32(p, le);
      case 6: case 12: return dv.getUint32(p, le);
      case 8: { const v = dv.getFloat32(p, le); return isFinite(v) ? v : null; }
      case 9: { const v = dv.getFloat64(p, le); return isFinite(v) ? v : null; }
      default: return null;                          // strings and 64-bit values are not needed here
    }
  }

  // The fields read from each message type: { fieldNumber: key }. Everything else is skipped.
  const WANT = {
    20: { 0: 'lat', 1: 'lon', 2: 'alt', 78: 'ealt', 3: 'hr', 4: 'cad', 5: 'dist', 6: 'spd', 73: 'espd', 7: 'pwr' },       // record
    18: { 2: 'start', 5: 'sport', 6: 'sub', 8: 'timer', 9: 'dist', 11: 'kcal', 16: 'avgHr', 17: 'maxHr' },                  // session
    12: { 0: 'sport', 1: 'sub' },                                                                                           // sport
  };
  const SPORTS = { 0: 'generic', 1: 'running', 2: 'cycling', 3: 'transition', 4: 'fitness_equipment', 5: 'swimming', 10: 'training',
    11: 'walking', 12: 'cross_country_skiing', 13: 'alpine_skiing', 14: 'snowboarding', 15: 'rowing', 16: 'mountaineering', 17: 'hiking', 18: 'multisport' };

  /** Decode one or more FIT files in bytes. Returns { records, sessions, sport, warnings }. Throws if it is not FIT at all. */
  function decode(bytes) {
    if (!bytes || bytes.length < 12) throw new Error('not a FIT file (too small)');
    const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength), len = bytes.length;
    const out = { records: [], sessions: [], sport: null, warnings: [] };
    let pos = 0, files = 0;

    while (pos + 12 <= len) {
      const hsize = bytes[pos];
      const sig = String.fromCharCode(bytes[pos + 8], bytes[pos + 9], bytes[pos + 10], bytes[pos + 11]);
      if ((hsize !== 12 && hsize !== 14) || sig !== '.FIT') {
        if (!files) throw new Error('not a FIT file (bad header)');
        break;                                       // padding after the last file
      }
      files++;
      const dataSize = dv.getUint32(pos + 4, true);
      let end = pos + hsize + dataSize;
      if (dataSize === 0 || end > len) { if (dataSize) out.warnings.push('file ends early'); end = len; }
      try { readMessages(dv, bytes, pos + hsize, end, out); }
      catch (e) { out.warnings.push(String(e.message || e)); break; }
      pos = end + 2;                                 // skip the file CRC
    }
    return out;
  }

  function readMessages(dv, bytes, start, end, out) {
    const defs = new Array(16).fill(null);
    let p = start, lastTs = 0;
    while (p < end) {
      const h = bytes[p++];
      if (h & 0x80) {                                // compressed timestamp header: a data message with a 5-bit time offset
        const def = defs[(h >> 5) & 3];
        if (!def) throw new Error('data before its definition');
        const off = h & 0x1f; let ts = (lastTs & ~0x1f) + off; if (off < (lastTs & 0x1f)) ts += 0x20;
        lastTs = ts;
        if (p + def.size > end) throw new Error('file ends early');
        p = readData(dv, p, def, ts, out, () => {});
      } else if (h & 0x40) {                         // definition message
        const hasDev = !!(h & 0x20);
        if (p + 5 > end) throw new Error('file ends early');
        p++;                                         // reserved
        const le = bytes[p++] === 0, gmn = dv.getUint16(p, le); p += 2;
        const nf = bytes[p++], fields = []; let size = 0, devSize = 0;
        if (p + nf * 3 > end) throw new Error('file ends early');
        for (let i = 0; i < nf; i++) { fields.push({ num: bytes[p], size: bytes[p + 1], type: bytes[p + 2] & 0x1f }); size += bytes[p + 1]; p += 3; }
        if (hasDev) {
          const nd = bytes[p++];
          if (p + nd * 3 > end) throw new Error('file ends early');
          for (let i = 0; i < nd; i++) { devSize += bytes[p + 1]; p += 3; }    // developer fields are skipped by size
        }
        defs[h & 0x0f] = { le, gmn, fields, size: size + devSize, devSize };
      } else {                                       // normal data message
        const def = defs[h & 0x0f];
        if (!def) throw new Error('data before its definition');
        if (p + def.size > end) throw new Error('file ends early');
        p = readData(dv, p, def, null, out, (ts) => { if (ts >= MIN_REAL_TS) lastTs = ts; });
      }
    }
  }

  function readData(dv, p, def, compressedTs, out, seenTs) {
    const want = WANT[def.gmn], m = want ? {} : null;
    if (compressedTs != null && m) m.ts = compressedTs;
    for (const f of def.fields) {
      const base = BASE[f.type];
      if (f.num === 253 && f.size === 4) {            // timestamp, present in nearly every message
        const v = dv.getUint32(p, def.le);
        if (v !== 0xffffffff) { seenTs(v); if (m) m.ts = v; }
      } else if (m && want[f.num] !== undefined && base && f.size >= base[0]) {
        const v = readNum(dv, p, f.type, def.le);
        if (v != null && v !== base[1]) m[want[f.num]] = v;
      }
      p += f.size;
    }
    p += def.devSize;                                // developer fields follow the normal ones
    if (m && def.gmn === 20) out.records.push(m);
    else if (m && def.gmn === 18) out.sessions.push(m);
    else if (m && def.gmn === 12 && !out.sport) out.sport = m;
    return p;
  }

  /** Decoded FIT -> what the run builder takes: { points:[{t,lat,lon,ele,dist,hr,cad}], meta:{sport, calories} }. */
  function toRun(d) {
    const SC = 180 / 2147483648;
    // Some writers (Strava's own FIT export) split one second into several record messages: one with the
    // distance, another with position, altitude and speed. Merge records that share a timestamp into one point.
    const merged = new Map();
    for (const r of d.records) {
      if (r.ts == null || r.ts < MIN_REAL_TS) continue;
      const cur = merged.get(r.ts);
      if (cur) Object.assign(cur, r); else merged.set(r.ts, { ...r });
    }
    const pts = [...merged.values()].map(r => {
      const alt = r.ealt != null ? r.ealt / 5 - 500 : r.alt != null ? r.alt / 5 - 500 : undefined;
      let spd = r.espd != null ? r.espd / 1000 : r.spd != null ? r.spd / 1000 : null;
      if (spd != null && spd > 25) spd = null;                      // faster than any runner: a placeholder value, not a speed
      const hasPos = r.lat != null && r.lon != null && !(r.lat === 0 && r.lon === 0);       // (0, 0) is "no fix", not a place
      return { t: (r.ts + FIT_EPOCH_S) * 1000, lat: hasPos ? r.lat * SC : undefined, lon: hasPos ? r.lon * SC : undefined, ele: alt,
        dist: r.dist != null ? r.dist / 100 : undefined, hr: r.hr, cad: r.cad, spd };
    });
    // Treadmill and some bike-computer files have speed but no distance: add it up.
    if (!pts.some(p => p.dist != null) && pts.some(p => p.spd != null)) {
      let total = 0;
      pts.forEach((p, i) => { if (i) { const dt = (p.t - pts[i - 1].t) / 1000; if (dt > 0 && dt <= 30) total += (pts[i - 1].spd || 0) * dt; } p.dist = total; });
    }
    pts.forEach(p => { delete p.spd; });

    // A multisport file has several sessions: use the run if there is one.
    const name = (n) => (n == null ? null : SPORTS[n] || 'sport_' + n);
    const run = d.sessions.find(s => s.sport === 1) || d.sessions[0] || d.sport || {};
    let sport = name(run.sport); if (sport === 'generic') sport = null;                       // unknown: let the run builder decide
    return { points: pts, meta: { sport, calories: run.kcal || null } };
  }

  const api = { decode, toRun };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else (root.Grid = root.Grid || {}).fit = api;
})(typeof window !== 'undefined' ? window : globalThis);
