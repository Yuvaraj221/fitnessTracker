# FORGE — Architecture & Design

> **Build. Track. Evolve.** A local-first fitness tracker whose single source of truth is a folder of CSV files.

This document covers the six pre-implementation deliverables: architecture, folder structure, CSV schema, wireframes, component breakdown and design system.

---

## 1. Application architecture

```
┌──────────────────────────────┐        HTTP /api (JSON)        ┌──────────────────────────────┐
│  Browser — React + Vite      │ ─────────────────────────────▶ │  Node — Express API          │
│                              │                                │                              │
│  pages/  ─ Dashboard, ...    │ ◀───── { data, unlocked } ──── │  routes/   validation (zod)  │
│  TanStack Query cache        │                                │  services/ repo, backup,     │
│  Recharts, Tailwind          │                                │            achievements      │
└──────────────┬───────────────┘                                │  csv/store  ◀── only file I/O│
               │                                                └──────────────┬───────────────┘
               │      @forge/shared  (pure TypeScript, used by both)          │
               └──────── types · dates · analytics · achievement engine ──────┤
                                                                              ▼
                                                      data/*.csv  (source of truth)
                                                      backups/<timestamp>/*.csv
```

**Request lifecycle for every change** (spec §13):

1. The form validates input on the client (blur-first, inline errors).
2. The client sends JSON to the API (`POST/PUT/DELETE`).
3. The API validates again with zod, then runs a **transaction** under a process-wide write lock:
   read → modify → write temp files → `fsync` → atomic `rename` over the originals.
   Destructive operations take a backup of all CSVs first.
4. The achievement engine re-evaluates rules against the fresh data and appends new unlocks to `achievements.csv`.
5. The API responds `{ data, unlocked }`. The client invalidates affected queries, so dashboards and charts recompute, and shows toasts for successes and newly unlocked achievements.

**Storage drivers.** Only the storage layer (`backend/src/storage/`) touches bytes.
- `FilesystemDriver` stores `data/*.csv` and `backups/` on disk. It is used locally, and on Vercel without Blob, where it points at `/tmp` and is flagged as temporary.
- `BlobDriver` stores the same files in Vercel Blob. It is chosen automatically when `BLOB_READ_WRITE_TOKEN` is set. Writes are conditional on each file's ETag, so two serverless instances can never silently overwrite each other; a lost race returns HTTP 409 and nothing is written.
- On Vercel, `api/index.mjs` wraps the bundled Express app (`backend/dist/vercel.mjs`). Each instance initialises lazily on its first request.

**Key decisions**

| Decision | Why |
|---|---|
| Backend owns all file I/O | The browser can't, and shouldn't, write project files. `backend/src/csv/store.ts` is the only code that reads or writes tables, through a pluggable storage driver. |
| One global write lock (+ ETags on Vercel) | A single user writes rarely; serialising writes in-process removes interleaving. Across serverless instances, ETag-conditional writes stop lost updates. |
| Read from disk on every request (mtime-cached) | Nothing depends on in-memory state, and hand edits to a CSV are picked up without a restart. |
| Unknown CSV columns are preserved | If you add your own column in a spreadsheet, FORGE keeps it on every write. |
| `shared/` package for analytics | The dashboard (client) and the achievement engine (server) compute PRs, streaks and volume with the *same* code, so numbers never disagree. |
| Canonical units (kg, cm) | Unit preference is display-only; data never needs migrating when you switch to lbs/inches. |
| Analytics computed client-side | Data volumes are small (years of logs = a few MB), so filtering and charting in the browser keeps date-range changes instant and the API simple. |

### API surface

