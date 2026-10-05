# GRID HEALTH: Stitch Prompt (copy everything below the line)

---

## YOUR JOB

Build a complete, clickable **frontend demo** of the **Health expansion of GRID**, a personal dashboard for one user. It is an 8-page web app with a persistent left sidebar. Use **hardcoded realistic mock data only**; no backend. Every tab, toggle, range selector, form and button must work with JavaScript state. Charts must be real (SVG or canvas) with hover tooltips. Desktop-first (1440px), usable down to 390px.

Pages: (1) Overview, (2) Heart & Vitals, (3) Sleep, (4) Activity & Load, (5) Recovery & Insights, (6) Runs, (7) Gym, (8) Nutrition.

---

## DESIGN SYSTEM (apply everywhere, no exceptions)

**Aesthetic:** dark carbon-green, cyber-industrial. Data-dense but calm.

```
Page background:    #080808
Panel background:   #0f0f0f
Raised card:        #141414
Hover / wells:      #1c1c1c
Card fill:          rgba(255,255,255,0.03)
Card border:        1px solid rgba(255,255,255,0.06)
Primary accent:     #76b372  (green)
Accent dim:         rgba(118,179,114,0.12)
Accent glow:        rgba(118,179,114,0.25)
Green scale:        #172619 (empty) #3b6839 (partial) #76b372 (base) #94d68f (hover) #a5f79e (neon / PR / streak)
Text:               #f0f0f0 / dim rgba(240,240,240,0.65) / muted rgba(240,240,240,0.38)
Semantic:           red #ef4444, orange #f97316, blue #3b82f6, teal #14b8a6, purple #9b59b6, pink #ff4d8f
```

**Typography:** `Space Mono`, monospace. All labels UPPERCASE with 1.5px letter-spacing, 9-11px. Metric values 28-40px bold, `font-variant-numeric: tabular-nums`. Page titles 22px bold.

**Cards:** radius 8-12px, padding 16-20px. On hover: border turns green, card lifts 2-4px with a soft shadow, 0.2s ease. Card header pattern: tiny green uppercase label + optional info icon + optional range pill on the right.

**Layout shell:**
- Sidebar 220px, background #0d0d0d, right border hairline. Top: "GRID" wordmark and a small green user badge. Nav items with line icons: inactive muted, active has green-dim background and a 2px green left border. Group the health pages under a collapsible **HEALTH** label: Overview, Heart & Vitals, Sleep, Activity & Load, Recovery, then **TRAINING**: Runs, Gym, then **FUEL**: Nutrition.
- Top bar 56px on every page: page title, a **date navigator** (Prev / Today / Next, segmented pill), and a **range selector** (1D · 7D · 30D · 90D · 1Y) where relevant.
- A small status chip in the top bar: green dot + "SYNCED 06:42 · FITBIT AIR" (clicking it shows a popover with last-sync time and a "SYNC NOW" button that shows a spinner for 1s).
- Footer on every page: "General guidance, not medical advice."

**Shared components to reuse:** stat tile (label, big value, unit, delta arrow with % vs previous period, sparkline), ring/gauge, bar chart, line chart with a shaded "personal baseline band," heatmap calendar, stacked bar, hypnogram, segmented tabs, data table with sortable headers, toast, modal.

**Interaction rules:** every chart has a hover tooltip with exact values; range pills re-render charts with different mock data; deltas are green when good, orange or red when bad (note: lower resting HR is good, lower HRV is bad).

---

## PAGE 1: OVERVIEW (main dashboard)

Title: "TODAY". Greeting line with the user's first name ("GOOD MORNING, ARYAV") and the date.

