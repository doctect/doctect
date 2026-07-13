# Seasonal Kitchen

Culinary-magazine recipe and meal-planning system for reMarkable Paper Pro. Seasonal Kitchen connects a browsable recipe library to weekly plans, pantry checks, and one grouped shopping list per week.

## Workflow

1. Browse the seasonal index and open a recipe category.
2. Record yield, prep, cook time, difficulty, ingredients, method, notes, and repeat rating.
3. Pull linked recipes into a seven-day meal plan.
4. Check staples, freezer stock, and ingredients that should be used first.
5. Combine the week into one list grouped by produce, pantry, chilled, bakery, and household.

Start Here offers two routes:

- **Explore guided example** opens a clearly fictional autumn week with three complete recipes.
- **Skip to blank workspace** opens clean recipe, planning, pantry, and shopping banks.

Every guided page, including linked recipe references, displays a bound **EXAMPLE** label and a direct **Skip to blank workspace** control.

## Guided Autumn Example

The fictional example links:

- Charred Squash & Barley Bowls
- Tomato-Sage Orzo Bake
- Pear, Oat & Thyme Crumble
- One seven-day plan using deliberate leftovers and shared ingredients
- One pantry check
- One combined shopping list with quantities grouped by shop section

The quantified shopping list includes only ingredients absent or insufficient after the pantry check. Stocked ingredients are omitted; the example does not rebuy vegetable stock, bitter greens, lemons, oil, seasonings, sugar, seeds, or yogurt already available in adequate quantities.

Recipe pages return to the meal plan through semantic recipe references. The meal plan opens its own shopping list and first linked recipe. The shopping list returns to its parent plan.

## Configuration

Edit `DEFAULT_CONFIG` near the top of `hierarchy.js` before generation:

```js
const DEFAULT_CONFIG = { categoryCount: 6, recipesPerCategory: 8, mealPlanWeeks: 12 };
```

Supported integer ranges:

| Setting | Range | Purpose |
|---|---:|---|
| `categoryCount` | 1-8 | Recipe-library category banks |
| `recipesPerCategory` | 1-16 | Clean recipe pages in each category |
| `mealPlanWeeks` | 1-52 | Weekly plans, each with a combined shopping list |

Unsupported values fail with a clear `Seasonal Kitchen config` error.

## Default Inventory

- 1 cover and 1 Start Here guide
- 1 guided workspace, seasonal index, and category
- 3 complete fictional recipe pages
- 1 guided meal plan, pantry check, and combined list
- 1 blank workspace and recipe index
- 6 blank categories with 8 recipes each: 48 recipe pages
- 12 blank weekly meal plans
- 12 linked reusable shopping lists
- 1 blank pantry inventory
- 93 exported pages total

Reference wrappers connect recipes to plans without adding duplicate exported pages.

## Navigation

- Cover -> `start_here`
- Start Here -> `example_workspace` or `blank_workspace`
- Workspace cards -> recipe index, bounded meal-plan indexes, or pantry
- Seasonal index cards -> categories or meal plans
- Category cards -> complete recipe bank
- Recipe -> a meal plan that references it
- Meal plan -> its combined list or first linked recipe
- Shopping list -> parent meal plan
- **Up** follows the hierarchy parent; **Home** returns to `root`

Long planning banks split into indexes of at most 13 weeks. Maximum configuration creates four bounded planning indexes, so all 52 plans remain visible without clipped grids or fragile sibling offsets.

## Visual And Border Construction

Olive navigation, tomato accents, oat writing surfaces, Georgia editorial headings, and original plate-and-leaf SVG artwork establish the culinary-magazine identity. The palette remains legible in grayscale and keeps writing areas calm.

All dynamic cards explicitly use solid 0.8 px olive borders. Meal, pantry, and shopping tables use unstroked cells, one 0.8 px outer boundary, and one rectangle per internal edge. This avoids doubled shared strokes and keeps every table visible in PDF export.
