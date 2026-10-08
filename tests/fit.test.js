const fs = require('fs'), path = require('path');
const GRID = path.resolve(__dirname, '..');
const FIT = require(GRID + '/js/fuel/fit-decoder.js');
const RP = require(GRID + '/js/fuel/runs-parser.js');
const t = (n, ok, extra) => { console.log(ok ? 'ok  ' : 'FAIL', n, ok ? '' : (extra || '')); if (!ok) process.exitCode = 1; };
const near = (a, b, tol) => a != null && Math.abs(a - b) <= tol;

// ── a small FIT writer, so the awkward cases real watches produce can be built byte by byte ──
const CRC_T = [0x0000, 0xCC01, 0xD801, 0x1400, 0xF001, 0x3C00, 0x2800, 0xE401, 0xA001, 0x6C00, 0x7800, 0xB401, 0x5000, 0x9C01, 0x8801, 0x4400];
const crc16 = (bytes) => { let crc = 0; for (const b of bytes) { let x = CRC_T[crc & 0xf]; crc = (crc >> 4) & 0x0fff; crc ^= x ^ CRC_T[b & 0xf]; x = CRC_T[crc & 0xf]; crc = (crc >> 4) & 0x0fff; crc ^= x ^ CRC_T[(b >> 4) & 0xf]; } return crc; };
const TYPES = { enum: [0x00, 1], sint8: [0x01, 1], uint8: [0x02, 1], sint16: [0x83, 2], uint16: [0x84, 2], sint32: [0x85, 4], uint32: [0x86, 4], uint8z: [0x0a, 1] };
function put(type, v, le) { const [, size] = TYPES[type]; const b = Buffer.alloc(size); const n = TYPES[type][0] & 0x1f;
  if (n === 1) b.writeInt8(v); else if (n === 0 || n === 2 || n === 10) b.writeUInt8(v);
  else if (n === 3) le ? b.writeInt16LE(v) : b.writeInt16BE(v); else if (n === 4 || n === 11) le ? b.writeUInt16LE(v) : b.writeUInt16BE(v);
  else if (n === 5) le ? b.writeInt32LE(v) : b.writeInt32BE(v); else if (n === 6) le ? b.writeUInt32LE(v) : b.writeUInt32BE(v);
  return b; }
/** def: { local, gmn, fields:[[num, type]], dev:[[num, size]], be } */
const defMsg = (d) => { const le = !d.be, u16 = Buffer.alloc(2); le ? u16.writeUInt16LE(d.gmn) : u16.writeUInt16BE(d.gmn);
  const parts = [Buffer.from([0x40 | (d.dev ? 0x20 : 0) | d.local, 0, d.be ? 1 : 0]), u16, Buffer.from([d.fields.length])];
  d.fields.forEach(([num, type]) => parts.push(Buffer.from([num, TYPES[type][1], TYPES[type][0]])));
  if (d.dev) { parts.push(Buffer.from([d.dev.length])); d.dev.forEach(([num, size]) => parts.push(Buffer.from([num, size, 0]))); }
  return Buffer.concat(parts); };
const dataMsg = (d, vals, devBytes, header) => { const le = !d.be; const parts = [Buffer.from([header != null ? header : d.local])];
  d.fields.forEach(([, type], i) => parts.push(put(type, vals[i], le)));
  if (devBytes) parts.push(Buffer.from(devBytes)); return Buffer.concat(parts); };
const fitFile = (body, { hsize = 14, crc = true } = {}) => { const h = Buffer.alloc(hsize); h[0] = hsize; h[1] = 0x20; h.writeUInt16LE(2140, 2); h.writeUInt32LE(body.length, 4); h.write('.FIT', 8, 'ascii');
  const head = hsize === 14 ? Buffer.concat([h.subarray(0, 12), Buffer.alloc(2)]) : h; const all = Buffer.concat([head, body]); const c = Buffer.alloc(2); if (crc) c.writeUInt16LE(crc16(all)); return new Uint8Array(Buffer.concat([all, c])); };

const FIT_EPOCH = 631065600, T0 = 1788310800000 / 1000 - FIT_EPOCH;      // 2026-09-02T01:00:00Z in FIT seconds
const SC = 2 ** 31 / 180, DEG = 111195;
const RECORD = (local = 0, be = false) => ({ local, gmn: 20, be, fields: [[253, 'uint32'], [0, 'sint32'], [1, 'sint32'], [2, 'uint16'], [3, 'uint8'], [4, 'uint8'], [5, 'uint32'], [6, 'uint16']] });
const rec = (d, i, o = {}) => dataMsg(d, [T0 + i, Math.round((12.97 + (i * 3.3) / DEG) * SC), Math.round(77.59 * SC), (900 + 500) * 5, o.hr ?? 150, 84, Math.round(i * 3.3 * 100), 3300]);
const SESSION = { local: 1, gmn: 18, fields: [[253, 'uint32'], [2, 'uint32'], [5, 'enum'], [11, 'uint16']] };
const session = (sport, kcal = 55) => dataMsg(SESSION, [T0 + 300, T0, sport, kcal]);
const run = (body, opts) => FIT.toRun(FIT.decode(fitFile(Buffer.concat(body), opts)));