Layout, top to bottom:
1. **Hero row (4 tiles):** Readiness (ring, 78, label "PRIMED"), Sleep Score (ring, 84, "7H 42M"), Cardio Load today (value 62, small bar showing position inside the target range 45-85), Calories (ring, 1,640 of 2,350 eaten, "710 LEFT").
2. **Today's Call card** (wide, green-edge glow): one headline recommendation, e.g. "GREEN LIGHT: HARD SESSION OK. Readiness 78, HRV +6% above baseline, sleep 7h42." Under it three small reason chips and a "SEE WHY" link to the Recovery page.
3. **Vitals strip (6 mini tiles with sparklines):** Resting HR 54 bpm, HRV 62 ms, SpO2 96%, Skin temp +0.2°C, Breathing 14.8 /min, Steps 8,412.
4. **7-day cross-source timeline:** a single chart with one row per day showing a bar for sleep hours, a dot sized by cardio load, a run icon with distance on days with runs, a dumbbell icon on gym days, and a small calorie-vs-target indicator. Hover shows the day's full summary.
5. **Two-column row:** left "LAST RUN" card (date, distance, pace, avg HR, tiny route map) linking to Runs; right "TODAY'S LIFT" card (planned day name, exercises list, last-session comparison, "START LOGGING" button) linking to Gym.
6. **Streaks and records row:** current logging streak, longest run this month, latest PR (neon green badge, e.g. "BENCH PRESS 85 KG x 5").

---

## PAGE 2: HEART & VITALS

Tabs/sections on one scrolling page, with a range selector.

1. **Hero:** Resting HR today (big number), 30-day delta, and a line chart of resting HR with a shaded personal baseline band (mean ± 1 SD). Out-of-band days marked with an orange dot.
2. **24h Heart Rate:** line chart of heart rate across the day with background shading for sleep (blue-purple tint) and workout windows (green tint), min/avg/max stats.
3. **HRV card:** nightly HRV (ms) trend with baseline band and a plain-English status line ("ABOVE BASELINE: GOOD RECOVERY"). Include a short "what this means" collapsible.
4. **Heart rate zones:** stacked bar per day (Out of Range, Fat Burn, Cardio, Peak minutes) and a donut for the selected period.
5. **Blood oxygen (SpO2):** overnight min / avg / max, a multi-day trend, a 95% reference line, low-value nights flagged.
6. **Skin temperature variation:** bar chart of nightly deviation from baseline (positive orange, negative blue), baseline at zero.
7. **Breathing rate:** nightly average line chart with baseline band.
8. **Notifications log:** table of High/Low HR alerts and Irregular Rhythm screenings with date, type, value, and status (e.g. "NO IRREGULAR RHYTHM DETECTED, 28 NIGHTS"). Empty-state style for none.
9. **Baseline comparison table:** each vital, today's value, 30-day normal range, status chip (IN RANGE / WATCH).

---

## PAGE 3: SLEEP

1. **Hero:** sleep score ring (84), total time asleep (7h 42m), time in bed, efficiency %, bedtime to wake time.
2. **Hypnogram:** step chart for last night across the time axis with Awake / REM / Light / Deep bands in distinct colors (awake orange, REM purple, light blue, deep deep-blue/teal). Hover shows stage and time.
3. **Stage breakdown:** horizontal stacked bar with minutes and % per stage and a "typical range" tick for each.
4. **Score breakdown:** three bars (Duration, Quality/Deep+REM, Restoration) with short explanations.
5. **Sleeping heart rate & restoration:** line of overnight HR with a dashed daytime resting baseline and the "dip" % highlighted.
6. **Overnight vitals mini-row:** HRV, SpO2, breathing rate, skin temp for last night.
7. **Sleep consistency:** scatter or range-bar chart of bedtime and wake time per night for 14/30 days, a consistency score, and a "social jet lag" style note.
8. **Trends:** 30-day charts for duration vs goal line (8h), score, deep minutes, REM minutes.
9. **Sleep debt tracker:** 7-day running debt vs goal, in hours.
10. **History table:** one row per night with score, duration, deep, REM, awake count; clicking a row loads that night in the hypnogram.

---

## PAGE 4: ACTIVITY & LOAD

