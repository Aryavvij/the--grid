# GRID — Project Guide for Claude

Personal dashboard for students & adults: habits, gym, finance, calendar, projects, resume.
Carbon-green aesthetic. Deployed on Vercel (frontend + serverless API). Postgres is hosted on Supabase.

## Repo layout

| Path | What it is |
|---|---|
| `index.html` | The entire frontend — a single ~11,200-line vanilla-JS SPA. No build step, no framework. |
| `grid-backend/` | Express + Prisma + Postgres API. |
| `BLUEPRINT.html` | The v2 product blueprint (Carbon-Green upgrade plan). Open it for the intended direction — typed metric engine, Daily Console, Focus Engine, Streak 2.0. Treat it as the spec for new work. |
| `Ethos-Hub-main/`, `Previous Files/` | Archived/older material — not the live app. |

## Frontend (`index.html`)

- **One file, vanilla JS.** Views are `<div id="page-*">` sections toggled in JS: `page-home`, `page-calendar`, `page-weekly`, `page-habits`, `page-finances`, `page-workout`, `page-work`, `page-runway`, `page-resume`. Auth screens: `tabLogin` / `tabSignup`.
- **⚠️ Dual storage fork — the #1 source of bugs.** The app runs in two modes:
  - **Auth mode** → calls the backend API.
  - **Demo mode** → reads/writes `localStorage` (keys: `gridHabits`, `gymLogs`, `gridBudget`, `rwProjects`, `rsTabData`, `gridEntries`, `gridFinRecurItems`, etc.). Entering demo **wipes** ~14 keys.
  - Mode resolution: `sessionStorage.gridMode` → URL `?mode=` → `localStorage.gridActiveMode`.
  - Every feature is effectively written twice. Most recent bug-fix commits are persistence/sync issues from this fork. BLUEPRINT calls for unifying it (one API client + offline queue); until then, **any data feature must be implemented on both paths.**
- **Streaks are computed client-side** by walking `loggedDate` strings backward. No server-side aggregation yet.

## Backend (`grid-backend/`)

- **Express 4 + Prisma 5 + Postgres.** Entry points both funnel through `src/app.js`:
  - `src/index.js` — local long-lived server (`npm start`).
  - `api/index.js` — Vercel serverless export.
- **Auth is solid:** passport + Google OAuth + JWT in httpOnly cookie (`grid_token`), bcrypt (12 rounds), constant-time login compare. `requireAuth` middleware (`src/middleware/auth.js`) reads cookie or `Authorization: Bearer`. All data routes call `router.use(requireAuth)`.
- **Routes** (`src/routes/`): `auth`, `profile`, `habits`, `gym`, `finance`, `calendar`, `projects`, `resume` — mounted under `/api/*`.
- **Lib** (`src/lib/`): `db.js` (Prisma client), `jwt.js`, `passport.js`.
- **Prisma models** (`prisma/schema.prisma`): `User`, `UserProfile`, `Habit` + `HabitLog`, `GymSplit` + `GymLog`, `BudgetCategory` + `Transaction`, `CalendarEvent`, `Project`, `ResumeData`. Habit logs are binary (`completed: Boolean`, unique `(habitId, loggedDate)`).

### Security posture (hardened — keep it this way)
- `helmet` (CORP relaxed to cross-origin for the API), `express-rate-limit` (global 300/15min + strict 10/15min on auth), `zod` validation, 1mb body cap, `trust proxy = 1`.
- Validation lives in `src/middleware/validate.js` (reusable `validate(schema)` — strips unknown keys, surfaces friendly errors). Limiters in `src/middleware/security.js`.
- **When adding routes that take user input, validate them with `validate(...)`** following the auth-route pattern.
- ⚠️ Supabase connection strings: `DATABASE_URL` = transaction pooler (6543), `DIRECT_URL` = session pooler (5432). The legacy `db.<ref>.supabase.co` direct host is retired and no longer resolves.
- ⚠️ On Vercel, the rate-limiter's in-memory store is per-instance / resets on cold start. For hard guarantees, move to a shared store (Upstash Redis + `rate-limit-redis`).

## Commands (run inside `grid-backend/`)

```bash
npm run dev          # nodemon local server (port 4000), /health to check
npm start            # production server
npm run db:migrate   # prisma migrate dev (create + apply migration)
npm run db:deploy    # prisma migrate deploy (production)
npm run db:studio    # Prisma Studio
```
Frontend has no build — open `index.html` (Live Server) or it's served statically by Vercel.

## Conventions

- Backend style: aligned `const` requires, `// ─── Section ───` banner comments, `next(err)` to the global handler in `src/app.js`. Match it.
- UI: numbers in monospace with `tabular-nums`; carbon-gray surfaces, single green accent. See BLUEPRINT for the exact token scale before adding UI.
- Commit messages are lowercase, scope-prefixed (e.g. `gym: ...`, `fix cors, ...`).
