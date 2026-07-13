# Project Desk

Project Desk is a reMarkable Paper Pro work hub for turning project intent into visible operational follow-through. It connects project briefs and outcomes, writable paper Kanban lanes, meeting logs, durable decisions, risks, and portfolio reviews.

## Workflow

1. Open **Portfolio** to select a project desk or begin weekly review cadence.
2. Define objective, success measure, boundaries, and outcomes in **Project Brief**.
3. Write work directly into **Ready**, **Doing**, and **Done** lanes on the paper board.
4. Capture meetings in the project **Meeting Index**.
5. Open the referenced decision record from each meeting and link resulting action back to the board.
6. Review observable risks and close loops in the portfolio **Weekly Review**.

Guided example follows a website launch. Launch-readiness meeting decision `DEC-07` opens a referenced decision record; that record opens the matching visible redirect-map action on the paper board. Every guided page is marked **EXAMPLE** and links directly to **Blank workspace**.

## Configuration

Edit `DEFAULT_CONFIG` at top of `hierarchy.js`, or provide same keys through `SAMPLE_CONFIG` in development tests.

```js
const DEFAULT_CONFIG = { projectCount: 3, meetingsPerProject: 8, reviewWeeks: 12 };
```

Supported integer ranges:

- `projectCount`: 1–6
- `meetingsPerProject`: 1–20 per project
- `reviewWeeks`: 4–52 portfolio-level reviews

Unsupported values stop generation with a contextual error. Default configuration exports 64 pages. Minimum configuration (`1 / 1 / 4`) exports 23 pages. Reference wrappers connect meetings, decisions, and boards without duplicating exported pages.

## Page Inventory

- 1 architectural cover and 1 Start Here guide
- Guided workspace: portfolio, website-launch brief/outcomes, writable board, meeting index/log, decision record, risk register, and weekly review
- Blank workspace and portfolio
- Per blank project: 1 brief/outcomes page, 1 three-lane board, 1 meeting index, configured meeting logs, 1 decision register, and 1 risk register
- Configured portfolio weekly reviews shared across all projects

Blank pages contain labels, prompts, and writing surfaces only. They do not include fake tasks, movable task cards, decisions, risks, or meeting content. Boards and registers use fixed bordered vector regions so writable structure remains visible in PDF output; dynamic grids are reserved for populated navigation indexes.

## Navigation Map

```text
Cover
└── Start Here
    ├── Guided Website Launch
    │   └── Portfolio
    │       ├── Brief
    │       │   ├── Board
    │       │   ├── Meeting Index → Meeting → referenced Decision → referenced Board
    │       │   ├── Decision Register → referenced Board
    │       │   └── Risk Register
    │       └── Weekly Review
    └── Blank Workspace
        └── Portfolio
            ├── Project desks
            └── Weekly Review 01 → NEXT REVIEW → ... → configured final week
```

Major entry points use stable IDs: `root`, `start_here`, `example_workspace`, and `blank_workspace`. Repeated project and review IDs are deterministic. **Home** returns to cover. On Review 01, **Up** returns to Portfolio; on later reviews it returns to the previous review. **Next Review** advances through the configured chain and is omitted on the final review because no forward destination exists. Every example page offers **Skip to blank workspace**.

## Visual System

Architectural navy (`#263f52`) establishes structure, ochre (`#c79b45`) marks decisions and milestones, and warm stone (`#eee9dd`) keeps writing surfaces calm. Original modular-plan SVG geometry carries connected-work motif. Design remains legible in grayscale through weight, border, spacing, and fill contrast rather than color alone.