| Method & path | Purpose |
|---|---|
| `GET /api/health` | Liveness, storage mode and whether an access key is required (public) |
| `GET/POST /api/workouts`, `GET/PUT/DELETE /api/workouts/:id` | Workouts with nested exercises → sets |
| `GET/POST /api/meals`, `PUT/DELETE /api/meals/:id` | Food entries (`?from=&to=` filter) |
| `GET/POST /api/body-metrics`, `PUT/DELETE /api/body-metrics/:id` | Body measurements |
| `GET/PUT /api/settings` | Goals & preferences (partial update) |
| `GET /api/achievements` | Rules, unlocks, per-rule progress, XP, level, titles |
| `POST /api/achievements/seen` · `POST /api/achievements/evaluate` | Clear the badge counter · force a re-evaluation |
| `GET /api/data/info` | File list + row counts |
| `GET/POST /api/data/backups`, `POST /api/data/backups/:id/restore`, `DELETE /api/data/backups/:id` | Backups |
| `GET /api/data/export` · `GET /api/data/export/:table` | Zip of every CSV · a single CSV |
| `POST /api/data/import` | Restore from an exported zip |
| `DELETE /api/data/sample-data` | Remove demo rows |

---

## 2. Folder structure

```
forge/
├── package.json              npm workspaces + `npm run dev` (runs API + web together)
├── vercel.json               Vercel build, rewrites and function settings
├── api/index.mjs             Vercel serverless entry → bundled Express app
├── README.md
├── docs/ARCHITECTURE.md      this file
├── data/                     ★ source of truth — committed with headers + sample rows
│   ├── workouts.csv
│   ├── exercises.csv
│   ├── exercise_sets.csv
│   ├── meals.csv
│   ├── body_metrics.csv
│   ├── achievements.csv
│   ├── achievement_rules.csv
│   └── user_settings.csv
├── backups/                  auto + manual snapshots (git-ignored, folder kept)
├── shared/                   @forge/shared — pure TS used by both sides
│   └── src/ types.ts · dates.ts · analytics.ts · achievements.ts
├── backend/                  @forge/backend — Express API
│   ├── src/
│   │   ├── server.ts         startup: init files → evaluate achievements → listen
│   │   ├── app.ts            express app, routes, error handler
│   │   ├── config.ts         paths/ports (env overridable)
│   │   ├── vercel.ts         serverless entry (bundled by esbuild)
│   │   ├── storage/          filesystem + Vercel Blob drivers
│   │   ├── csv/              schema.ts · store.ts (transactions) · init.ts (create/upgrade files)
│   │   ├── routes/           workouts · crud (meals, body metrics) · settings · achievements · data
│   │   ├── services/         repo (joins) · achievements · backup · sample
│   │   └── lib/              validation (zod) · errors · ids · respond
│   ├── scripts/sample-data.ts
│   └── test/api.test.ts      end-to-end API tests on a temp data dir
└── frontend/                 @forge/frontend — React + Vite + Tailwind
    └── src/
        ├── main.tsx · App.tsx · index.css (design tokens)
        ├── api/              client · hooks (TanStack Query) · types
        ├── components/
        │   ├── layout/       AppShell (sidebar + top bar) · nav · Logo
        │   ├── ui/           primitives · form · overlay · Toast
        │   └── charts/       ChartCard · BarSeriesChart · LineSeriesChart · RankedBars
        ├── features/         workouts/WorkoutEditor · nutrition/FoodModal, MacroBar · body/BodyMetricModal
        ├── pages/            Dashboard · Workouts · Nutrition · BodyMetrics · Analytics · Achievements · Settings
        └── lib/              format · units · ranges · cn
```

`shared/` is the one addition to the structure you proposed; it keeps analytics in one place.

---

## 3. CSV data schema & relationships

```
workouts (workout_id) 1 ──< exercises (exercise_id, workout_id) 1 ──< exercise_sets (set_id, exercise_id)

meals          — one row per food item; a "meal" = all rows sharing (date, meal_type)
body_metrics   — one row per check-in; every measurement optional
achievement_rules (rule_id) 1 ──< achievements (achievement_id = rule_id  or  rule_id@period)
user_settings  — key/value
```