// 1. the real fixture, written by Garmin's own encoder
const real = new Uint8Array(fs.readFileSync(path.join(__dirname, 'fixtures', 'garmin-run.fit')));
let d = FIT.decode(real), r = FIT.toRun(d);
t('1 real Garmin-encoded file: 181 records, no warnings', d.records.length === 181 && d.warnings.length === 0, JSON.stringify(d.warnings));
t('1 timestamps are right (2026-09-02T01:00:00Z, 3 minutes)', r.points[0].t === 1788310800000 && r.points.at(-1).t === 1788310980000);
t('1 position in degrees', near(r.points[0].lat, 12.97, 1e-6) && near(r.points[0].lon, 77.59, 1e-6));
t('1 distance 600 m, heart rate, cadence', near(r.points.at(-1).dist, 600, 0.01) && r.points[0].hr === 150 && r.points[14].hr === 164 && r.points[0].cad === 84);
t('1 altitude from enhanced_altitude', near(r.points[0].ele, 900, 0.2));
t('1 sport and calories', r.meta.sport === 'running' && r.meta.calories === 42);
let built = RP.buildRun(r.points, { ...r.meta, sourceFormat: 'fit', fileHash: 'x' });
t('1 becomes a 0.60 km run, 3:00 moving, avg 157 bpm, 168 spm', built.ok && built.run.distanceM === 600 && built.run.movingSec === 180 && built.run.avgHr === 157 && built.run.cadence === 168, JSON.stringify(built.run && [built.run.distanceM, built.run.movingSec, built.run.avgHr, built.run.cadence]));

// 2. hand-built: definition, records, session
const D = RECORD(); let body = [defMsg(D)]; for (let i = 0; i < 120; i++) body.push(rec(D, i)); body.push(defMsg(SESSION), session(1));
r = run(body);
t('2 hand-built file reads 120 points', r.points.length === 120 && r.meta.sport === 'running' && r.meta.calories === 55);
t('2 12-byte header and a bad CRC are fine', run(body, { hsize: 12, crc: false }).points.length === 120);

// 3. compressed timestamp headers (a 5-bit time offset instead of a full timestamp), including a wrap past 32 s
const DC = { local: 0, gmn: 20, fields: [[0, 'sint32'], [1, 'sint32'], [5, 'uint32'], [6, 'uint16']] };
const full = RECORD(1); body = [defMsg(full), rec(full, 0), defMsg(DC)];
let secs = 0; for (let i = 1; i <= 70; i++) { secs = i; body.push(dataMsg(DC, [Math.round((12.97 + (i * 3.3) / DEG) * SC), Math.round(77.59 * SC), Math.round(i * 330), 3300], null, 0x80 | (0 << 5) | ((T0 + secs) & 0x1f))); }
r = run(body);
t('3 compressed timestamps: 71 points, one second apart across the 32 s wrap', r.points.length === 71 && r.points.every((p, i) => p.t === (T0 + i + FIT_EPOCH) * 1000), r.points.slice(28, 36).map(p => (p.t / 1000 - FIT_EPOCH - T0)).join());

// 4. big-endian definitions
const DB = RECORD(0, true); body = [defMsg(DB)]; for (let i = 0; i < 30; i++) body.push(rec(DB, i));
r = run(body); t('4 big-endian records read correctly', r.points.length === 30 && near(r.points[5].lat, 12.97 + 16.5 / DEG, 1e-6) && near(r.points[5].dist, 16.5, 0.01) && r.points[5].t === (T0 + 5 + FIT_EPOCH) * 1000);

// 5. developer fields (Stryd, Running Dynamics): extra bytes after the normal fields must be skipped by size
const DD = { ...RECORD(), dev: [[0, 2], [1, 4]] }; body = [defMsg(DD)]; for (let i = 0; i < 40; i++) body.push(dataMsg(DD, [T0 + i, Math.round(12.97 * SC), Math.round(77.59 * SC), 7000, 151 + (i % 3), 85, i * 100, 3000], [0xaa, 0xbb, 1, 2, 3, 4]));
r = run(body); t('5 developer fields skipped, later values still right', r.points.length === 40 && r.points[39].hr === 151 && near(r.points[39].dist, 39, 0.01) && r.points[39].cad === 85);

