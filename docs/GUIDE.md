# Grid: the three new pages, and getting back into the site

Written 2026-10-06. Plain-language guide to **Runs**, **Nutrition** and **Deficit**, what the full check of the site found, and what is left to do (yours and mine) before you start using it again.

---

## 1. Before you start again

### What I need from you first
1. **Say yes to the deploy.** Everything below is built and tested on my machine but not live yet. One change needs a small database update on the live site (two new columns: project progress, and the gym exercise list). With your OK I will, in this order: update the live database, push the code, deploy the site. It takes a few minutes and nothing you have saved is touched.

### Then, on your side (about 15 minutes)
1. **Open the site on the device where you set your gym PRs, and visit the Gym page once.** Until now your exercise list and the PRs you typed in were saved only in that one browser. The first visit after the update copies them to your account, so your other devices get them too.
2. **Weekly timetable: look for blocks you didn't add.** New accounts used to start with a sample week (SLEEP, ALGOS_LAB, PHYSICS_SIM…), and the first edit saved all of it to the account. If you see any of those, click the block and press delete.
3. **Weekly timetable: re-check your end times.** The block editor used to ignore the end time when nothing came straight after a block, so "Lecture 9–11" ran on until the next block. That's fixed for any block you save from now on. Open one or two days and fix any block that looks too long.
4. **Nutrition → SET UP MY PLAN.** Age, height, weight, goal. Deficit uses it to fill in days you don't type a burn number.
5. **Résumé → PDF GENERATOR → HEADER & SKILLS.** Add phone, LinkedIn, GitHub and the four skills rows. Then edit each entry once to add its **Organisation** (company / degree / tech stack), **Location**, and **bullet points, one per line**.
6. **Runs: import your Strava history** (steps in section 2).
7. **Log out and back in once on each device.** This picks up the new version cleanly.

---

## 2. Runs

**What it's for:** everything about your running, from files you export from Strava. Grid doesn't connect to Strava directly; you give it the files.

**Getting your runs in**
- **Whole history:** on strava.com go to *Settings → My Account → Download or Delete Your Account → Request your archive*. Strava emails you a zip. Drop that zip onto the Runs import box (or click the box and choose it).
- **One run:** on the activity page, open the **⋯** menu → *Export GPX* (or *Export Original*), then drop the file in.
- Accepted files: `.fit`, `.gpx`, `.tcx` (also `.gz` versions), the Strava `.zip`, and `activities.csv`.
- Everything is read **in your browser**; only the finished numbers are saved to your account.
- **Duplicates are skipped automatically**, so importing the same archive twice is safe.
- Rides, walks and other non-runs are skipped, and the import tells you why for each file.

**What it works out for every run**
- Distance, moving time (pauses removed), elapsed time, pace.
- **Kilometre splits.** Only full kilometres are listed; the last part-kilometre isn't shown as its own split.
- **Best efforts** inside the run: 1 km, 1 mile, 3 km, 5 km, 10 km, half marathon.
- Heart-rate zones, elevation gain, cadence, and the route.

**The overview**
- Month / Year switch, with this period compared to the last one.
- Distance by month, a calendar heatmap, this year vs last year, pace by month.
- Weekly distance with a 4-week average, plus a warning if you ramp up too fast.
- Run-length spread, which weekdays and times you run, heart-rate zones, a pace vs heart-rate trend.
- **Shoe mileage** against a 700 km limit.
- **Personal bests** with a timeline (click a distance to see how it improved).
- A sortable list of all runs, and a CSV download.

**One run (click it in the list)**
- Route map coloured by pace, splits table, and linked pace / heart-rate / elevation / cadence charts.
- **EDIT** the name or the shoes. **COMPARE** with another run of similar length. **DELETE**.

---

## 3. Nutrition

**What it's for:** logging food fast, and seeing calories, macros and water against your plan.

**Quick log (the fastest way)**
- You save your regular meals as **presets** with a short code, e.g. `B1` = Oats & Whey.
- Then type the code in the Quick Log bar and press Enter:
  - `B1` logs one serving.
  - `2x B1` or `B1 x2` logs two.
  - `B1 dinner` or `dinner 2x B1` puts it in a specific meal.
- Suggestions appear as you type. The confirmation has **UNDO**.
- An unknown code offers to create that preset on the spot.
- **ADD 10 STARTER PRESETS** gives you ten common meals to edit into your own.

**Presets**
- Create, edit, duplicate, delete, mark favourites.
- If the calories don't match the protein / carbs / fat you entered (off by more than 10%), it warns you.

**Diary**
- Breakfast / Lunch / Dinner / Snacks for the chosen day; move with PREV / TODAY / NEXT.
- Edit any entry (changing the quantity rescales the numbers), or delete it.
- **COPY PREVIOUS DAY** for days you eat the same thing.
- **+ CUSTOM FOOD** for one-offs, which you can also save as a preset.
- **Water**: +250 ml / −250 ml.
- CSV download.

