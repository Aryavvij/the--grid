# Grid: where things stand (handoff for continuing in Antigravity)

Written 2026-10-08, from the Claude Code session that built the last two weeks of work. Read this first, then `CLAUDE.md`. For the details of Runs, Nutrition and the Gym PROGRESS tab read `docs/HANDOFF.md`. For the plain-language user guide read `docs/GUIDE.md`.

> **To start the new session, paste this:**
> "Read `docs/ANTIGRAVITY_HANDOFF.md` fully, then `CLAUDE.md`. Follow the 'Rules' section exactly. Run `git status` and `node tests/run-all.js` and tell me the result before changing anything. Then wait for my first task."

---

## 1. State at a glance

| | |
|---|---|
| Last commit | `8a4df07` on `main`, pushed and deployed. Nothing uncommitted except the user's own untracked files. |
| Live site | https://the-grid-tracker.vercel.app (frontend, Vercel project `the-grid`) |
| Live API | https://the-grid-1t3x.vercel.app (backend, Vercel project `the-grid-1t3x`) |
| Database | Supabase Postgres. All 9 migrations applied, the newest is `20261006120000_project_progress_gym_registry`. |
| Tests | `node tests/run-all.js`: 8 suites, 199 checks, all passing. |
| Size | `index.html` is 15,384 lines (the whole frontend), plus `js/` (1,900 lines) and `css/fuel.css`. Backend is Express 4 + Prisma 5. |
| Verified live | Demo mode on all pages, no console errors. **Not** checked on the user's real account. |
| What the user is doing now | Inspecting the corrected features and the new pages on the live site, and will report anything wrong. Expect bug reports from that. |

**What was done in the last two days (all deployed):**
1. **Résumé PDF** matches the user's `cv_format.pdf` (the "Jake Ryan" LaTeX template): see section 4, Résumé.
2. **Full-site check** in demo and logged-in mode against a local database. Fixed: timetable end times, sample data leaking into real accounts, gym exercise list and PRs not saved to the account, project edits failing, budget gauge, calendar delete, UTC date bugs, sign-up dropping the last name, plus validation on every API route. The full table is in `docs/GUIDE.md` section 4.
3. **Runs and Nutrition open instantly** (saved copy first, refresh in the background): see `docs/HANDOFF.md`, "Instant Runs and Nutrition".
4. **Deficit page removed** at the user's request (backend routes and saved data deliberately kept).

---

## 2. Rules (the user's standing instructions: follow all of these)

**Do not change without being asked**
- **Home page structure.** The user restructured Home themselves into **8 boxes for the weekly timetable (PAST / NOW / NEXT)** and said: "keep it as that, don't change it again". Do not rearrange, resize or restyle it. Bug fixes inside it are fine.
- **Mindgraph.** A real account's graph must start sparse and grow as the user logs things. Never add fake or historical data to a real account. The dense look is demo-only (`GridMode.isDemo()` in `mgBuild`).
- **The résumé PDF layout.** It was measured against `cv_format.pdf` to within about 1 pt. If you change spacing, re-measure (method in section 4).
- **The user's files:** `Understanding/`, `cv_format.pdf`, `grid_project_brief.pdf`, `BLUEPRINT.html` are theirs. Leave them (`git status` shows the first three as untracked on purpose). `Ethos-Hub-main/` and `Previous Files/` are archives, not the live app.
- **Fitbit / Google Health sync.** It was removed on purpose. Do not rebuild it unless the user asks again.

**Ask first (always, every time)**
- **Deploying.** The user says "deploy" explicitly each time. Do not push or deploy on your own.
- **Anything touching the production database**, including `prisma migrate deploy`. If a change needs a migration: tell the user, wait for a yes, apply the migration to production **before** pushing the code that uses it.
- **Deleting saved data** (including the unused weight / photo / burn tables, which are kept on purpose).