// 6. invalid-value markers become "no value"; (0,0) is "no GPS fix"
const DI = { local: 0, gmn: 20, fields: [[253, 'uint32'], [0, 'sint32'], [1, 'sint32'], [3, 'uint8'], [2, 'uint16'], [5, 'uint32']] };
body = [defMsg(DI), dataMsg(DI, [T0, 0x7fffffff, 0x7fffffff, 0xff, 0xffff, 0xffffffff]), dataMsg(DI, [T0 + 1, 0, 0, 0xff, 0xffff, 0xffffffff]), dataMsg(DI, [T0 + 2, Math.round(12.9 * SC), Math.round(77.5 * SC), 140, 7000, 500])];
r = run(body);
t('6 invalid markers: position, hr, altitude, distance are all absent', r.points[0].lat === undefined && r.points[0].hr === undefined && r.points[0].ele === undefined && r.points[0].dist === undefined);
t('6 position (0, 0) treated as no fix', r.points[1].lat === undefined);
t('6 a good point after bad ones is read in full', near(r.points[2].lat, 12.9, 1e-6) && r.points[2].hr === 140 && near(r.points[2].dist, 5, 0.001));

// 7. enhanced altitude/speed win over the 16-bit versions; speed-only treadmill file gets a distance
const DE = { local: 0, gmn: 20, fields: [[253, 'uint32'], [2, 'uint16'], [78, 'uint32'], [73, 'uint32']] };
r = run([defMsg(DE), dataMsg(DE, [T0, 7000, (900 + 500) * 5 + 50, 3000])]); t('7 enhanced_altitude preferred (910 m)', near(r.points[0].ele, 910, 0.01), r.points[0].ele);
const DS = { local: 0, gmn: 20, fields: [[253, 'uint32'], [73, 'uint32'], [3, 'uint8']] };
body = [defMsg(DS)]; for (let i = 0; i < 400; i++) body.push(dataMsg(DS, [T0 + i, 3000, 150]));
r = run(body); built = RP.buildRun(r.points, { ...r.meta, sourceFormat: 'fit', fileHash: 'y' });
t('7 treadmill (no GPS, no distance, only speed): distance added up to ~1.2 km', built.ok && near(built.run.distanceM, 1197, 5), JSON.stringify(built.ok ? built.run.distanceM : built.reason));

// 8. unknown messages and other message types in between are skipped by size
const DU = { local: 2, gmn: 9999, fields: [[0, 'uint32'], [1, 'uint16'], [2, 'uint8']] };
body = [defMsg(D), defMsg(DU), dataMsg(DU, [1, 2, 3], null), rec(D, 0), dataMsg(DU, [4, 5, 6]), rec(D, 1), dataMsg(DU, [7, 8, 9]), rec(D, 2)];
t('8 unknown messages skipped, 3 records read', run(body).points.length === 3);

// 9. local message numbers reused with a new definition mid-file
const DR2 = { local: 0, gmn: 20, fields: [[253, 'uint32'], [3, 'uint8']] };
body = [defMsg(D), rec(D, 0), rec(D, 1), defMsg(DR2), dataMsg(DR2, [T0 + 2, 133]), dataMsg(DR2, [T0 + 3, 134]), defMsg(D), rec(D, 4)];
r = run(body); t('9 redefined local type: 5 points, hr 133/134 from the short definition', r.points.length === 5 && r.points[2].hr === 133 && r.points[3].hr === 134 && r.points[4].hr === 150);

// 10. two FIT files chained together; garbage after the last one is ignored
const one = (n) => fitFile(Buffer.concat([defMsg(D), ...Array.from({ length: n }, (_, i) => rec(D, i)), defMsg(SESSION), session(1)]));
const chained = new Uint8Array([...one(10), ...one(20), 0, 0, 0, 0, 0, 0]);
t('10 chained files: both read (30 records)', FIT.decode(chained).records.length === 30);

// 11. a file cut short keeps what was read; nothing that isn't FIT is accepted
const whole = one(50), cut = whole.slice(0, Math.floor(whole.length * 0.6));
d = FIT.decode(cut); t('11 truncated file: partial records kept, warning given', d.records.length > 10 && d.records.length < 50 && d.warnings.length > 0, d.records.length + ' ' + d.warnings);
let msg = ''; try { FIT.decode(new Uint8Array(Buffer.from('this is not a FIT file at all, just text'.repeat(5)))); } catch (e) { msg = e.message; }
t('11 text file rejected with a plain message', /not a FIT file/.test(msg), msg);
msg = ''; try { FIT.decode(new Uint8Array(3)); } catch (e) { msg = e.message; }
t('11 tiny file rejected', /not a FIT file/.test(msg), msg);
t('11 zero-length data size in header: reads to the end of the file', (() => { const f = Buffer.from(one(5)); f.writeUInt32LE(0, 4); return FIT.decode(new Uint8Array(f)).records.length === 5; })());

