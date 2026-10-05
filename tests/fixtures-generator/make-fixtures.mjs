// Generates realistic-ish Strava-style export fixtures (FIT, GPX, TCX, .gz, CSV) into fixtures/.
// Ground truth is printed so the importer tests can assert against it.
import fs from 'node:fs'; import zlib from 'node:zlib';
import { Encoder, Profile } from '@garmin/fitsdk';
fs.mkdirSync('fixtures/activities', { recursive: true });
const SC = 2 ** 31 / 180, DEG = 111195;
function track(startISO, km, paceSec, hr, cad, lat0 = 12.97, lon0 = 77.59) {
  const pts = []; const v = 1000 / paceSec, n = Math.round(km * 1000 / v); let d = 0; const t0 = Date.parse(startISO);
  for (let i = 0; i <= n; i++) { d = i * v; const a = d / 800; pts.push({ t: t0 + i * 1000, lat: lat0 + Math.sin(a) * 0.004 + d / DEG * 0.3, lon: lon0 + d / DEG * 0.9 + Math.cos(a) * 0.002, ele: 900 + Math.sin(d / 400) * 6 + d * 0.004, hr: Math.round(hr + Math.sin(i / 50) * 4), cad, dist: d }); }
  return pts;
}
const truth = {};
function fit(file, startISO, km, pace, hr, sport = 'running') {
  const enc = new Encoder(); const pts = track(startISO, km, pace, hr, 84);
  enc.onMesg(Profile.MesgNum.FILE_ID, { type: 'activity', manufacturer: 'development', product: 1, timeCreated: new Date(startISO), serialNumber: 1 });
  for (const p of pts) enc.onMesg(Profile.MesgNum.RECORD, { timestamp: new Date(p.t), positionLat: Math.round(p.lat * SC), positionLong: Math.round(p.lon * SC), altitude: p.ele, heartRate: p.hr, cadence: p.cad, distance: p.dist, speed: 1000 / pace });
  enc.onMesg(Profile.MesgNum.SESSION, { timestamp: new Date(pts.at(-1).t), startTime: new Date(startISO), sport, totalElapsedTime: pts.length - 1, totalTimerTime: pts.length - 1, totalDistance: pts.at(-1).dist, totalCalories: Math.round(km * 66) });
  fs.writeFileSync(file, Buffer.from(enc.close()));
  truth[file] = { km, pace, hr, startISO };
}
function gpx(file, startISO, km, pace, hr, type = 'running') {
  const pts = track(startISO, km, pace, hr, 170);
  fs.writeFileSync(file, `<?xml version="1.0" encoding="UTF-8"?><gpx creator="Strava" xmlns="http://www.topografix.com/GPX/1/1" xmlns:gpxtpx="http://www.garmin.com/xmlschemas/TrackPointExtension/v1"><metadata><time>${startISO}</time></metadata><trk><name>GPX Run</name><type>${type}</type><trkseg>${pts.map(p => `<trkpt lat="${p.lat.toFixed(6)}" lon="${p.lon.toFixed(6)}"><ele>${p.ele.toFixed(1)}</ele><time>${new Date(p.t).toISOString()}</time><extensions><gpxtpx:TrackPointExtension><gpxtpx:hr>${p.hr}</gpxtpx:hr><gpxtpx:cad>${p.cad}</gpxtpx:cad></gpxtpx:TrackPointExtension></extensions></trkpt>`).join('')}</trkseg></trk></gpx>`);
  truth[file] = { km, pace, hr, startISO, type };
}
function tcx(file, startISO, km, pace, hr) {
  const pts = track(startISO, km, pace, hr, 86);
  fs.writeFileSync(file, `<?xml version="1.0"?><TrainingCenterDatabase xmlns="http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2"><Activities><Activity Sport="Running"><Id>${startISO}</Id><Lap StartTime="${startISO}"><Track>${pts.map(p => `<Trackpoint><Time>${new Date(p.t).toISOString()}</Time><Position><LatitudeDegrees>${p.lat.toFixed(6)}</LatitudeDegrees><LongitudeDegrees>${p.lon.toFixed(6)}</LongitudeDegrees></Position><AltitudeMeters>${p.ele.toFixed(1)}</AltitudeMeters><DistanceMeters>${p.dist.toFixed(1)}</DistanceMeters><HeartRateBpm><Value>${p.hr}</Value></HeartRateBpm><Cadence>${p.cad}</Cadence></Trackpoint>`).join('')}</Track></Lap></Activity></Activities></TrainingCenterDatabase>`);
  truth[file] = { km, pace, hr, startISO };
}
fit('fixtures/run_5k.fit', '2026-09-02T01:00:00Z', 5.0, 330, 155);
fs.copyFileSync('fixtures/run_5k.fit', 'fixtures/run_5k_copy.fit');                       // identical bytes: must dedupe
fs.writeFileSync('fixtures/run_5k.fit.gz', zlib.gzipSync(fs.readFileSync('fixtures/run_5k.fit')));   // same run, gzipped: must dedupe vs the .fit
gpx('fixtures/run_10k.gpx', '2026-09-04T01:10:00Z', 10.0, 315, 162);
tcx('fixtures/run_8k.tcx', '2026-09-06T01:20:00Z', 8.0, 340, 150);
gpx('fixtures/ride.gpx', '2026-09-07T01:00:00Z', 20.0, 120, 140, 'cycling');             // not a run
fit('fixtures/ride.fit', '2026-09-08T01:00:00Z', 15.0, 130, 135, 'cycling');             // not a run
fs.writeFileSync('fixtures/corrupt.fit', Buffer.from('this is not a fit file at all'.repeat(20)));
fs.writeFileSync('fixtures/notes.txt', 'ignore me');
// zip members: a Strava-style bulk export
fit('fixtures/activities/9001.fit', '2026-09-10T01:00:00Z', 6.0, 325, 158);
fs.writeFileSync('fixtures/activities/9001.fit.gz', zlib.gzipSync(fs.readFileSync('fixtures/activities/9001.fit'))); fs.unlinkSync('fixtures/activities/9001.fit');
gpx('fixtures/activities/9002.gpx', '2026-09-12T01:00:00Z', 4.0, 335, 150);
const head = 'Activity ID,Activity Date,Activity Name,Activity Type,Activity Description,Elapsed Time,Distance,Max Heart Rate,Relative Effort,Commute,Activity Private Note,Activity Gear,Filename,Athlete Weight,Bike Weight,Elapsed Time,Moving Time,Distance,Max Speed,Average Speed,Elevation Gain,Elevation Loss,Average Heart Rate,Calories';
const rows = [
  '9001,"Sep 10, 2026, 1:00:00 AM","Morning Easy, with coffee",Run,,1950,6.0,172,40,false,,Pegasus 40,activities/9001.fit.gz,72,,1950,1950,6000.0,4.0,3.07,28.0,28.0,158,396',     // matches the .fit.gz file
  '9002,"Sep 12, 2026, 1:00:00 AM",Tempo,Run,,1340,4.0,168,30,false,,Vomero 17,activities/9002.gpx,72,,1340,1340,4000.0,3.9,2.98,15.0,15.0,150,264',
  '9003,"Sep 14, 2026, 1:30:00 AM",Summary Only Run,Run,,2400,7.5,170,55,false,,Pegasus 40,,72,,2400,2350,7500.0,4.1,3.19,40.0,40.0,157,495',     // no file: summary run
  '9004,"Sep 15, 2026, 1:00:00 AM",Evening Ride,Ride,,3600,25.0,150,20,false,,,,72,,3600,3500,25000.0,10,7.1,100.0,100.0,130,600',                 // ride: ignored
  '9005,"Sep 16, 2026, 1:00:00 AM",Trail Run,Trail Run,,3000,6.0,175,60,false,,,,72,,3000,2900,6000.0,4,2.07,310.0,300.0,160,500',                  // trail run: summary
];
fs.writeFileSync('fixtures/activities.csv', [head, ...rows].join('\n') + '\n');
fs.writeFileSync('fixtures/truth.json', JSON.stringify(truth, null, 2));
console.log(Object.keys(truth).length, 'tracks written;', fs.readdirSync('fixtures').length, 'files in fixtures/');