| File | Columns | Notes |
|---|---|---|
| `workouts.csv` | `workout_id, date, workout_name, muscle_group, duration_minutes, notes, created_at` | `muscle_group` is pipe-separated (`Back\|Biceps`). |
| `exercises.csv` | `exercise_id, workout_id, exercise_name, muscle_group, sets, reps, weight_kg, rest_seconds, notes` | `sets`, `reps` (total) and `weight_kg` (heaviest set) are **derived summaries** kept in sync by the API so the file stays readable on its own. |
| `exercise_sets.csv` | `set_id, exercise_id, set_number, reps, weight_kg, notes` | Set-level truth. Empty `weight_kg` = bodyweight. |
| `meals.csv` | `meal_id, date, meal_type, food_name, quantity, quantity_unit, calories, protein, carbohydrates, fats, notes` | `meal_type` ∈ `breakfast, lunch, evening_snacks, dinner, other`. |
| `body_metrics.csv` | `metric_id, date, weight_kg, body_fat_percentage, waist_cm, chest_cm, hips_cm, arm_cm, thigh_cm, notes` | `hips_cm`, `arm_cm`, `thigh_cm` added for "other optional measurements". |
| `achievements.csv` | `achievement_id, achievement_name, achievement_category, achievement_level, description, unlocked_date, xp_awarded` | Append-only log; an ID is never awarded twice. |
| `achievement_rules.csv` | `rule_id, name, category, level, period, metric, threshold, xp, title_reward, description, icon, enabled` | Edit this file to add, tune or disable achievements. |
| `user_settings.csv` | `setting_key, setting_value` | Targets, units, preferences. |

**Conventions.** Every file has a header row, even when empty. Dates are `YYYY-MM-DD` local calendar dates. IDs are prefixed and collision-resistant (`wo_…`, `ex_…`, `set_…`, `meal_…`, `bm_…`). Demo rows use the prefix `sample_` and a `[Sample]` note. Weights are stored in kg and lengths in cm. Parsing and serialising use PapaParse, which quotes commas, quotes and newlines correctly; this is covered by tests.

**Safety.**
- Writes go through temp file → fsync → atomic rename, under a global lock.
- Every delete, restore, import and sample-data removal backs up all CSVs to `backups/<timestamp>_auto_<reason>/` first; the 40 most recent automatic backups are kept.
- At startup FORGE creates only missing files. Missing columns or settings are added after a backup, and existing rows are never discarded.

### Achievement rules

`period` is `lifetime`, `weekly`, `monthly` or `yearly`. A periodic rule unlocks at most once per period (`week_four@2026-W47`), and `unlocked_date` is the date the threshold was first met, taken from the data. Available `metric` values (see `shared/src/achievements.ts`):

`workout_days, balanced_week, tracking_streak, tracking_days, nutrition_days, protein_target_days, protein_target_streak, calorie_target_days, personal_records, total_volume_kg, body_logs, goal_progress_pct`

**Healthy-by-design guardrails**
- Workouts count distinct training days, so double sessions earn nothing extra.
- No badge asks for more than 5 training days a week, and "Built to Recover" requires rest days.
- Calorie badges reward landing within ±10% of target, never eating less.
- Streaks count any tracking, so rest days don't break them.

**XP and levels.** XP = achievement XP + activity XP (40 per training day, 10 per day with meals logged, 5 per check-in day).

| Level | XP | Title |
|---|---|---|
| 1 | 0 | Iron Rookie |
| 2 | 300 | Earthbender |
| 3 | 800 | Firebender |
| 4 | 1,600 | Prime |
| 5 | 3,000 | Elite |
| 6+ | 5,000 (+2,500 per level after) | The Evolution |

Achievement titles: Unstoppable (100 workouts), Consistency King (30-day streak), Protein Machine (7-day protein streak), Heavy Metal (100 t volume).

---

## 4. Wireframes

