---
title: Traversal Path
summary: Reaches a grid past its direct children into grandchildren and deeper — one level per generation, each with its own slice, pooled before the next runs.
aliases: grandchildren, drill down, descendants grid
keywords: traversal, traversalPath, deep traversal, sliceStart, sliceCount, grandchildren, descendants, levels, add level, drill down
---

**Deep Traversal**, in **Grid Configuration** above Final Data Subset, reaches below a grid's direct children. Each **+ Add Level** click adds one generation to descend (the `traversalPath` array), and each level carries its own **Start** / **Count** (`sliceStart` / `sliceCount`). The rule per level: take every node currently in play, fetch *its* children, slice them, and pool the results before handing them to the next level. Leave it empty ("Direct children only") and a grid behaves normally; the difference only shows at two levels or more, since the second level's slice runs once *per node* the first produced.

Quarter View's mini-calendars are the worked example — a grid sourced from a quarter, reaching its days two levels down:

| Step | Runs against | Start / Count | Produces |
| --- | --- | --- | --- |
| *(source)* | Quarter 1 | — | Quarter 1 |
| 1 | Quarter 1's 3 months | `0` / `1` | January |
| 2 | January's 31 days | `0` / *(all)* | Jan 1 – Jan 31 |

Change step 1's `sliceStart` to `1` or `2` to reach the quarter's second or third month — one number, nothing else. Traversal runs first, then [Final Data Subset](/docs/reference/data-slicing) slices the result, then the [offset](/docs/reference/dynamic-offset) is computed last.

![The Quarter View template with a traversal-configured grid selected, showing the Deep Traversal section's two steps](/docs-assets/editor/grid-traversal-example.png "Two steps: pick one month, then take all of its days")

See [Traversal: grids over grandchildren](/docs/editor/grids-calendars-and-data-shaping#traversal-grids-over-grandchildren).
