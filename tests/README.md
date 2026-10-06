# Tests

Plain node scripts, no framework. From the Grid root:

```bash
node tests/run-all.js        # every suite + a summary
node tests/runparser.test.js # one suite
```

| Suite | What it checks |
|---|---|
| `runparser.test.js` | run metrics from track points: pace, pauses, splits, best efforts, HR zones, elevation, cadence |
| `deficit.test.js` | burn vs eaten, counted-day rules, estimates, cumulative, weekly, weight trend |
| `plan.test.js`, `calc.test.js` | BMR/TDEE/plan maths with hand-calculated answers and safety floors |
| `presets.test.js` | quick-log parser (`S1`, `2x S1`, `S1 dinner`) |
| `gym.test.js` | e1RM, PRs, plateaus, weekly muscle sets, malformed data |
| `route-test.js`, `progress.test.js` | API validation and ownership (stubbed auth and database), including the resume save |
| `resume-pdf.test.js` | resume PDF renderer: bullets, contact links, section mapping, page geometry, escaping |

`fixtures-generator/make-fixtures.mjs` writes realistic FIT / GPX / TCX / CSV / zip files for trying the Runs importer
(`npm i @garmin/fitsdk fit-file-parser` next to it first).