```
DESKTOP SHELL (≥1024px)                                      MOBILE (<1024px)
┌────────────┬──────────────────────────────────────────┐    ┌──────────────────────┐
│ F FORGE    │ Sat, Nov 21 2026     [4 Prime ▬▬▬] 🔔 (A) │    │ ☰ Sat, Nov 21   🔔 (A)│
│            ├──────────────────────────────────────────┤    ├──────────────────────┤
│ ▣ Dashboard│                                          │    │ page content,        │
│ ▢ Workouts │   page content (max 1400px)              │    │ single column        │
│ ▢ Nutrition│                                          │    │                      │
│ ▢ Body     │                                          │    │ ☰ opens drawer nav   │
│ ▢ Analytics│                                          │    └──────────────────────┘
│ ▢ Achieve. │                                          │
│ ▢ Settings │                                          │
│ ⇤ Collapse │                                          │
└────────────┴──────────────────────────────────────────┘

DASHBOARD
┌─ Today's nutrition ───────────────────────┐ ┌─ Today's workout ─────────┐
│  ( ring 1,195 / 2,400 )  Remaining | Items │ │ ○ Pending        [+ Log]  │
│                          Protein ▬▬▬▬░░    │ ├─ Body weight ─────────────┤
│                          Carbs   ▬▬▬▬▬░    │ │ 81.2 kg · target 78 kg    │
│                          Fats    ▬▬░░░░    │ └───────────────────────────┘
└────────────────────────────────────────────┘
THIS WEEK  [Workouts 3/4][Duration][Sets][Volume][Avg kcal][Avg protein][Δ weight]
TRENDS                                                     [7D|30D|3M]
┌ Calories (bars + target) ┐ ┌ Protein (bars + target) ┐
┌ Body weight (line)       ┐ ┌ Workout frequency/week  ┐   each card: ⊞ table toggle

WORKOUTS                                          [+ Log workout]
[30-day stats ×4]
[🔍 search…………………………] [Muscle group ▾]
┌ FRI 20 │ Upper Body  🏆1 PR  Sample │ groups · ex · sets · reps · kg · min │ ▾ ✎ 🗑 ┐
│   (expanded) exercise cards → Set 1 12 reps × 30 kg …                               │
└─────────────────────────────────────────────────────────────────────────────────────┘
  Editor (slide-over): name | date | duration · muscle chips
  ┌ 1  Exercise [Lat Pulldown ▾]  Group [Back]  Rest [90s]   ↑ ↓ 🗑
  │    ⟲ Last time (Nov 16): 12×32.5 · 10×32.5 · 8×32.5 kg  [Copy sets]  🏆 New PR
  │    SET  REPS  WEIGHT(kg)
  │     1   [12]  [32.5]  🗑     + Add set
  └ [+ Add exercise]   Notes   ── footer: 4 sets · 38 reps · 1,375 kg   [Cancel][Save]

NUTRITION                      [‹] [date] [›] Jump to today        [+ Add food]
┌ Daily totals ────┐  ┌ Breakfast  521 kcal · P · C · F          [+ Add to breakfast] ┐
│ (ring) kcal left │  │  Rolled oats  76 g · P 10 · C 51 · F 5        287 kcal  ✎ 🗑 │
│ Protein ▬▬▬░     │  ├ Lunch … ┤ ├ Evening Snacks … ┤ ├ Dinner … ┤ ├ Other … ┤
│ Carbs   ▬▬▬▬░    │  Food modal: Food (autocomplete + autofill) | Meal | Qty | Unit
│ Fats    ▬▬░      │             kcal | P | C | F | macro-vs-kcal sanity hint
└──────────────────┘

BODY METRICS                                            [+ Log measurement]
[Current][Starting][Target · x to go][Total change]
[Progress to target ▬▬▬▬░░░░ 27%]
TRENDS [7D|30D|3M|6M|1Y|All]   Weight (target line) | Body fat | Measurements (change since start)
STARTING VS CURRENT  [Waist][Chest][Hips][Arm][Thigh]
HISTORY table with ✎ 🗑 per row

ANALYTICS   [30D|3M|6M|1Y|All|Custom (from–to)]
WORKOUTS   tiles ×6 · Weekly volume · Muscle groups (ranked bars) · Exercise progression [select] · PR list
NUTRITION  tiles ×6 (avgs, protein-target days, calorie-on-target days) · Daily macros
BODY       tiles ×4 · Weight progression · Body fat progression

ACHIEVEMENTS
┌ LEVEL 4 │ Prime │ 2,195 XP ▬▬▬▬▬░░ 805 to L5 │ XP breakdown ┐ ┌ Titles [active ▾] chips ┐
RECENTLY UNLOCKED  → horizontal strip
GALLERY 13/25   [category ▾] [All|Unlocked|Locked]
[badge card: icon ring (tier colour) · name · tier · period · XP · description · progress / unlocked date]

SETTINGS
Profile & body goals | Daily nutrition targets | Training | Units & achievements   [sticky Save bar]
DATA: CSV files (row counts, per-file download, Export all) | Backups (Back up now, Import .zip, Restore)
      Sample data banner → Remove sample data
```

