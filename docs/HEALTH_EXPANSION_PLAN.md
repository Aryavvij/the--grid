# SCOPE CHANGE (2026-10-05): Fitbit / Google Health removed, Metriq merged into Grid

The five health pages (Overview, Heart, Sleep, Activity, Recovery) and the whole Google Health / Fitbit Air sync were **deleted**. Live and daily health data stay in the Google Health app. The Metriq site is retired; its useful parts live inside Grid as **three pages: Runs, Nutrition, Deficit**, plus a **PROGRESS tab on Gym**. Everything below this note that mentions Google Health, sync, tokens, readiness, sleep or Fitbit is historical.

What exists now (all in the Grid repo, built from Grid's own components: `fin-section`, `fin-stat-card`, `page-subtitle`, `form-*`, `modal-*`):
- `js/fuel/` + `css/fuel.css`: Runs (Strava file import, month/year overview, personal bests, run detail), Nutrition (presets with `S1` / `2x S1 dinner` quick-log, custom food, plan editor, trends), Deficit (calories burned vs eaten, weight log, progress photos), Gym PROGRESS tab.
- Calories burned is **typed in by hand** from the Google Health app (Deficit page, "+ LOG BURN"). Days without an entry use the plan's TDEE and are marked ESTIMATED; a toggle switches to typed-in days only.
- Backend: `/api/runs`, `/api/nutrition`, `/api/progress` (weight, burn, photos). Burn is stored in the existing `health_daily.calories_total` column (`source = manual`). The Google routes, token storage, cron and env vars were removed.
- Unused empty tables left in the database (not dropped): `health_sleep`, `health_tokens`, and most `health_daily` columns.
- Tests: `spikes/final-tests/` (8 suites, 179 checks).

---

## Update (2026-10-06): pages built out
- **Runs:** first-run guide (how to get a Strava archive or single files), edit name and gear (`PUT /api/runs/:id`), compare a run with a similar one (pace overlay + diff table), CSV export.
- **Nutrition:** works before any plan exists (banner to set one up), one-click 10 starter presets, edit any diary entry (quantity rescales the numbers; `PUT /api/nutrition/log/:id`), copy previous day, CSV export.
- **Deficit:** "Get started" checklist (plan, food, burn, weight, photo), CSV export.
- Docs now live in `Grid/docs`, tests in `Grid/tests` (`node tests/run-all.js`, 189 checks). The Metriq `grid-health` site was deleted.

# GRID Health Expansion: Phased Build Plan

Personal-use only. Data source: Fitbit Air via Google Health, Strava run files (manual upload), existing Gym module, new Nutrition module.

## What exists today (from the Grid repo)
- Frontend: one ~11,200-line vanilla-JS SPA (`index.html`), views are `<div id="page-*">`, carbon-green design tokens (`--bg #080808`, `--green #76b372`, Space Mono, 220px sidebar, 56px topbar).
- Backend: Express + Prisma + Supabase Postgres, deployed on Vercel. JWT cookie auth, zod `validate(schema)` on every input route, helmet and rate limits.
- Gym: `GymSplit` and `GymLog` models, `/api/gym` routes, page `page-workout` with three tabs (Weekly Split, Muscle Growth, Overview & Log).
- Known hazard: **dual storage fork** (auth mode hits the API, demo mode uses localStorage). Every data feature must work on both paths.

## New pages (8 total, added to the sidebar under a HEALTH group)
| # | Page | Source |
|---|---|---|
| 1 | Overview (main dashboard) | All sources |
| 2 | Heart & Vitals | Google Health |
| 3 | Sleep | Google Health |
| 4 | Activity & Load | Google Health |
| 5 | Recovery & Insights | Google Health (+ derived) |
| 6 | Runs | Strava file uploads |
| 7 | Gym | Existing, extended |
| 8 | Nutrition | New, with meal presets |

## New data models (Prisma)
- `HealthDaily`: one row per user per date; resting HR, HRV, SpO2, skin temp, breathing rate, steps, distance, calories, cardio load, AZM, sedentary minutes, readiness (nullable), `source`.
- `HealthSleep`: per sleep session; start, end, stage minutes (awake, light, deep, REM), score, sleeping HR, efficiency.
- `HealthIntraday` (optional, phase 3b): heart rate samples and hourly steps, or stored as JSON on `HealthDaily` to start.
- `HealthToken`: encrypted refresh token, expiry, last sync status.
- `RunActivity`: date, start time, distance, moving time, elapsed time, avg and max HR, cadence, elevation gain, calories, gear, `fileHash` (unique, for duplicate detection), `splits` JSON, `hrZones` JSON, `route` (simplified polyline), `source` file type.
- `MealPreset`: `code` (unique per user, e.g. `S1`), name, calories, protein, carbs, fat, default serving, color.
- `FoodLog`: date, meal slot, name, calories, protein, carbs, fat, qty, `presetId` (nullable), `confidence`.
- `WaterLog` and `NutritionTargets` (calories, macros, water).
- Gym: reuse `GymLog`; add an optional computed `PersonalRecord` table or compute on read (decide in phase 5).

## Phases

### Phase 0: Demo UI in Stitch (now)
**Build:** the Stitch prompt (`STITCH_PROMPT_GRID_HEALTH.md`), a clickable 8-page demo with mock data.
**Exit gate:** you've reviewed every page and told me what to cut, add or move. The finalized screens become the spec for all later phases.

### Phase 1: De-risk spikes (about half a day each)
**Build (throwaway scripts, no UI):**
1. **Google Health access.** Create the Google Cloud project, personal OAuth consent, store a refresh token. Confirm the current API (the legacy Fitbit Web API is being replaced), which scopes the Fitbit Air exposes, and whether refresh tokens survive past 7 days (unverified apps in testing mode can expire them).
2. **Metric coverage matrix.** For each metric you listed, record: available via API, field name, daily or intraday. Likely gaps to check: Cardio Load, Readiness Score, Target Cardio Load, Skin Temp variation, AFib notifications. Anything not exposed gets either dropped or derived locally.
3. **Run file parsing.** Parse 5 real exports (.fit, .gpx, .tcx) plus `activities.csv`; confirm which metrics each format actually carries (cadence, HR, splits, elevation).
**Exit gate:** a written matrix of what we can show and from where. The UI gets adjusted to match reality before we build it.

**Phase 1 status (2026-10-05): research done, scripts built, waiting on you for Spike 1 and Spike 3 inputs.** Scripts and steps are in `spikes/` (see `spikes/README.md`).

**Findings so far (from Google's docs):**
- The legacy Fitbit Web API support ended 2026-09-30, with full shutdown 2026-10-30. **Build on the Google Health API v4 only** (`health.googleapis.com/v4`, Google OAuth 2.0). Tokens do not carry over.
- The Google Health API aggregates device data, and the Fitbit Air syncs to the Google Health app first (about every 15 minutes while the app is open), so the website sees data only after the phone syncs.
- **Available:** heart rate, resting HR, HRV (sample and daily), SpO2, respiratory rate, skin temp (sleep derivations, sensors in beta), sleep sessions with stages, steps, distance, Active Zone Minutes, sedentary periods, calories, time in HR zone, exercise sessions, irregular rhythm notifications (separate scope), VO2 max, nutrition and hydration logs.
- **Not documented as available:** Cardio Load, Readiness Score, Target Cardio Load, and a Sleep Score (only a sleep-efficiency figure is mentioned). Plan: derive them ourselves (readiness from HRV vs baseline, resting HR vs baseline and sleep; load from time in HR zones), clearly labelled "GRID-calculated", unless the probe finds them.
- **Scopes are "restricted".** Fine for one user, but the app will be an unverified app with a warning screen. Refresh tokens expire after 7 days in Testing status, and after about 6 months of non-use in Production, so plan to publish to Production (unverified) for personal use.
- Run parser tested on synthetic GPX, TCX and CSV (parsing and duplicate detection work). Real `.fit` files are not yet tested.

### Phase 2: Foundation
**Build:**
- Prisma migration for the new models; `/api/health`, `/api/runs`, `/api/nutrition` route stubs with zod validation.
- Sidebar HEALTH group in `index.html` and one empty `<div id="page-*">` mount point per new page. This is the only new markup in `index.html`.
- **New pages live in separate script files**, loaded with plain `<script defer>` tags (no build step), so `index.html` stops growing:
  ```
  js/health/
    core.js          shared: api client, demo/auth storage switch, router hook, date and range state
    charts.js        shared: stat tile, sparkline, ring, line/bar/stacked charts, heatmap, hypnogram
    overview.js      page-overview
    heart.js         page-heart
    sleep.js         page-sleep
    activity.js      page-activity
    recovery.js      page-recovery
    runs.js          page-runs (+ runs-parser.js for FIT/GPX/TCX/CSV)
    nutrition.js     page-nutrition (+ presets.js for the quick-log parser)
    seed-demo.js     mock data for demo mode
  css/health.css     styles for all new pages, using the existing --carbon/--green tokens
  ```
  Each file registers itself through one function (`Grid.registerPage('heart', { mount, render })`) so the router in `index.html` stays tiny. The existing gym page stays in `index.html` for now; moving it out is optional and only after Phase 5 passes.
- Update `vercel.json` if needed so `/js/*` and `/css/*` are served as static files before the catch-all route.
- Demo-mode seed data for every new page (in `seed-demo.js`), so both storage paths work from day one.
**Exit gate:** all 8 pages navigate, render seeded mock data in demo mode, `index.html` grew by less than about 100 lines, and the migration runs clean on Supabase.

**Phase 2 status (2026-10-05): built on branch `health-expansion` in the Grid repo, uncommitted. Not yet applied to Supabase.**
- Done: 8 new Prisma models and an additions-only migration (`20261005120000_health_runs_nutrition`, NOT applied); `/api/health`, `/api/runs`, `/api/nutrition` with zod validation (18 route checks pass against a stubbed DB); sidebar group, 7 page mounts, `navigate()` hook (+55 lines in `index.html`); `js/health/*` (12 files) and `css/health.css`; `vercel.json` now serves `js/` and `css/`.
- Charts reuse Grid's existing ECharts `ethos` theme, `bkArea`/`bkBar`, `gridGauge` and `gridRingChart`, so `charts.js` only adds tiles, sparklines, baseline-band lines, stacked bars and heatmaps.
- The existing Gym page is unchanged. The Overview page links to it.
- Pure logic tested in node: `calc.js` (BMR, readiness, sleep score, load ratio) and `presets.js` (quick-log parser: `S1`, `2x S1`, `S1 x2`, `S1 dinner`): see `spikes/phase2-tests/`.
- Browser check (demo mode): all 7 pages render with charts and no thrown errors; quick-log `2x s1 dinner` logs 420 kcal and updates the rings.
- Still to do for the exit gate: apply the migration to Supabase (`npm run db:deploy` in `grid-backend/`, your call), and test the pages in login mode once data exists.
- Known gaps (by design, later phases): run importer UI (Phase 4), preset create/edit UI and AI-free plan editor (Phase 6), Gym extensions (Phase 5), Google sync (Phase 3).


### Phase 3: Google Health sync and the four health pages
**3a. Ingest:** server-side sync job (Vercel cron daily plus a manual "Sync now" button), token refresh with rotation saved on every call, backfill of the last 90 days, sync status and error banner.
**3b. Pages:**
- **Heart & Vitals:** resting HR trend, 24h HR curve, HRV trend with personal baseline band, SpO2, skin temp variation, breathing rate, HR zone minutes, high/low and irregular-rhythm notification log.
- **Sleep:** last night score, stage timeline (hypnogram), stage percentages, duration vs goal, sleeping HR dip, consistency (bed/wake times), 30-day trends.
- **Activity & Load:** steps, distance, calories (BMR and active), cardio load vs target range, Active Zone Minutes, sedentary hours, auto-detected exercise list.
- **Recovery & Insights:** readiness gauge, contributing factors, target cardio load, multi-week baseline bands (SpO2, RHR, HRV, temp) with out-of-range flags.
**Exit gate:** 7 consecutive days of real data syncing with no manual intervention, and every chart matches the Google Health app within rounding.

**Phase 3 status (2026-10-05): sync code built and tested against fixtures; NOT yet run against a real Google account.** Branch `health-sync` in the Grid repo (local commit, not pushed).
- Done: AES-256-GCM token storage; OAuth connect/callback with a signed 10-minute `state` (a normal login JWT is rejected as state); daily Vercel cron (`30 1 * * *` UTC = 07:00 IST) guarded by `CRON_SECRET`; `POST /api/health/sync` (Sync now); `DELETE /api/health/google`; refresh-token rotation; `invalid_grant` shows RECONNECT; each metric fails independently (status `partial`); GRID-derived readiness, cardio load and sleep score (`healthCalc.js`, a copy of `js/health/calc.js`); frontend CONNECT / SYNC NOW button with last-sync time.
- Tests: 28 sync checks + 11 OAuth/cron route checks, all passing (`spikes/phase3-tests/`).
- **Unverified until Phase 1 completes:** exact payload shapes. Field names come from Google's published proto; the list-endpoint filter syntax and the Active Zone Minutes rollup field names are undocumented, so the code lists data and filters by date in code, and matches zone names by pattern. Fix any mismatch from `spikes/google-health/raw/*.json`, not by rewriting.
- To go live: set `GH_CLIENT_ID`, `GH_CLIENT_SECRET`, `GH_REDIRECT_URI`, `HEALTH_TOKEN_KEY`, `CRON_SECRET`, `HEALTH_RETURN_URL` on the backend Vercel project (see `grid-backend/.env.example`); add `GH_REDIRECT_URI` as an authorized redirect URI on the Google OAuth client; publish the consent screen to *In production* so tokens last past 7 days; click CONNECT GOOGLE HEALTH on any health page.
- Exit gate still open: 7 consecutive days of real data syncing unattended, and charts matching the Google Health app.
- Deployed so far: Phase 2 frontend is live at https://the-grid-tracker.vercel.app (Vercel project `the-grid`); backend routes live at https://the-grid-1t3x.vercel.app. Phase 3 is not deployed.

### Phase 4: Runs importer and dashboard
**Build:**
- Drag-and-drop upload (multi-file, plus bulk zip), parser per format, duplicate detection by file hash, per-file result report ("12 imported, 3 duplicates, 1 failed: reason").
- Run list and detail view: route map, pace and HR over distance, per-km splits, HR zones, cadence, elevation profile.
- Monthly overview, yearly overview, year-over-year, best efforts (1K, 1 mile, 5K, 10K, half), personal records timeline, gear mileage.
**Exit gate:** your full Strava history imports, totals match Strava's own stats page, re-uploading changes nothing.

### Phase 5: Gym upgrades
**Build:** port your existing page into the new nav with no behavior regressions, then add: per-exercise progression chart, estimated 1RM, PR detection with badges, weekly volume per muscle group, and a recovery overlay (readiness and sleep from Phase 3 beside training days).
**Exit gate:** all existing gym features still work on both storage paths; PRs are correct against a hand check of your real logs.

### Phase 6: Nutrition and meal presets
**Build:**
- Daily view: calorie ring, macro rings, water, diary by meal slot, targets from your plan.
- **Preset system:** create, edit and delete presets (code, name, macros, default serving). Quick-log bar: type `S1`, `2x S1` or `S1 dinner`, with autocomplete, and it logs the saved macros instantly. A code that doesn't exist offers to create it.
- Manual entry for non-preset foods, 7-day and 30-day trends, adherence streak, weight-goal timeline.
- Optional later: AI parsing of free text and photos (needs an API key, kept out of the MVP).
**Exit gate:** logging a preset takes two keystrokes plus Enter, and totals match a hand calculation over a full week.

### Phase 7: Overview dashboard and daily insight
**Build:** the main dashboard that pulls one headline tile per page (readiness, sleep score, today's load, last run, today's lift, calories left), a 7-day cross-source timeline, and a "today's call" card. The insight starts rule-based (no AI cost), with an optional LLM summary behind a daily cache.
**Exit gate:** the page loads in under 2 seconds with no AI call on page load.

### Phase 8: Hardening and deploy
**Build:** encrypted token storage, validation on every new route, upload size and type limits, a backup/export of all health, run and nutrition data, error and sync-failure alerts, and a Vercel production deploy.
**Exit gate:** a sync failure becomes visible within a day, and a full export restores to an empty database.

## Design principle (decided 2026-10-05): overview, not live
This site is a **daily overview**. It is not a live feed. Google Health data refreshes once a day (07:00 IST cron) plus an optional manual REFRESH button. For live or minute-by-minute data, use the Google Health app. Consequences: no live polling, no 24-hour heart-rate view, today's partial numbers are labelled "as of last daily update", and the deficit page only counts completed days.

## Added: Deficit page (Fuel group)
Matches calories burned (Fitbit daily total) against calories eaten (food log), per day, and shows deficit progress.
- Counts only trustworthy days: not today, not days with no food log (would fake a huge deficit), not days under 800 kcal intake, not days with no Fitbit data. Skipped days are listed with the reason.
- Tiles: average daily deficit vs planned (TDEE minus target), total deficit and estimated kg (7,700 kcal per kg), weight change vs predicted, deficit streak.
- Charts: burned vs eaten, daily deficit, cumulative deficit with predicted vs actual weight. Weekly table, recent-days table.
- Weight log (`weight_logs`) with a weekly trend.
- Progress photos (`progress_photos`): compressed in the browser to about 200 KB JPEG plus a 10 KB thumbnail, stored privately in the database; JPEG-only enforced by prefix and magic bytes; side-by-side and slider comparison with days and kg between photos.
- Backend: `/api/progress` (weight + photos). Migration `20261005140000_weight_and_progress_photos` is prepared, NOT applied. Tests: `spikes/phase5-tests/`.

## Status (2026-10-05, end of day): what is live
Deployed to production: Phases 2, 3 (needs Google setup to sync), 4 (runs importer), 6 (nutrition), Deficit page, Gym PROGRESS tab. Database migrations applied: health/runs/nutrition tables, `best_efforts`, `weight_logs`, `progress_photos`.
**Gym PROGRESS tab** (injected into the existing gym page by `js/health/gym-progress.js`; existing gym code untouched): exercise progression with estimated 1RM and PR markers, plateau detection (3+ sessions in 4 weeks, no new best), personal-records board, weekly sets per muscle vs the 10-20 guide, recovery after training (session volume vs next-morning readiness, with a plain-English correlation line), training calendar. Reads `localStorage.gymLogs`, which your existing logger writes and which syncs from the server. Tests: `spikes/phase5-tests/gym.test.js` (30 checks, incl. malformed data).
**Still needs you:** Google Cloud setup (`spikes/README.md` steps 1-4), add `GH_CLIENT_ID` / `GH_CLIENT_SECRET` to the backend Vercel project and redeploy it, publish the consent screen to In production, click CONNECT GOOGLE HEALTH, then run the day-8 token check. After the first real sync, send the sync status so payload field mismatches can be fixed.

## Cost
Vercel, Supabase and Google Health API access are free at this scale. Domain is optional (about $10-15 a year). AI insights are optional and cost cents a month through an API key; your Claude Pro and Gemini Pro subscriptions do not cover API calls.

## What this will do for you when finished
- **One place for your body's data.** Sleep, heart, HRV, SpO2, activity and recovery from your Fitbit Air, synced automatically, with trends against your own baselines.
- **A real running log.** Drop in your Strava exports and get every run's detail plus monthly and yearly overviews, personal records and year-over-year comparisons.
- **Gym tied to recovery.** Your lifts, progression and PRs next to how recovered you were on the day.
- **Fast calorie tracking.** Type `S1` and your saved macros are logged; daily and weekly intake against your targets.
- **A single "how am I doing" screen**, plus a daily recommendation that combines sleep, training load, nutrition and recovery.

**Limits:** Strava runs are manual uploads. Some Google Health metrics (Readiness, Cardio Load) may not be exposed through the API; Phase 1 will tell us, and we will derive or drop them.
