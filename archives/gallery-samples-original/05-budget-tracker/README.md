# Budget & Finance Tracker

Gallery metadata + generator scripts for the Budget Tracker sample project.

## Gallery metadata

- **Title:** Budget & Finance Tracker
- **Tags:** `budget` `finance` `money` `savings` `expenses` `tracker`
- **Description:** A clean, whole-year budget you actually keep. Every month gets a category table — budget, spent, and what's left — with a full transactions log a tap behind it. An annual summary rolls the twelve months into one view, and a savings-goals page tracks what you're putting money toward. Just add your own categories and numbers.

## Structure

```
cover (root)
└── 2026 (year_index, id "contents")   — month grid + Summary / Goals buttons
    ├── Month 1..12 (month — category budget table + Total)
    │   └── Transactions (txlog — dated log with running balance)
    ├── Annual Summary (summary — 12-month roll-up, months pre-filled)
    └── Savings Goals (goals — target / saved / left)
```

- Templates: `cover`, `year_index`, `month`, `txlog`, `summary`, `goals`
- Default size: 28 nodes / 28 pages
- Page: reMarkable Paper Pro, 509 × 679

## Styled tables

The month, summary, and goals pages use a shared `makeTable` helper: a shaded header row,
alternating row shading, column rules, and an optional pre-filled first column (the summary's
month names). The year hub's month grid also uses the grid's own `alternateRows` shading.

## Navigation

- Cover → year hub; month grid → month; hub buttons → Annual Summary / Savings Goals
- Month → `Transactions →` (its log, `child_index 0`)
- Every page: `Index` → hub, `Cover` → cover, `Year` chip → hub, corner triangles → prev/next

## Tweak knobs

Top of `hierarchy.js`: `year`. Table row counts live in `templates.js` (the `makeTable` calls).

## How to load

1. Editor → **Generator**.
2. Clear the **Templates** pane, paste `templates.js`.
3. Clear the **Hierarchy** pane, paste `hierarchy.js`.
4. **Run Generator**.