1. **Hero tiles:** Steps (ring vs 10,000 goal), Distance (km), Total calories burned (with BMR vs active split bar), Active Zone Minutes (ring vs 150/week).
2. **Cardio Load:** daily load bars over 30 days with a shaded **target range band**, today's load highlighted, and an "acute vs chronic" ratio chip (e.g. 1.1 = BALANCED). Explain overreaching vs undertraining in one line.
3. **Active Zone Minutes:** weekly stacked bars (moderate = 1x, vigorous = 2x) with a weekly goal line.
4. **Hourly steps:** 24-bar chart for the selected day, with the 250-steps-per-hour goal line and hours hitting it marked green.
5. **Sedentary time:** hourly strip heatmap showing active vs stationary hours and total sedentary hours.
6. **Steps history:** 30-day bar chart with a 7-day moving average line.
7. **Auto-detected exercises:** table/list with icon (run, walk, bike, swim, gym), start time, duration, avg HR, calories, load, and a small zone bar. Rows expand for details.
8. **Weekly summary:** a card comparing this week to last week for steps, AZM, load, and calories.

---

## PAGE 5: RECOVERY & INSIGHTS

1. **Readiness gauge:** large semicircle gauge 0-100, color bands (red, orange, green), current 78 with label.
2. **Contributing factors:** four horizontal bars (Cardio Load balance, Sleep, HRV, Resting HR) with "+/-" effect on the score and a one-line explanation each.
3. **Target Cardio Load range for today:** a range slider-style visual showing recommended window 45-85, what has been done so far, and suggested session types (e.g. "ZONE 2 RUN 40-50 MIN" or "HEAVY LIFT DAY").
4. **14-day readiness history:** line chart with the day's contributing tags.
5. **Multi-week baseline charts (2x2 grid):** SpO2, Resting HR, HRV, Skin Temp each with a shaded personal normal range, 8-week window, out-of-range points flagged.
6. **Early-warning card:** pattern detection e.g. "RHR +4 bpm for 3 days, HRV -12%. POSSIBLE FATIGUE OR ILLNESS. CONSIDER A REST DAY." Show a calm "ALL CLEAR" alternate state with a toggle to preview both.
7. **Weekly insight summary:** a short written paragraph card plus 3 bullet takeaways (clearly labelled as generated guidance).
8. **Recovery vs training overlay:** chart showing readiness line against run distance and gym volume bars, so the user can see how training affected next-day recovery.

---

## PAGE 6: RUNS (Strava file imports)

**Top bar extras:** **UPLOAD RUNS** button and a toggle between **MONTH** and **YEAR** overview.

1. **Upload zone (collapsible card):** drag-and-drop area accepting `.fit`, `.gpx`, `.tcx`, `.csv`, `.zip` ("Drop your Strava export here"). Mock the flow: after "dropping," show a progress list per file and a result summary ("14 IMPORTED · 3 DUPLICATES SKIPPED · 1 FAILED: unreadable file"). Duplicates are detected automatically.
2. **Period selector:** Month dropdown or Year dropdown plus an **ALL TIME** option.
3. **Summary tiles (for the selected period):** total distance, number of runs, total moving time, avg pace, avg HR, total elevation gain, longest run, calories, each with a delta vs the previous period.
4. **Monthly overview (month mode):**
   - Calendar heatmap for the month with a dot sized by distance on each run day; click a day to open that run.
   - Weekly mileage bar chart (4-5 weeks).
   - Pace trend line over the month with run markers.
   - Distance-by-run list.
5. **Yearly overview (year mode):**
   - 12-bar monthly distance chart with the monthly average line and a toggle for distance / time / runs / elevation.
   - **GitHub-style year heatmap** (52 weeks x 7 days) in green shades by distance.
   - **Year-over-year comparison:** lines for cumulative distance across the year, this year vs last year (two colors) with the gap annotated.
   - Pace progression: monthly average pace line with a trendline.
   - Run-distance distribution histogram (0-3, 3-5, 5-8, 8-12, 12-21, 21+ km).
   - Day-of-week and time-of-day distribution charts.
   - Monthly table: month, runs, distance, time, avg pace, avg HR, elevation, with sortable headers and a best-month highlight.
