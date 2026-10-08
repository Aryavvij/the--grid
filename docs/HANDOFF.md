# HANDOFF: Runs, Nutrition and Gym PROGRESS

Written 2026-10-06 so a new Claude chat opened inside the Grid folder can continue this work. Read this first, then `CLAUDE.md` (repo guide) and `tests/README.md`.

## What was built, in one paragraph
Three additions to Grid, all in the same visual language as the existing app: **Runs** (Strava file import and run analytics), **Nutrition** (preset-based quick-log, diary, plan) and a **PROGRESS tab on Gym** (strength trends, PRs). A fourth, **Deficit** (calories burned vs eaten, weight, progress photos), was built and then removed from the site on 2026-10-08 at the user's request (see "Deficit page removed" below). Originally this was a larger "health website" fed by a Fitbit Air through Google Health, with pages for heart, sleep, activity and recovery. **That was removed on purpose** (the user reads that data in the Google Health app). A separate standalone site, "Metriq / grid-health", was retired and deleted. Do not rebuild Fitbit or Google Health sync unless the user asks again.

## Current state
- Live frontend: https://the-grid-tracker.vercel.app (Vercel project `the-grid`, **not** Git-connected: deploy by running `vercel --prod --yes` from the Grid root).
- Live backend: https://the-grid-1t3x.vercel.app (Vercel project `the-grid-1t3x`, Git-connected, root `grid-backend/`; a push to `main` deploys it).
- Git: everything is on `main`. The 2026-10-06 full-site check (see below and `docs/GUIDE.md`) was deployed on 2026-10-08 with the user's OK. `Understanding/`, `cv_format.pdf` and `grid_project_brief.pdf` are the user's untracked files; leave them.
- Tests: `node tests/run-all.js` runs 9 suites, all passing. It takes a few minutes here: `progress.test.js` and `runparser.test.js` each run 40 s+ because this folder is in iCloud Drive and Node pulls `node_modules` files down on `require`. Slow, not hung.
- Database (Supabase): all migrations applied, including `20261006120000_project_progress_gym_registry` (adds `projects.progress` and `gym_splits.registry`, applied 2026-10-08). For any future migration: apply it to production *before* pushing a backend that uses it (ask the user first), then push, then deploy the frontend.
- Deploy quirk: `vercel --prod --yes` can print `Not authorized` after uploading even though the deployment was created and is live. Check with `vercel ls` / `vercel inspect` before retrying.
- **Not yet verified by the user:** a real Strava import on their live account. Everything was tested in demo mode, with a faked API, and end to end against a real local backend with a local Postgres, but not on their production account.

## How the code is organised
| Path | Role |
|---|---|
| `index.html` | Sidebar entries (Runs, Nutrition), empty mount divs `page-runs` / `page-nutrition`, `<script defer>` tags for `js/fuel/*`, and one hook in `navigate()` that calls `Grid.show(page)`. Nothing else was changed in the 15k-line file. |
| `css/fuel.css` | Small helper stylesheet. Components come from Grid's own classes: `page-header`/`page-subtitle`, `fin-section`, `fin-stat-card`, `fin-group-label`, `fin-budget-table`, `form-*`, `btn-*`, `modal-overlay`/`modal`. |
| `js/fuel/core.js` | `Grid.registerPage`, `Grid.show` (loading state, error panel, "could not load" notice with RETRY), `Grid.data(kind, params)` (demo vs login switch, 20 s timeout, `cache:no-store`, response-shape validation), formatting, `Grid.modal`, `Grid.toast`, `Grid.csv`. |
| `js/fuel/charts.js` | Stat cards, section cards, sparkline, line / bar / stacked / heatmap helpers. Built on Grid's existing ECharts theme (`ethosChart`, `bkBar`, `bkArea`, `gridGauge`, `gridRingChart`). |
| `js/fuel/fit-decoder.js`, `runs-parser.js`, `runs-import.js`, `runs.js` | Run metrics maths, file reading (FIT / GPX / TCX / .gz / .zip / activities.csv), and the page. |
| `js/fuel/presets.js`, `calc.js`, `nutrition.js` | Quick-log parser (`S1`, `2x S1 dinner`), BMR / TDEE / plan maths, and the page. |
| `js/fuel/gym-calc.js`, `gym-progress.js` | PROGRESS tab. It injects a tab and panel into the existing gym page by wrapping the global `gymTab()`. Existing gym code is untouched. |
| `js/fuel/seed-demo.js` | Fake data for demo mode (deterministic, relative to today). |
| `grid-backend/src/routes/runs.js`, `nutrition.js`, `progress.js` | The API. All routes use `requireAuth` and zod `validate(...)`. |
| `tests/` | Plain node suites, no framework. `fixtures-generator/` makes sample FIT / GPX / TCX / CSV / zip files. |

