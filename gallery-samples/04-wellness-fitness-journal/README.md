# Wellbeing Rhythm

Calm wellness and fitness journal for reMarkable Paper Pro. It combines habit awareness, weekly movement, strength logs, energy notes, and recovery reflection without daily-page bloat or health claims.

## Workflow

1. Describe a neutral starting baseline.
2. Set monthly intentions and mark six habits across a legible split-month matrix.
3. Plan each week around movement, rest, energy, and recovery cues.
4. Record configurable strength sessions with movement, sets, reps, load, RPE, and notes.
5. Review monthly energy and recovery on a separate page.
6. Carry one useful pattern into the next month.

Start Here offers two routes:

- **Explore guided example** opens a balanced week with walking and two moderate strength sessions.
- **Skip to blank workspace** opens clean writable pages with no sample ratings or entries.

Every guided page is marked **EXAMPLE** and links directly to `blank_workspace`.

## Configuration

Edit `DEFAULT_CONFIG` near the top of `hierarchy.js` before generation:

```js
const DEFAULT_CONFIG = { monthCount: 12, weekCount: 52, workoutsPerWeek: 2 };
```

Supported integer ranges:

| Setting | Range | Purpose |
|---|---:|---|
| `monthCount` | 1-12 | Monthly habit, recovery, and reflection sets |
| `weekCount` | 4-52 | Weekly movement plans distributed across configured months |
| `workoutsPerWeek` | 0-4 | Strength logs chained after every weekly plan |

Unsupported values fail with a clear `Wellbeing Rhythm config` error. Zero workouts is valid; each week then continues directly to the next week or monthly recovery page.

## Default Inventory

- 1 cover and 1 Start Here guide
- 1 guided workspace: baseline, month habits, week, 2 strength logs, recovery, reflection
- 1 blank workspace and 1 baseline
- 12 monthly habit dashboards
- 52 weekly movement plans
- 104 strength logs
- 12 recovery pages
- 12 monthly reflections
- 204 exported pages total

No daily pages are generated.

## Navigation

- Cover → `start_here`
- Start Here → `example_workspace` or `blank_workspace`
- Workspace navigator → baseline or any configured month
- Month → first week, or recovery when that month has no assigned week
- Week → configured workout chain, next week, or monthly recovery
- Workout → next workout, next week, or monthly recovery
- Recovery → monthly reflection
- Reflection → `blank_workspace` month index
- **Previous** follows the exact sequence parent; **Home** returns to `root`

Major destinations use stable IDs. Sequence links use a validated child at index `0`, including 52-week and zero-workout configurations. Final reflection pages show no misleading Next control.

## Border Construction

Habit and workout structures remain visible in PDF export. Static cells have no individual strokes; each table draws one outer boundary and each shared internal edge exactly once with 0.8 px warm-gray rules. Dynamic workspace cards explicitly use `gridBorderMode: "all"`, solid 0.8 px sage borders, and unstroked grid elements, avoiding doubled shared edges.

Wellbeing Rhythm supports personal observation and planning. It does not diagnose conditions, prescribe training, or replace professional care.
