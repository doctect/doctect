# Recipe Book & Meal Planner

Gallery metadata + generator scripts for the Recipe Book sample project.

## Gallery metadata

- **Title:** Recipe Book & Meal Planner
- **Tags:** `recipes` `cooking` `food` `meal-plan` `kitchen` `shopping`
- **Description:** Your whole kitchen in one book. Keep recipes by category (ingredients, method, serves, time), plan the week on a Mon–Sun meal grid, and build shopping lists by aisle. Every week page has a tabbed edge that jumps straight to any recipe category, so you can flip from planning to a recipe and back in a tap. Rename everything to your own dishes and start cooking.

## Structure

```
cover (root)
└── My Kitchen (hub, id "contents")   — Recipes / Meal Plan / Shopping Lists
    ├── Recipes (section, id "recipes")
    │   └── Category × 6 (section, fixed slug id "cat_<name>")
    │       └── Recipe × 8 (recipe)     — serves/time/source, ingredients, method, notes
    ├── Meal Plan (section, id "mealplan")
    │   └── Week × 8 (week)             — Mon–Sun meal grid + notes + recipe-category tabs
    └── Shopping Lists (section, id "shopping")
        └── List × 8 (shopping)         — checkboxes by aisle
```

- Templates: `cover`, `hub`, `section`, `recipe`, `week`, `shopping`
- Default size: 75 nodes / 75 pages
- Page: reMarkable Paper Pro, 509 × 679

## Meal-plan tabs

Each week page carries a right-edge **tab strip** — one tab per recipe category — so you can jump
from meal planning to any recipe type, then pick a recipe. The tabs link by a slug id
(`cat_breakfast`, `cat_mains`, …) derived from the category name. **The `categories` list must be
identical in `templates.js` and `hierarchy.js`** so the tab links resolve.

## Navigation

- Cover → hub; hub buttons → Recipes / Meal Plan / Shopping Lists
- Recipes → category → recipe; Meal Plan → week; week edge tabs → a recipe category → recipe
- Every page: `Index` → hub, `Cover` → cover, `Back` chip → parent, corner triangles → prev/next

## Tweak knobs

Top of both scripts (keep `categories` in sync): `categories`. Plus `recipesPerCategory`,
`numWeeks`, `numShoppingLists` in `hierarchy.js`.

## How to load

1. Editor → **Generator**.
2. Clear the **Templates** pane, paste `templates.js`.
3. Clear the **Hierarchy** pane, paste `hierarchy.js`.
4. **Run Generator**.