// 12. sports: a ride is not a run, a multisport file uses its run, "generic" is left to the run builder
const DS2 = (sport) => [defMsg(D), ...Array.from({ length: 100 }, (_, i) => rec(D, i)), defMsg(SESSION), session(sport)];
r = run(DS2(2)); t('12 cycling session -> sport "cycling", rejected as not a run', r.meta.sport === 'cycling' && RP.buildRun(r.points, r.meta).reason.includes('not a run'));
r = run([...DS2(5).slice(0, 101), defMsg(SESSION), session(5), session(2), session(1, 77)].filter(Boolean)); t('12 triathlon-style file with swim, bike, run sessions -> uses the run', r.meta.sport === 'running' && r.meta.calories === 77, JSON.stringify(r.meta));
r = run(DS2(0)); t('12 generic sport is treated as unknown and accepted', r.meta.sport === null && RP.buildRun(r.points, r.meta).ok);
r = run(DS2(1)); t('12 100-point run builds', RP.buildRun(r.points, r.meta).ok);

// 13. a FIT with no records (settings, monitoring files) gives a clear "nothing to read"
d = FIT.decode(fitFile(Buffer.concat([defMsg(SESSION), session(1)]))); r = FIT.toRun(d);
t('13 no records -> empty points, so the run builder says "no usable track points"', r.points.length === 0 && RP.buildRun(r.points, r.meta).reason === 'no usable track points');

// 14. speed: a 10,000-point file decodes fast
body = [defMsg(D)]; for (let i = 0; i < 10000; i++) body.push(rec(D, i)); const big = fitFile(Buffer.concat(body)); const t0 = Date.now(); const n = FIT.decode(big).records.length;
t('14 10,000 records in under 200 ms', n === 10000 && Date.now() - t0 < 200, Date.now() - t0 + ' ms');

// 15. Strava's own FIT export: each second is TWO record messages (distance in one, position/altitude/speed in the other),
//     and the distance only changes every other second. Read as separate points this gave "distance under 100 m".
const DA = { local: 0, gmn: 20, fields: [[253, 'uint32'], [5, 'uint32']] };
const DP = { local: 1, gmn: 20, fields: [[253, 'uint32'], [0, 'sint32'], [1, 'sint32'], [2, 'uint16'], [6, 'uint16']] };
body = [defMsg(DA), defMsg(DP)];
for (let i = 0; i < 400; i++) { const dEven = Math.floor(i / 2) * 2 * 3.333; body.push(dataMsg(DA, [T0 + i, Math.round(dEven * 100)]), dataMsg(DP, [T0 + i, Math.round((12.97 + (i * 3.333) / DEG) * SC), Math.round(77.59 * SC), (900 + 500) * 5, 3333]));
}
d = FIT.decode(fitFile(Buffer.concat(body))); r = FIT.toRun(d);
t('15 800 records at 400 timestamps merge into 400 points, each with distance AND position', d.records.length === 800 && r.points.length === 400 && r.points.every(p => p.dist != null && p.lat != null));
built = RP.buildRun(r.points, { ...r.meta, sourceFormat: 'fit', fileHash: 'z' });
t('15 builds a run of ~1.33 km (not "under 100 m")', built.ok && near(built.run.distanceM, 1327, 8), JSON.stringify(built.ok ? built.run.distanceM : built.reason));
t('15 a steady run is moving the whole time (399 s of 399 s), pace 5:00/km', built.ok && near(built.run.movingSec, 399, 4) && near(built.run.movingSec / (built.run.distanceM / 1000), 300, 6), built.ok && built.run.movingSec);

// 16. a placeholder speed (e.g. 64.5 m/s) is not used to invent distance on a file with no distance field
const DX = { local: 0, gmn: 20, fields: [[253, 'uint32'], [73, 'uint32']] };
body = [defMsg(DX)]; for (let i = 0; i < 60; i++) body.push(dataMsg(DX, [T0 + i, i % 2 ? 64540 : 3000]));
r = run(body); t('16 speeds over 25 m/s ignored', r.points.every(p => p.dist != null) && r.points.at(-1).dist < 100, r.points.at(-1).dist);
