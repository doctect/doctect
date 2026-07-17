# Money Map

Money Map is a reMarkable Paper Pro personal finance planner for connecting annual intentions to monthly evidence. It combines cash-flow outlooks, monthly plans, transaction logs, category reviews, sinking funds, debt or savings goals, and a year review without pretending that every month will follow the plan exactly.

## Workflow

1. Use **Annual Outlook** to sketch quarterly cash flow and open any major section.
2. Set expected income, category limits, and one useful intention in each **Monthly Plan**.
3. Write real money movement into fixed, PDF-visible **Transaction Logs**.
4. Compare plan with actual movement in **Category Review** without treating variance as failure.
5. Track recurring costs in **Bills & Subscriptions** (shade a square per paid month).
6. Make irregular costs visible in **Sinking Funds**.
7. Track debt reduction or savings milestones in configurable **Goals**.
8. Close the loop with **Year Review**.

Guided branch shows one clearly fictional January household plan. It includes income, housing, food, transport, leisure, savings allocations, eight transactions, category variance, sinking funds, and an emergency-fund goal. Figures are instructional examples, not financial advice. Every guided page is marked **EXAMPLE** and links directly to **Blank workspace**.

## Configuration

Edit `DEFAULT_CONFIG` at top of `hierarchy.js`, or provide same keys through `SAMPLE_CONFIG` in development tests.

```js
const DEFAULT_CONFIG = { transactionPagesPerMonth: 2, goalCount: 4 };
```

Supported integer ranges:

- `transactionPagesPerMonth`: 1-4 for each of 12 months
- `goalCount`: 1-8 debt or savings goals

Unsupported values stop generation with a contextual error. Default configuration exports 68 pages. Minimum configuration (`1 / 1`) exports 53 pages. Maximum configuration (`4 / 8`) exports 96 pages.

## Page Inventory

- 1 editorial cover and 1 Start Here guide
- Guided branch: workspace, annual outlook, completed January, transaction log, category review, sinking funds, goal, and year-review preview
- Blank workspace and annual outlook
- 12 complete blank months
- Per month: monthly plan, configured transaction sheets, and category review
- 1 recurring-bills register (and its guided example page)
- 1 sinking-funds register
- Configured debt or savings goal pages
- 1 year review

Blank pages contain prompts, category names, month names, and writing surfaces only. They contain no fake balances, purchases, transfers, debts, or goals. Writable tables use fill-only cells, one outer boundary, and one vector segment per internal row or column so shared edges never overlap in canvas or PDF output. Annual Outlook uses one populated dynamic grid solely as child navigation; its borders come only from explicit per-cell grid configuration, and no writable financial structure depends on an empty dynamic grid.

## Navigation Map

```text
Cover
+-- Start Here
    +-- Guided January
    |   +-- Annual Outlook
    |       +-- January Plan -> Transaction Log -> Category Review
    |       +-- Bills & Subscriptions
    |       +-- Sinking Funds
    |       +-- Emergency Fund Goal
    |       +-- Year Review Preview
    +-- Blank Workspace
        +-- Annual Outlook
            +-- January ... December
            |   +-- configured Transaction Logs -> Category Review
            +-- Bills & Subscriptions
            +-- Sinking Funds
            +-- configured Goals
            +-- Year Review
```

Month pages chain with « / » chips; December continues to Bills, then Funds → Goals → Year Review. Transaction sheets chain forward into the month's Category Review; Up from any sheet returns to its month.

Major entry points use stable IDs: `root`, `start_here`, `example_workspace`, and `blank_workspace`. Cover and Start Here controls target stable IDs directly. Annual navigator contains existing child pages only. Monthly **Open Transaction Log** and transaction **Next Log / Review** controls use proven first-child links: every supported month has at least one log, and every log has either another log or its category review. **Home** returns to cover and **Up** returns to current parent. Every guided page offers **Skip to blank workspace**.

## Visual System

Deep forest (`#29483d`) sets structure, muted brass (`#b68a4c`) marks decisions and routes, and warm cream (`#f4eddf`) keeps writing areas calm. Georgia display type and compact ledger typography create restrained financial-editorial character. Original ring-and-path SVG artwork suggests movement and allocation without coins, banknotes, cards, or currency-brand imagery. Weight, spacing, and fill contrast keep hierarchy legible in grayscale.
