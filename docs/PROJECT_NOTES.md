# Project Notes (saved from the planning conversation, 2026-10-05)

## 1. Claude-native calorie tracker: review and build plan

**Verdict:** viable as a free personal tool for Claude users, not a competitor to Cal AI or MyFitnessPal. The weak point is the data layer.

**Problems found**
- Chat-as-database: the full food list is re-embedded on every log, so cost and drift grow, and long chats hit limits.
- `localStorage` may not work inside claude.ai artifacts; the persistent-storage option needs a published artifact. Test before building.
- Save/restore is untested and fails only when it's needed.
- "One decisive number" for photos hides real uncertainty.
- The interview prompt is long; some runs will miss details.

**Phases**
0. De-risk: storage test, save/restore round trip, photo-estimate check on 5 known meals.
1. Setup interview artifact (11 one-per-screen questions, validation).
2. Plan engine: Mifflin-St Jeor BMR, TDEE multipliers, calorie floors (1,200 / 1,500), macros, water, timeline sanity check, PROJECT INSTRUCTIONS block.
3. Tracker UI with fake data (rings, water, 7-day chart, diary, light/dark).
4. Data layer: day-keyed model, persistence, date rollover, delta updates, versioned save code.
5. Chat logging and accuracy: text and photo logging, web lookup for packaged foods, confidence flags.
6. Hardening: 14-day simulated run, "chat full" recovery path, final guide.

**What it does when finished:** 5-minute setup, text or photo logging, one dashboard (calories, macros, water, 7-day history, diary), a save code, no subscription. Not included: barcode scan, live cross-device sync, lab accuracy.

## 2. Health website idea: feasibility

- Possible and cheap. Pipeline: Fitbit Air, Google Health, backend, database, dashboard.
- Costs: Vercel and Supabase free tiers, Google Health API free, domain optional (about $10-15 a year), AI insights via API about $1-3 a month or $0.
- Claude Pro and Gemini Pro subscriptions do not include API access; the site would need a separate API key. Start with no AI in the site.
- Risks to verify: the legacy Fitbit Web API is being replaced by the Google Health API; Google refresh tokens can expire after 7 days for unverified apps in testing mode; some metrics (Readiness, Cardio Load) may not be exposed.
- Strava: not connected. Runs come from manual file uploads (.fit, .gpx, .tcx, activities.csv), with duplicate detection.
- Gym: reuse the existing Grid gym module (GymSplit, GymLog, `page-workout`).

## 3. Decisions made
- Personal use only, Fitbit Air.
- 8 pages: Overview, Heart & Vitals, Sleep, Activity & Load, Recovery & Insights, Runs, Gym, Nutrition (with meal-preset quick log: `S1`, `2x S1`, `S1 dinner`).
- New pages are built as separate script files (`js/health/*.js`, `css/health.css`), not inside the 650KB `index.html`.
- Stitch demo UI first, then Phase 1 de-risk spikes.

## 4. Files in this folder
- `HEALTH_EXPANSION_PLAN.md`: full phased build plan for the Grid health expansion.
- `STITCH_PROMPT_GRID_HEALTH.md`: the prompt to paste into Google Stitch.
- `PROJECT_NOTES.md`: this file.

Source project: `../Grid` (read only; nothing was changed there).