---

## 5. Component breakdown

| Layer | Components |
|---|---|
| Layout | `AppShell` (collapsible sidebar, mobile drawer, top bar with date, level chip, notification bell, avatar) |
| UI primitives | `Button`, `IconButton` (aria-label + tooltip), `Card`, `Badge`, `SampleBadge`, `StatTile`, `ProgressBar`, `ProgressRing`, `Segmented`, `Skeleton`/`PageSkeleton`, `EmptyState`, `ErrorState`, `PageHeader`, `SectionTitle` |
| Forms | `Field` (label + error/hint, `aria-describedby`), `Input`, `NumberInput`, `Select`, `Textarea`, `Toggle`, `ChipSelect` |
| Overlays | `Modal`, `SlideOver`, `ConfirmDialog` (names the item being deleted). All trap focus, close on Esc and restore focus. |
| Feedback | `ToastProvider`/`useToast` (success, error, achievement) |
| Charts | `ChartCard` (chart ↔ table toggle, legend), `BarSeriesChart`, `LineSeriesChart`, `RankedBars` |
| Features | `WorkoutEditor` (+ `ExerciseBlock`), `FoodModal`, `MacroBar`, `BodyMetricModal` |
| Data | `useWorkouts/useMeals/useBodyMetrics/useSettings/useAchievements/useDataset`, `useForgeMutation` (save → refresh → toasts) |
| Engine (shared) | `analytics.ts` (totals, PRs, streaks, nutrition), `achievements.ts` (metric registry, evaluator, levels, titles) |

---

## 6. UI/UX design system

**Direction.** A premium dark analytics tool, not a neon gym app: charcoal surfaces, one orange accent for actions and progress, and colour used only where it carries meaning.

| Token | Value | Use |
|---|---|---|
| `bg` | `#0b0b0d` | App background |
| `surface` | `#131316` | Cards |
| `raised` / `overlay` | `#1a1a1f` / `#202026` | Inputs, hovers, dialogs, toasts |
| `line` / `line-strong` | `#25252b` / `#33333b` | Hairline card borders / control borders |
| `ink` / `ink-2` / `ink-3` | `#ededf0` / `#a3a3ad` / `#72727c` | Primary / secondary / muted text |
| `brand` | `#ff6b1f` | Primary actions, active nav, progress |
| `electric` | `#3b9eff` | Focus rings, links, secondary emphasis |
| `good` | `#10b981` | Positive signals (goal progress, earned this period) |
| `warn` / `bad` | `#f5a524` / `#ef4444` | Over-target / destructive |

**Chart palette.** Validated for colour-blind separation on the dark surface.
- Protein `#3987e5`, carbs `#e2620f`, fats `#199e70`.
- Measurements use the five-slot order `#3987e5, #d95926, #199e70, #c98500, #d55181`.

**Typography.** Inter Variable, bundled locally so it works offline.
- Page title 20/600, section label 13/600 uppercase, body 14/400, meta 12–13.
- Stat values 24/600 with tabular numbers.

**Spacing and shape.**
- 4/8 pt rhythm; cards have 14 px radius and 20 px padding.
- 16–24 px page gutter, content capped at 1400 px.

**Charts.**
- Bars ≤ 24 px with 4 px rounded tops.
- 2 px lines with 8 px markers ringed in the surface colour.
- Hairline solid grid and a single y-axis.
- Legend whenever there are two or more series.
- Hover tooltips, and a table view on every chart.

**Motion.** 150–220 ms colour, opacity and transform transitions only. `prefers-reduced-motion` disables them.

**Accessibility.**
- Every input has a visible label, and every icon button has `aria-label` plus a tooltip.
- Focus is visible (electric ring), and dialogs trap focus.
- Status is never shown by colour alone.

**States.** Every page has loading skeletons, error panels with a retry, actionable empty states, and toasts for success and errors. Error copy never blames the user and always says what to do next.