6. **Personal bests:** cards for fastest 1K, 1 mile, 5K, 10K, half marathon, longest run, biggest elevation run, each with date, time, pace, and a small "PR" neon badge when set this year. A PR progression chart for the selected distance.
7. **Pace vs heart rate efficiency:** scatter plot (pace x avg HR) colored by month, showing fitness trend (same pace at lower HR over time).
8. **Training load:** weekly distance with a 4-week rolling average and a "ramp rate" warning chip when weekly mileage jumps over 10%.
9. **HR zone distribution** donut for the period.
10. **Gear:** shoe mileage list with progress bars toward a 700 km retirement mark.
11. **Run list (table):** date, name, distance, time, pace, avg HR, elevation, cadence; sortable, filterable by distance range and date; click a row to open the **Run Detail** view.

**RUN DETAIL view (full-page or large modal):**
- Header: date, name, key stats (distance, moving vs elapsed time, avg and best pace, avg and max HR, cadence, elevation gain, calories).
- A **route map** (stylized dark map with the route line colored by pace or HR, start and finish markers; a plain SVG path on a dark grid is fine).
- Linked charts sharing one hover cursor along the distance axis: pace, heart rate, elevation, cadence.
- **Splits table** per km: pace, avg HR, elevation change, with fastest split highlighted green and slowest orange, plus a negative-split / positive-split indicator.
- HR zones bar, best efforts within the run (fastest 1K, 5K segment), and weather note (e.g. "18°C, clear").
- Compare button: overlay this run against a previous run of similar distance.

---

## PAGE 7: GYM (existing module, extended)

Keep the existing structure and visual language: three sub-tabs in the top bar plus action buttons **EDIT WEEKLY SPLIT** and **STITCH TO CALENDAR**.

**Tab 1: WEEKLY SPLIT**
- Header: "CURRENT OPERATIONAL SPLIT: HYPERTROPHY 2.0", cycle length, next recalibration countdown.
- **7 day columns**, each with day title (e.g. PUSH, PULL, LEGS, REST...), muscle chips, exercise list with target sets x reps, and a completion state (done, today, upcoming).
- **Volume telemetry card:** total weekly sets with delta, **recovery score pulled from the Recovery page**, and a progression quota bar.
- **Workout session logger:** day selector, then one card per exercise with set rows (reps, weight in kg, a done checkbox), an "add set" button, last-session values shown as ghost text, a rest timer button, and a **COMMIT SESSION LOG** button that shows a success toast and a PR celebration if any set beats a record.

**Tab 2: MUSCLE GROWTH**
- Header "MUSCLE GROWTH INTELLIGENCE" with buttons: ADD MUSCLE GROUP, + ADD EXERCISE, EXPORT DATA.
- **Body map** (simple front/back figure or muscle chips) colored by weekly sets, with a target range per muscle (e.g. 10-20 sets) and under/over indicators.
- Per-muscle cards: weekly sets, volume load (kg), frequency, last trained, trend sparkline.
- **Exercise progression:** pick any exercise, see a line chart of top set weight and estimated 1RM over 12 weeks, with PR points marked neon green. Plateau warning chip if no progress in 4 weeks.

**Tab 3: OVERVIEW & LOG**
- Totals tiles: sessions this month, total volume, total sets, avg session duration, current streak.
- Training calendar heatmap (month) colored by the split day type.
- **Personal records board:** table of lifts with current PR (weight x reps), estimated 1RM, date, and previous PR.
- **Recovery overlay:** chart of gym volume per session against the next-morning readiness score.
- **Log diary:** reverse-chronological list of sessions; expand to see every exercise and set; edit and delete buttons.

---

## PAGE 8: NUTRITION

1. **Hero row:** calorie ring (1,640 of 2,350, "710 LEFT"), three macro rings (Protein 118/160 g blue, Carbs 170/250 g teal, Fat 52/70 g orange), water row with +/- buttons and fill bar (1.6 / 3.0 L).
2. **QUICK LOG BAR (prominent, full-width, keyboard-first):** a single input with a green focus glow and a placeholder like `type a code or food… e.g. S1, 2x S1, SHAKE dinner`. Behavior:
   - Typing shows an autocomplete dropdown of matching preset codes and names with their macros.
   - `S1` logs that preset once into the current meal slot (auto-picked by time of day).
   - `2x S1` or `S1 x2` multiplies the macros.
   - `S1 dinner` assigns the slot.
   - Pressing Enter logs instantly, animates the rings and counters, and shows a toast: "LOGGED S1: PROTEIN BAR · 210 KCAL · P 20 C 22 F 7" with an UNDO link.
   - An unknown code shows "NO PRESET 'XY'. CREATE IT?" which opens the preset form prefilled.