Pages register themselves: `Grid.registerPage('runs', { sub, dot, tools?, foot?, render(body, root) })`.

## Dual storage fork (read this)
Grid runs in two modes (see `CLAUDE.md`). The new pages follow the same rule: `Grid.isDemo()` is true when `sessionStorage.gridMode === 'demo'`.
- **Demo mode:** every read comes from `js/fuel/seed-demo.js` (`Grid.seed.get(kind)`); edits live in memory only and vanish on reload.
- **Login mode:** reads go through `Grid.data()` to the API; writes use `gridFetch()` directly.
- **Every feature must work on both paths.** When you add a feature, add the demo branch (seed method) and the API branch.
- Sandbox accounts (`@sandbox.invalid`, see `gridIsPreview()`): the new pages only recognise plain demo mode, so a sandbox account would see empty pages. **Not reachable today**: nothing in the frontend calls `POST /api/auth/sandbox`; the DEMO button runs `launchLocalDemo()`. Only matters if sandbox signup is ever wired up (then seed these tables in the backend's `seedSandbox()`).

## How each page works

### Runs
- **Import:** drag files onto the drop zone or click it. Accepts `.fit`, `.gpx`, `.tcx` (each optionally `.gz`), Strava's bulk export `.zip`, and `activities.csv`. Everything is parsed in the browser (own zip reader using `DecompressionStream`, `DOMParser` for XML, and the built-in FIT reader `js/fuel/fit-decoder.js`; nothing is downloaded at import time). Only the computed run is uploaded, in batches under about 600 KB, to `POST /api/runs/import`.
- **What gets computed per run** (`runs-parser.js`): distance, moving time (gaps over 30 s and speeds under 0.5 m/s are pauses), elapsed time, per-km splits, best efforts (fastest window for 1 km, 1 mile, 3 km, 5 km, 10 km, half marathon), 5 HR zones against a 190 bpm max, elevation gain (smoothed, 2 m hysteresis), cadence (doubled when it looks per-leg), a simplified route (up to 300 points) and downsampled streams. Non-runs (rides, walks) are skipped with a reason; corrupt files are reported; a short note is shown for each skipped or failed file.
- **Duplicates:** by SHA-256 of the file (enforced server-side with a unique key per user) and by start time within 90 s plus similar distance. If `activities.csv` is dropped with the track files, names, gear and calories are merged onto the tracks; CSV rows with no track become summary-only runs.
- **First run (empty account):** the page explains how to request a Strava archive or export single files.
- **Overview:** month and year toggle, per-period tiles vs the previous period (same-point-last-year for years), distance by month, calendar heatmap, cumulative year-over-year, pace by month, weekly distance with a 4-week average and a ramp-up chip, run-length histogram, weekday and time-of-day charts, HR zone donut, pace vs HR scatter, shoe mileage vs 700 km, personal bests with a PR timeline (click a distance), sortable run list, CSV export.
- **Run detail** (click a row): route drawn as coloured SVG segments (colour = pace), splits table, four linked charts (pace, HR, elevation, cadence), HR zones, best efforts, **EDIT** (name and gear via `PUT /api/runs/:id`), **COMPARE** with another run within 30% distance (pace overlay plus a difference table), DELETE.

### Nutrition
- **Quick-log bar:** type a preset code. `S1`, `2x S1`, `S1 x2`, `S1 dinner`, `dinner 2x S1`. Autocomplete shows macros; Enter logs; the toast has UNDO. An unknown code offers to create it. Parser: `presets.js` (pure, tested).
- **Meal presets:** create / edit / duplicate / delete / favourite. Code must be 1-12 letters, digits or `_`, unique per user. The form warns when calories disagree with macros by more than 10% (4/4/9 kcal per g). First-time users can add 10 starter presets in one click.
- **Diary:** grouped Breakfast / Lunch / Dinner / Snacks, day navigation, edit any entry (changing quantity rescales numbers live), delete, **copy previous day**, CSV export, **custom food** (optionally saved as a preset), water (+/- 250 ml).
- **Plan:** works without one (banner invites setup). The plan editor uses `calc.plan()`: Mifflin-St Jeor BMR, activity multipliers, calorie floors 1,500 (male) and 1,200 (female), protein 0.8-1.0 g/lb (1.0 when losing or athlete), fat 0.35 g/lb, carbs the remainder, water by activity, and a weeks-to-goal estimate at about 3,500 kcal per lb.
- **Trends (7 / 30 days):** calories vs target (green within +/-5%), protein vs target, macro split. (A calories in vs out chart was removed with the Deficit page: burn could only be entered there.)

### Gym PROGRESS tab
Reads the same `localStorage.gymLogs` that the existing logger writes (hydrated from `/api/gym/logs` in login mode). Shows sessions, volume and sets over 30 days vs the previous 30, estimated 1RM (Epley, same as the logger) with PR markers, a plateau flag (3+ sessions in 4 weeks without a new best), a PR board, weekly sets per muscle group vs a 10-20 guide, and a training calendar. Malformed log entries are skipped rather than thrown on.

## API surface (all require login)
- `/api/runs`: `GET ?from&to&limit`, `GET /:id`, `POST /import` (zod, 1-500 runs), `PUT /:id` (name, gear only), `DELETE /:id`.
- `/api/nutrition`: `presets` (GET, POST, PUT /:id, DELETE /:id), `POST /log-preset`, `log` (GET ?from&to, POST, PUT /:id, DELETE /:id), `water` (GET, PUT /:date), `targets` (GET, PUT).
- `/api/progress`: `weight` (GET, PUT /:date, DELETE /:date), `burn` (same), `photos` (GET list with thumbnails only, GET /:id full image, POST, DELETE /:id).
- Every `/api` response carries `Cache-Control: no-store`.

## Database tables (Prisma, `grid-backend/prisma/schema.prisma`)
New: `run_activities` (unique user + file hash), `meal_presets`, `food_logs`, `water_logs`, `nutrition_targets`, `weight_logs`, `progress_photos`. Reused: `health_daily` (only `calories_total` and `source` are used, for manual burn). **Unused, still present and empty:** `health_sleep`, `health_tokens` and most other `health_daily` columns (left over from the removed Fitbit work). Migrations `20261005120000`, `...130000`, `...140000` are applied.

## How to work on it
- Run all tests: `node tests/run-all.js`.
- Local frontend: serve the Grid folder with any static server. Pick an unusual port, other projects on this machine have used 8123 and 8124.
- Demo mode in a browser: set `sessionStorage.gridMode = 'demo'` and reload.
- **Real end-to-end test recipe that worked:** start Postgres in Docker (`postgres:16-alpine`), set `DATABASE_URL` and `DIRECT_URL`, run `npx prisma migrate deploy` in `grid-backend/`, run the backend on port 4000 with `FRONTEND_URL=http://localhost:<port>` and `NODE_ENV=development`, serve the frontend through a small node server that rewrites the `GRID_API` constant in `index.html` to `http://localhost:4000`, register a throwaway local user via `POST /api/auth/register`, then log in through the app's login screen. Do **not** point tests at the production database.
- Deploy: `git push origin main` deploys the backend; run `vercel --prod --yes` from the Grid root for the frontend; run `npx prisma migrate deploy` in `grid-backend/` for new migrations (production database, ask before doing this).
- Conventions: lowercase scope-prefixed commit messages (`runs: ...`), validate every new route with `validate(schema)`, keep new frontend code in `js/fuel/` and plain `<script defer>` (no build step).

## Decisions and why
- **FIT files are read by our own decoder (2026-10-08).** The importer used to load `fit-file-parser@2.2.2` from jsDelivr when a `.fit` was dropped; the user reported `.fit` files not reading while `.gpx` worked. `js/fuel/fit-decoder.js` replaces it: no network, no third-party code on a page that holds the login. It reads records and the session summary, skips unknown messages and developer fields by size, and keeps whatever it could read from a cut-short file. It was checked value by value against Garmin's official decoder (`@garmin/fitsdk`, 43,064 values on three files, 0 differences) and unit-tested in `tests/fit.test.js`. If a real file still fails, the Runs import report shows the reason per file. Two real-file lessons: (1) **Strava's own FIT export writes two record messages per second** (one with only `distance`, one with position, altitude, speed), so `toRun` merges records sharing a timestamp; (2) that file's distance only changes every other second, so `track()` in `runs-parser.js` judges moving or stopped over a +/- 3 s window instead of one second at a time (otherwise a steady 5:26/km run read as 3:48/km with 19 of 27 minutes "moving"). Both are covered in `tests/fit.test.js` (section 15). Also: after an import, the Runs page lists what was added and jumps to the newest run's year (an older run used to be saved with nothing visibly changing).
- **Instant Runs and Nutrition (2026-10-08).** These pages used to wait 2-3 s on the cross-origin API on every visit while the older pages drew from `localStorage`. `js/fuel/core.js` now keeps every `G.data()` answer per account in IndexedDB (`grid-fuel-cache`), mirrored in memory. `G.show` draws from the saved copy at once, refreshes in the background (stale-while-revalidate) and redraws only if the data changed and the user hasn't clicked or typed in the page. Requests are keyed with dates relative to today so yesterday's copy still serves today. Pages that write call `G.cacheSet(...)` so the next visit opens on the user's own change (see `store.persist()` in `nutrition.js`; Runs reloads after each write, which refreshes the cache). A failed refresh keeps the copy on screen with a "SHOWING YOUR LAST SAVED COPY" notice. After login, `G.prefetch()` warms pages never opened on the device and skips pages refreshed in the last 10 minutes. `handleLogout()` clears the cache. Measured with a simulated 2.5 s server: cold 2.7 s, warm 54-435 ms. **Any new fuel page gets this by reading data only through `G.data()`.**
- **Deficit page removed (2026-10-08, user's call: "not needed for this website").** Gone from the site: sidebar entry, page, `deficit.js`, `deficit-calc.js`, `deficit.test.js`, and Nutrition's "calories in vs out" chart (burn could only be typed in on that page). **Deliberately kept:** the backend `/api/progress` routes (weight, burn, photos), their tables (`weight_logs`, `progress_photos`, and `health_daily` rows with `source = 'manual'`), `progress.test.js`, and the weight / burn / photo data in `seed-demo.js` (changing it would shift the demo's random sequence). Nothing was deleted from the database. If the user wants it fully gone, drop those routes and tables with a migration (ask first: it destroys saved weights and photos). The deleted code is in git history (last present at commit `84c7b94`).
- Fitbit / Google Health removed: user views that in the Google Health app; the site is for runs, food and gym.
- Burn is manual: no device integration means the user types the daily total; estimates fill gaps and are always labelled.
- Photos in Postgres: simplest for one person's progress photos; move to object storage if volume grows.
- Strava: file uploads only (no Strava API), to avoid API terms and rate limits.
- Pages must never fail silently: after a blank-page report, `Grid.show` was hardened (loading state, timeouts, shape validation, notice with RETRY). If a page looks blank again, check the console and the notice first.

## 2026-10-06 full-site check
Every page was exercised in demo mode, then end to end against a local backend + Postgres: data entered on every page, browser storage wiped, logged back in, everything checked to come back from the server. Findings and fixes are listed for the user in `docs/GUIDE.md` section 5. Things worth knowing when you touch these areas:
- **Timetable:** an hour stored as `''` is free time and ends the block before it. `getSlotLabel`, `hvBlockAt`, the Home slots, `ttToBlocks` / `blocksToTt` and the block editor all follow that rule now. Before, end times were lost and gaps were swallowed.
- **Dates:** use `gridIsoDate(d)` for any `YYYY-MM-DD` key. `toISOString()` is UTC and shifts dates a day in India.
- **Gym exercise registry** (`gymExerciseRegistry`, `gymMuscleGroups`) syncs through `PUT /api/gym/registry` (stored on the active split, newer `savedAt` wins, older gets 409). Call `gymRegistryChanged()` after any user edit to it.
- **Résumé PDF** is `js/resume-pdf.js` (pure, tested), rendered into an iframe that is also what prints. Measured against `cv_format.pdf` with headless Chrome + pdftotext; keep the spacing values unless re-measuring.
- **Real accounts start empty:** no sample timetable, no sample gym split, no Mindgraph padding (the padding is demo-only).
- **Local e2e gotchas on this Mac:** the preview launcher cannot read iCloud Drive or the scratchpad (processes hang on `open`). Copy `grid-backend` (without `.env`) and the frontend to a temp folder and run both servers from the shell. Run the API with that folder as its working directory, so dotenv can't pick up the production `.env`.

## Open items and ideas
1. User to try a real Strava import on the live account and report anything odd.
2. ~~Demo data thinner than real use~~ Done 2026-10-06: food, burn and weight now span 12 months like runs, following one story (cut, ~3-month maintenance block, second cut, 79.0 → 72.5 kg). Before this, the Deficit 90D view showed 37 skipped days because food stopped at 60 days. Still no demo progress photos, deliberately (no fake body photos).
3. Optional cleanup: drop the unused `health_sleep` / `health_tokens` tables (needs a migration and the user's OK).
4. Small known gaps: run splits list only full kilometres (no partial last split); the habit modal's "Target Goal Score" field is not stored or used.
5. Possible features: edit a run's date, merge duplicate runs, weekly summary email or digest, barcode lookup for food.
6. The Metriq folder on disk and Docker Desktop are leftovers the user said they will handle.

## Files worth knowing about
- `docs/HEALTH_EXPANSION_PLAN.md`: long history and the original phased plan (top section records the scope change; the rest about Google Health is historical).
- `docs/STITCH_PROMPT_GRID_HEALTH.md`: the original Google Stitch UI prompt (partly obsolete: it describes the removed health pages).
- `docs/PROJECT_NOTES.md`: earlier reviews and decisions.