**Never**
- Point tests, scripts or experiments at the production database. `grid-backend/.env` contains the production credentials: never commit it, print it, or let a local run inherit it (dotenv does not override variables already in the environment; pass local values explicitly).
- Poll the production site in a tight loop (Vercel's bot protection will block you). One request at a time.
- Use `git add -A` / `git add .`. Stage specific files.

**How the user likes to work**
- Plain, short, non-technical summaries. They said a one-line summary was "too techy and big". Say what changed and what they should do, not how.
- Boxes keep a fixed size. If content overflows, the box scrolls; it does not grow or reshape the page.
- Every data feature must work in **both** modes (see section 3) and survive a cleared browser, a new phone, and logging out and in.
- When something is wrong, find the root cause. They have been burned by fixes that hid the symptom (the habit ticks, Mindgraph, the stale demo flag).

---

## 3. How the app works (the parts that cause bugs)

**Layout.** One file, `index.html`, holds all markup, CSS and most JS (vanilla, no build step, ECharts for charts). Pages are `<div id="page-*">` toggled by `navigate(page)`. Extra scripts are plain `<script defer>` tags at the bottom: `js/fuel/*` (Runs, Nutrition, Gym PROGRESS) and `js/resume-pdf.js`.

**The dual-storage fork (the #1 source of bugs).**
- **Demo mode** (`sessionStorage.gridMode === 'demo'`): everything reads and writes `localStorage`; nothing reaches the server. Entering demo wipes about 20 `localStorage` keys and re-seeds them (`launchLocalDemo()`, `seedDemoData()`).
- **Logged-in mode:** each module keeps a `localStorage` cache for speed **and** syncs to the API. On page open it pulls from the server (`hydrate…FromServer`, `loadCalendarFromAPI`, `pullPlanning`, `initResume`, `initRunway`). Writes go through `gridSync(path, body, method)`, which does nothing in demo and queues failed writes in IndexedDB (`GridQueue`) to replay later.
- `gridFetch` calls the API with the login cookie (`credentials: 'include'`, cross-origin). It retries once on a 401, because the cookie is sometimes late on a fresh page load.
- A stale `sessionStorage.gridMode='demo'` after login once made a real account look like demo: `markRealUserSession()` fixes that. Keep it.
- **Rule:** any new data feature needs a demo branch and an API branch, and a "clear storage, log in again, is it all back?" test.

**Fuel pages** (`js/fuel/*`) register with `Grid.registerPage(name, {...})` and read data **only** through `Grid.data(kind, params)`. That gives them the instant-load cache for free (IndexedDB database `grid-fuel-cache`, per account, cleared on logout). Pages that write must call `Grid.cacheSet(...)` or reload after the write. Details in `docs/HANDOFF.md`.

**Helpers you should use**
- `gridIsoDate(d)`: local `YYYY-MM-DD`. Never use `toISOString().slice(0,10)` for a date key: it is UTC and shifts dates a day in India (this was a real bug).
- `escHtml(v)`: for any user text put into `innerHTML`.
- `showUniversalModal({title, fields, onSave})`: the shared form pop-up. Field types: text, number, date, time, select, textarea. It scrolls on small screens.
- `gridBlockWriteIfTimeTraveling()`: a "time machine" view of past dates exists; writes are blocked while it is active.

**Timetable rule.** `ttData[day][hour]` holds a label that runs until the next stored hour. An hour stored as `''` is **free time** and ends the block before it. Every reader (`getSlotLabel`, `hvBlockAt`, Home's slots, `ttToBlocks`/`blocksToTt`, the block editor) follows this. Do not "simplify" it back.

**Gym registry.** `gymExerciseRegistry`, `gymMuscleGroups` sync through `PUT /api/gym/registry` (stored on the active split; newer `savedAt` wins; an older copy gets 409). Call `gymRegistryChanged()` after any user edit to them. Exercises written as `NAME | 3 x 10 (CHEST)` map into that muscle group automatically.

**Résumé data.** `rsTabData` is `{ projects, internships, positions, courses, research, achievements }`, each a list of `{name, org, location, date, desc, fullDesc (one bullet per line), tags, links, badge, badgeLabel, onPdf}`. The PDF header and four skills rows live in `rsProfile` and travel in the same server blob under the reserved key `__profile` (so keep other code treating `rsTabData` as category → list).

---

## 4. Page by page

| Page | Status | Notes |
|---|---|---|
| **Home** | Working | The 8-box timetable is the user's design: do not restructure. Also: deadlines, today's calendar and gym split, activity heatmap, ⌘K quick actions, streak. |
| **Calendar** | Working | Add and **delete** entries (✕ in the day panel). There is **no edit** for an existing entry (open gap). Times are stored as wall-clock UTC so they read back the same on any server. |
| **Weekly** | Working, one gap | Timetable editor and weekly tasks. On a new week the board resets and unfinished tasks move to an "UNFINISHED FROM LAST WEEK" list. **That list and the week marker are saved in the browser only** (`gridKanbanCarryover`, `gridKanbanWeekStamp`): clearing storage loses the list, and a second device does its own rollover. A real account starts with an **empty** week. |
| **Habits** | Working | Ticks save to the server and survive a reload; momentum graph is the current month, heatmap is the year. Backend `/api/habits` is marked legacy (superseded by `/api/metrics`) but the page still uses it. |
| **Finances** | Working | Budget by sector, expenses, recurring payments (summed into a "Recurring" sector), debts. Budget gauge counts every expense this month. |
| **Gym** | Working | Weekly split (editable text box), muscle growth, overview and log, PROGRESS tab (1RM trends, PRs, plateaus). A real account starts with an empty split. |
| **Runs** | Working | Strava file import in the browser, run detail, personal bests, shoe mileage. Opens instantly. **Not yet tried by the user on a real Strava export.** |
| **Nutrition** | Working | Preset quick-log (`S1`, `2x S1 dinner`), diary, plan, water, trends (calories, protein, macro split). Opens instantly. |
| **Deficit** | **Removed** (2026-10-08) | Page and code deleted. `/api/progress` routes and the tables `weight_logs`, `progress_photos`, `health_daily` kept; last present at commit `84c7b94`. |
| **Work** (menu: Runway) | Working | Projects (progress is hand-set 0-100), queue, study / focus timer and sessions. |
| **Résumé** | Working | Overview of entries, **PDF generator** in the exact format of `cv_format.pdf`: US Letter, Computer Modern font, small-caps headings, two-row subheadings, 10 pt bullets. Preview is an iframe of the page that prints; it marks where page 1 ends. Header and skills editor under HEADER & SKILLS. |
| **Mindgraph** | Working | Real data only for real accounts (24 nodes on a nearly empty account); demo is padded to 315 nodes. |

**Résumé PDF: how it was measured.** Print the generated page with headless Chrome (`--print-to-pdf`), extract text positions with `pdftotext -bbox-layout`, and compare line baselines against `cv_format.pdf`. Keep spacing values in `js/resume-pdf.js` unless you re-measure. Its tests are in `tests/resume-pdf.test.js`.

---

## 5. Backend

- **Entry:** `src/app.js` (shared) ← `src/index.js` (local server) and `api/index.js` (Vercel).
- **Routes** under `/api`: `auth`, `profile`, `habits` (legacy), `metrics`, `planning` (timetable, tasks, study), `gym` (split, logs, registry), `runs`, `nutrition`, `progress` (weight, burn, photos: kept, no page uses them now), `finance`, `calendar`, `projects`, `resume`.
- **Security:** `helmet`, global rate limit 300 per 15 min and 10 per 15 min on auth, 1 MB body limit, JWT in an httpOnly cookie `grid_token`, bcrypt. **Every route that takes input validates it with `validate(zodSchema)`** (`src/middleware/validate.js`), which strips unknown keys so a request cannot set `userId` or `id`. Updates that reference a category or split check the caller owns it. 500 responses hide database error text outside `NODE_ENV=development`.
- **Models** (`prisma/schema.prisma`): `User`, `UserProfile`, `Habit`/`HabitLog`, `MetricDef`/`MetricLog`, `GymSplit` (has `registry` JSON), `GymLog`, `BudgetCategory`, `Transaction`, `CalendarEvent`, `Project` (has `progress`), `ResumeData` (free-form JSON blob), `TimetableBlock`, `WeeklyTask`, `StudySession`, `RunActivity`, `MealPreset`, `FoodLog`, `WaterLog`, `NutritionTargets`, `WeightLog`, `ProgressPhoto`, and leftovers from the removed Fitbit work (`HealthDaily`, `HealthSleep`, `HealthToken`).
- **Env vars:** `DATABASE_URL` (Supabase transaction pooler, port 6543), `DIRECT_URL` (session pooler, 5432), `JWT_SECRET`, `JWT_EXPIRES_IN`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `FRONTEND_URL`, `BACKEND_URL`, `PORT`, `NODE_ENV`. The frontend's API address is the `GRID_API` constant near line 6898 of `index.html`.

---

## 6. Deploying (only when the user says so)

1. **If there is a migration:** ask the user. Then, from `grid-backend/`, `npx prisma migrate status` (check the target is the Supabase host, and only the migration you expect is pending), then `npx prisma migrate deploy`.
2. `git push origin main` → the **backend** deploys automatically (Vercel project `the-grid-1t3x`, root `grid-backend/`).
3. From the Grid root: `vercel --prod --yes` → deploys the **frontend** (project `the-grid`; it is *not* connected to Git, so a push alone does not update the site).
4. **The CLI often prints `Not authorized` even though the deployment was created.** Do not retry blindly. Check with `vercel ls the-grid` and `vercel ls the-grid-1t3x` (look for `Ready` and a fresh age). A single request to `/health` on the API and a look at the live `index.html` confirm it.
5. The site's routing falls back to the home page for any missing file, so a deleted file still returns 200 with HTML. Check the content type, not just the status.

---

## 7. Running and testing locally

- **Frontend only (demo mode):** any static server in the Grid folder (the preview config `grid-static` in `.claude/launch.json` runs `python3 -m http.server 8743`). Open it, press DEMO. After editing a script, hard-refresh (the browser caches `js/` files).
- **Unit and route tests:** `node tests/run-all.js` (no framework; see `tests/README.md`). Route tests stub auth and the database.
- **Full logged-in test (real backend, throwaway data):**
  1. Start Postgres in Docker: `docker run -d --name grid-e2e-pg -e POSTGRES_PASSWORD=gridlocal -e POSTGRES_DB=grid -p 5440:5432 postgres:16-alpine` (Docker Desktop must be running).
  2. Copy `grid-backend/` (without `.env`) and the frontend to a **temp folder outside iCloud**, `npm ci` there, and set `DATABASE_URL`/`DIRECT_URL` to `postgresql://postgres:gridlocal@localhost:5440/grid`, then `npx prisma generate` and `npx prisma migrate deploy`.
  3. Run the API from that folder with `NODE_ENV=development PORT=4000 FRONTEND_URL=http://localhost:8744 JWT_SECRET=<random>` and a small static server on 8744 that rewrites `GRID_API` in `index.html` to `http://localhost:4000`.
  4. Sign up a throwaway user in the app, add data on every page, clear `localStorage`/`sessionStorage`, log in again and check it all comes back.
  5. Remove the container afterwards (`docker rm -f grid-e2e-pg`).
- **Gotcha: this project folder lives in iCloud Drive.** Node processes started from inside it can hang on file opens, and copying `node_modules` is very slow. Strong recommendation to the user: move the repo to a normal folder (for example `~/Projects/Grid`). Git works the same.

---

## 8. Conventions

- Commit messages: lowercase, scope prefix, e.g. `resume: ...`, `fuel: ...`, `api: ...`, `grid: ...`, `docs: ...`. Stage specific files. One logical change per commit.
- Backend style: aligned `const` requires, `// ─── Section ───` banner comments, `next(err)` to the global error handler, `validate(schema)` on any input.
- UI: numbers in monospace with `tabular-nums`, carbon-grey surfaces, one green accent. `BLUEPRINT.html` is the intended v2 direction (typed metric engine, Daily Console, Focus Engine, Streak 2.0).
- Comments explain *why* (several bugs came from code whose intent was lost). Match the surrounding comment density.

---

## 9. Open items and likely next work

**From the user's inspection (expect these first):** they are checking the corrected features and Runs / Nutrition on the live site and will send what looks wrong.

**Things the user still has to do on their real account** (listed in `docs/GUIDE.md` section 1): open Gym once on the device where they typed their PRs (this copies the exercise list to their account); delete any sample timetable blocks left from the old default and fix block end times; set the Nutrition plan; fill the résumé header, skills, and each entry's organisation / location / bullets; try a real Strava export.

**Known gaps**
- **Weekly "unfinished from last week" list is browser-only** (breaks the "survives a cleared browser" rule). Fixing it needs somewhere on the server to keep it (the `WeeklyTask` model is indexed by day of week, with no week or carry-over field), so it likely needs a small migration: ask the user first.
- Calendar entries cannot be edited, only deleted.
- Run splits list full kilometres only (no part-kilometre final split).
- The habit form's "Target Goal Score" box is not stored or used.
- The dual-storage fork still exists (BLUEPRINT proposes one API client with an offline queue; the groundwork is `gridSync` + `GridQueue`).
- The rate limiter's counters are per server instance on Vercel and reset on cold start; a shared store (Upstash Redis) would make limits hard guarantees.
- Unused tables (`health_sleep`, `health_tokens`, most of `health_daily`) and the kept `/api/progress` routes could be dropped with a migration, **only with the user's OK** (it destroys saved weights and photos).
- `CLAUDE.md` is partly out of date: it says `index.html` is about 11,200 lines (now 15,400) and its route list omits `metrics`, `planning`, `runs`, `nutrition`, `progress`. Trust the code and this document where they differ.

**Ideas the user has not asked for** (do not start without being asked): edit a run's date, merge duplicate runs, a weekly digest, barcode food lookup.

---

## 10. Where to look

| Need | File |
|---|---|
| Repo guide (partly stale, see above) | `CLAUDE.md` |
| Runs, Nutrition, Gym PROGRESS: behaviour, API, tables, instant-load cache, decisions | `docs/HANDOFF.md` |
| Plain-language guide for the user, and the list of what was fixed | `docs/GUIDE.md` |
| Test suites and what each checks | `tests/README.md` |
| Intended v2 direction | `BLUEPRINT.html` |
| Old planning notes (history only) | `docs/PROJECT_NOTES.md`, `docs/HEALTH_EXPANSION_PLAN.md` |
| Résumé renderer and its geometry | `js/resume-pdf.js` |
| Instant-load cache, `Grid.data`, `Grid.show` | `js/fuel/core.js` |