3. **MEAL PRESETS manager (card with its own tab, or a drawer):**
   - A grid/table of presets. Mock data: `B1` Oats & Whey (410 kcal, P 32 C 48 F 9), `B2` 3 Egg Toast (380, P 24 C 28 F 18), `S1` Protein Bar (210, P 20 C 22 F 7), `S2` Greek Yogurt & Fruit (180, P 17 C 22 F 2), `S3` Peanut Butter Banana (290, P 9 C 38 F 12), `L1` Chicken Rice Bowl (620, P 48 C 70 F 14), `L2` Dal Rice Combo (580, P 22 C 92 F 11), `D1` Paneer Wrap (540, P 28 C 52 F 24), `SHAKE` Post-workout Shake (260, P 40 C 18 F 3), `COFFEE` Black Coffee (5, P 0 C 1 F 0).
   - Each row: code (monospace badge), name, kcal, P/C/F, default serving, color dot, usage count, and Edit / Duplicate / Delete actions.
   - **+ NEW PRESET** opens a form: code (uppercase, unique check with inline error), name, serving, calories, protein, carbs, fat, optional meal slot default, color. Auto-calculates calories from macros as a hint (4/4/9) and warns when they disagree by more than 10%.
   - Search and sort by most used, with a "FAVORITES" star.
4. **Diary:** grouped Breakfast / Lunch / Dinner / Snacks with line icons and colored dots; each entry shows name (with a small code badge if it came from a preset), serving, kcal, P/C/F, a delete X, and an edit action. Per-meal subtotal on each group header.
5. **Add custom food** button: manual form for one-off foods (name, serving, macros), with an option to **SAVE AS PRESET**.
6. **Trends:** 7-day bar chart of calories vs target (bars colored green within ±5%, orange over, muted under); toggle to 30 days; average intake; macro split donut (% P/C/F); protein-per-day line with target.
7. **Targets and calculations card:** shows BMR, TDEE, daily target, macro grams, water target, goal weight and the estimated timeline, plus an **EDIT PLAN** drawer with inputs (age, sex, height, weight, activity level, goal, pace) that recalculates live using Mifflin-St Jeor and standard activity multipliers, with the formula shown in a "METHODOLOGY" collapsible. Floors: never below 1,500 kcal (men) or 1,200 kcal (women).
8. **Calories in vs out:** chart combining intake with total burn from the Activity page to show daily net balance and a weekly net total.
9. **Weight log (optional card):** quick weight entry and a trend line toward goal.
10. Footer disclaimer: "I'm an AI-assisted tool, not a medical professional. Check with your physician before starting any new diet."

---

## MOCK DATA GUIDANCE

Use one coherent persona and consistent numbers across pages: male, 21, 72 kg, goal lean-bulk/maintain. Resting HR 52-58, HRV 55-70 ms, SpO2 95-98%, sleep 6.5-8.2 h with scores 70-90, steps 6k-14k, 3-4 runs/week (5-12 km, pace 5:20-6:10 /km, avg HR 150-165), 4 gym days/week. Provide 12 months of run history so the yearly views are full, and 8 weeks of health history. Weekday mornings are slightly worse recovery after hard days. Make the numbers on the Overview match the detail pages exactly.

## QUALITY BAR

- No lorem ipsum, no placeholder buttons, no broken links. Every nav item opens a fully built page.
- Consistent spacing, aligned grids, readable at a glance; dense but never cluttered.
- Smooth transitions between pages, count-up animations on key numbers, skeleton loaders for 300ms on range changes.
- Accessible contrast, visible focus states, keyboard support for the quick-log bar (arrow keys in autocomplete, Enter to log, Esc to clear).
