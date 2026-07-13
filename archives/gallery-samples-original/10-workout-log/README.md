# Workout & Fitness Log

Gallery metadata + generator scripts for the Workout Log sample project.

## Gallery metadata

- **Title:** Workout & Fitness Log
- **Tags:** `fitness` `workout` `gym` `exercise` `training` `health`
- **Description:** Log every session and watch the numbers climb. Organise training into programs, then weeks, then workout days — each day an exercise table for sets, reps, and weight, with room for the date, focus, and notes. Rename the programs to your routine (5×5, Push/Pull/Legs, whatever you run) and fill in the sessions as you train.

## Structure

```
cover (root)
└── Programs (section, id "contents")
    └── Program × 3 (section)
        └── Week × 8 (section)
            └── Day × 4 (workout — exercise table: sets / reps / weight + notes)
```

- Templates: `cover`, `section`, `workout`
- Default size: 125 nodes / 125 pages (96 workout sessions)
- Page: reMarkable Paper Pro, 509 × 679

## Navigation

- Cover → Programs; Programs → program → week → workout day
- Workout: corner triangles → prev/next day, `Week` chip → its week
- Every page: `Index` → Programs, `Cover` → cover, `Back` chip → parent

## Tweak knobs

Top of `hierarchy.js`: `numPrograms`, `weeksPerProgram`, `daysPerWeek`. Exercise-table rows live
in `templates.js` (the `makeTable(...)` call in the `workout` template).

## How to load

1. Editor → **Generator**.
2. Clear the **Templates** pane, paste `templates.js`.
3. Clear the **Hierarchy** pane, paste `hierarchy.js`.
4. **Run Generator**.
