# FORGE

**Build. Track. Evolve.**

FORGE is a personal fitness tracker that runs on your own computer. It tracks workouts down to individual sets, logs nutrition and macros, records body metrics, and charts your progress. It also has an achievement system with XP, levels and unlockable titles to reward consistency.

All data lives in plain **CSV files** in [`data/`](data/). There is no database, cloud service, account or paid API. You can open the files in any spreadsheet app, back them up or put them under version control.

## Quick start

Requires **Node.js 20.11+** and npm.

```bash
npm install
```

```bash
npm run dev
```

Then open **http://localhost:5173**.

`npm run dev` starts the API on port 4000 and the web app on port 5173 together. Stop both with `Ctrl+C`.

## Sample data

The repository ships with three weeks of demo data so the dashboard has something to show:

- Every demo row has an ID starting with `sample_` and a `[Sample]` note.
- It is marked with a **Sample** badge in the UI.

| Action | How |
|---|---|
| Remove all sample rows (achievements are rebuilt from your own data) | **Settings → Data → Remove sample data**, or `npm run sample:remove` |
| Regenerate the sample set so it ends today (your own rows are untouched) | `npm run sample:load` |

Both actions take a backup first.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Start API + web app with hot reload |
| `npm run build` | Production build of the web app (`frontend/dist`) |
| `npm start` | Serve the API + production build (run `npm run build` first) at http://localhost:4173 |
| `npm test` | API end-to-end tests: CRUD, CSV escaping, concurrent writes, backup/restore |
| `npm run typecheck` | TypeScript checks for backend and frontend |
| `npm run sample:load` / `sample:remove` | Manage demo data |

## Where your data lives

```
data/
  workouts.csv          one row per session
  exercises.csv         exercises in a session (with set/rep/weight summaries)
  exercise_sets.csv     every individual set — reps and optional weight
  meals.csv             one row per food item
  body_metrics.csv      weight, body fat, measurements (all optional)
  achievements.csv      unlocked achievements (each awarded once)
  achievement_rules.csv configurable achievement rules
  user_settings.csv     targets, units and preferences
backups/                automatic + manual snapshots
```

- **Safe writes.** Every change goes to a temporary file that is flushed to disk and then atomically renamed into place. One write lock prevents concurrent changes from corrupting a file.
- **Backups.** Every delete, restore and import first copies all CSVs to `backups/<timestamp>_auto_<reason>/`. The 40 most recent automatic backups are kept, and manual backups are never pruned. You can create, restore, export (`.zip`) and import backups in **Settings → Data**.
- **Hand edits.** Editing CSVs while FORGE runs is fine; changes are picked up on the next request. Extra columns you add are preserved. On startup FORGE only creates missing files or adds missing columns, after taking a backup. It never overwrites your rows.
- **Units.** Values are stored in kg and cm. Switching to lbs or inches changes only the display.
- **Privacy.** `data/` is committed to this repo so the project starts with its CSVs. If you don't want your personal logs in git, add `data/*.csv` to `.gitignore` once you've removed the sample data.

## Customising achievements

Open `data/achievement_rules.csv` to change a threshold or XP value, disable a rule (`enabled=false`), or add a new row. Available metrics, periods and the level table are documented in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md#achievement-rules).

The default rules reward consistency and recovery, never excess:
- Training XP counts each day once.
- No badge asks for more than 5 training days a week.
- Calorie badges reward landing near your target, not eating less.

## Configuration

Optional environment variables:

| Variable | Default |
|---|---|
| `FORGE_API_PORT` | `4000` |
| `FORGE_DATA_DIR` | `./data` |
| `FORGE_BACKUP_DIR` | `./backups` |
| `FORGE_AUTO_BACKUP_RETENTION` | `40` |

## Tech stack

React 19 + TypeScript, Vite, Tailwind CSS v4, Recharts, Lucide icons and TanStack Query on the front end. Node + Express 5, PapaParse and zod on the back end. A shared TypeScript package holds the analytics and achievement engine that both sides use.

See **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)** for the architecture, CSV schema and relationships, wireframes, component breakdown and design system.