**Your plan (SET UP MY PLAN)**
- From your sex, age, height, weight, activity level, goal and pace it calculates:
  - daily calorie target (standard Mifflin-St Jeor formula, never below 1,500 kcal for men or 1,200 for women),
  - protein, carbs and fat,
  - a water goal,
  - roughly how many weeks to your goal weight.
- You can log food without a plan; the plan just adds the targets.

**Trends (7 or 30 days)**
- Calories vs target (green when within 5%), protein vs target, calories in vs out (the "out" comes from Deficit), macro split.

---

## 4. Deficit

**What it's for:** whether you're really eating less than you burn, day by day, and whether your weight agrees.

**How it decides**
- **Deficit = calories burned − calories eaten.**
- **Eaten** comes from your Nutrition diary.
- **Burned** is the daily total you type in from the Google Health app (**+ LOG BURN**, or click any burn number). On days you don't type one, it uses your plan's daily burn estimate and marks that day **EST**. A switch lets you count only the days you typed in.
- **It only counts days it can trust.** Today is left out until it's over. Days with no food logged, or under 800 kcal eaten, are skipped (they'd show a fake huge deficit). Each skipped day shows the reason.

**What you see**
- Range: 14 / 30 / 60 / 90 days.
- Tiles: average deficit vs what your plan expects, total deficit and roughly how many kg that is (7,700 kcal ≈ 1 kg), weight change vs predicted, your streak.
- Charts: burned vs eaten, daily deficit, running total vs predicted and actual weight.
- A weekly table, recent days, and a CSV download.
- A **Get started** checklist (plan, food on 3+ days, burn, two weigh-ins, a photo).

**Weight**
- Log your weight from the Weight card; it shows the trend and checks it against your deficit.

**Progress photos**
- **+ ADD PHOTOS**. Pictures are shrunk before upload and saved privately to your account.
- Pick two photos to compare side by side or with a slider, with the days and kg between them.

---

## 5. What the full check found

I tested every page in demo mode, then signed up a throwaway account on a private copy of the site (never your real account or the live database). On that copy I added data on every page, wiped the browser completely (like a new phone, or Safari clearing storage), logged back in and checked everything came back.

**Working, nothing to fix:** Habits (ticks save and come back), Weekly tasks, Finances budget and expenses, Gym split, workout logging and the `(CHEST)` muscle tags, Runs import, Nutrition (presets, quick log, water, plan maths checked by hand), Deficit (burn, weight, photos), Work page study sessions, Résumé, sign-up and login. All 12 pages load in demo mode with no errors.

**Fixed (live once you OK the deploy):**

| Page | What was wrong | Now |
|---|---|---|
| Résumé | PDF didn't follow your `cv_format.pdf` | Matches it: same font, sizes, spacing and layout, checked line by line against your PDF (within about a third of a millimetre) |
| Résumé | Tick-boxes reset every visit; CGPA only saved in one browser | Both saved to your account |
| Gym | Exercise list and typed-in PRs only saved in one browser | Saved to your account; PRs are also rebuilt from your logged workouts |
| Gym | New accounts started with a sample split ("HYPERTROPHY 2.0") | New accounts start empty |
| Weekly | New accounts started with a sample week, which the first edit saved to the account | New accounts start empty |
| Weekly + Home | End times were lost, so blocks ran into free time (the "boxes don't match my timetable" problem) | End times kept everywhere; free time stays free |
| Weekly | FREE TIME counted blocks, not hours | Counts hours |
| Mindgraph | Every account was padded with ~300 made-up nodes | Your graph shows only your data; the demo keeps its full look |
| Work | Editing a project failed, and progress went back to 0% after a reload | Edits save; progress is kept |
| Finances | Budget gauge ignored expenses filed under a sector with no plan | Counts every expense this month |
| Calendar | No way to delete an entry | ✕ on each entry in the day panel |
| Calendar | Event times relied on the server's timezone | Stored the same way everywhere |
| Several | Dates used UTC, so anything logged before 5:30 am landed on the previous day, and the activity heatmap was shifted a day | Local dates everywhere |
| Sign-up | Last name was dropped | Full name saved |
| All | Long pop-up forms pushed SAVE off small screens | Forms scroll |
| Server | Several save routes accepted any fields (could even move a record to another account) and error messages exposed internal details | Every route checks its input; errors are plain |

**Known limits (not bugs):**
- Burn is typed in by hand; nothing reads your watch automatically.
- Run splits list full kilometres only.
- The habit form's "Target Goal Score" box isn't used for anything yet.
- In demo mode, changes vanish when you reload; that's on purpose.
