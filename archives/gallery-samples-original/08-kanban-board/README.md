# Project Kanban Board

Gallery metadata + generator scripts for the Kanban Board sample project.

## Gallery metadata

- **Title:** Project Kanban Board
- **Tags:** `kanban` `tasks` `productivity` `project` `agile` `work`
- **Description:** A simple board to move work from To-Do to Doing to Done. Each board has three writable columns — jot a task on a line, then cross it out and rewrite it in the next column to move it — plus a Backlog page to park ideas before they hit the board. Keep a board per project or per week. Rename the boards to match your work.

## Design note (why the columns are writable)

An earlier version pinned each task as a fixed card in one column — but on paper you can't drag a
card between columns, so a pinned task could never move. This version makes the columns **writable**
instead: a task is just something you write on a line, and you "move" it by striking it out in one
column and rewriting it in the next. That's how a paper kanban actually works.

## Structure

```
cover (root)
└── Boards (section, id "contents")
    └── Board × 8 (board — writable To-Do / Doing / Done columns)
        └── Backlog (backlog — writable parking list)   [board's "Backlog" chip → child_index 0]
```

- Templates: `cover`, `section`, `board`, `backlog`
- Default size: 18 nodes / 18 pages
- Page: reMarkable Paper Pro, 509 × 679

## Navigation

- Cover → Boards; Boards grid → board
- Board `Backlog »` chip → that board's backlog page (`child_index 0`)
- Every page: `Index` → Boards, `Cover` → cover, `Back`/`Board` chip → parent, corner triangles → prev/next

## Tweak knobs

Top of `hierarchy.js`: `numBoards`. Rows per column live in `templates.js` (the `kColumn(...)`
calls).

## How to load

1. Editor → **Generator**.
2. Clear the **Templates** pane, paste `templates.js`.
3. Clear the **Hierarchy** pane, paste `hierarchy.js`.
4. **Run Generator**.
