# Cornell Notes Notebook

Gallery metadata + generator scripts for the Cornell Notes sample project.

## Gallery metadata

- **Title:** Cornell Notes Notebook
- **Tags:** `study` `students` `cornell` `notes` `education` `notebook`
- **Description:** A ready-to-use Cornell-method study notebook. Add your own subjects and fill up to 100 note pages under each — every page split into cue, notes, and summary zones. A two-page index per subject lists all 100 notes as writable rows, so you can jot what each one is about beside its number. Tap through the Contents to any subject, flip pages with the corner arrows, and jump back to the index or cover from the top of every page.

## Structure

```
cover (root)
└── Contents (subject_index, id "contents")
    └── Subject 1..N            (subject)          <- page 1 of the index: notes 1–50
        ├── Note 1..50          (note, Cornell layout)
        └── Notes 51–100        (subject_more)     <- page 2 of the index: notes 51–100
            └── Note 51..100     (note, Cornell layout)
```

- Templates: `cover`, `subject_index`, `subject`, `subject_more`, `note`
- Default size: 818 nodes (1 + 1 + 8 subjects + 8 page-2 + 800 notes)
- Page: reMarkable Paper Pro, 509 × 679
- Subjects are generic ("Subject 1" …) — **rename each in the editor's tree** to your courses.

## Note index rows

Each note appears as a row in the subject index: its title (`Note 12`) sits at the left of the
cell and the rest of the row is blank — space to handwrite what that note is about. 50 rows per
page, two columns.

## Navigation

- Cover → Contents (whole cover is tappable + an "Open notebook" button)
- Contents grid → subject (page 1)
- Subject page 1 → **Notes 51–100 →** chip → page 2 (`child_index 50`)
- Subject page 2 → **← Notes 1–50** chip → page 1 (`parent`)
- Any index row → its Cornell note page
- Note page: **Back** chip → the index page it belongs to (`parent`), corner triangles → prev/next note
- Every page: `Index` chip → Contents, `Cover` chip → cover
- Subject page 1 corner triangles → previous / next subject

## Tweak knobs

Top of `hierarchy.js`:

- `numSubjects` — how many subjects
- `firstPageCount` / `secondPageCount` — notes per index page (default 50 + 50 = 100)

If you change `firstPageCount` away from 50, also update `templates.js`:
- the `subject` grid's `dataSliceCount` (notes shown on page 1)
- the `Notes 51–100 →` chip's `linkValue` (the child index of the page-2 node)

## How to load

1. Open the editor, click **Generator** in the toolbar.
2. Clear the **Templates** pane, paste `templates.js`.
3. Clear the **Hierarchy** pane, paste `hierarchy.js`.
4. Click **Run Generator**, then **Import**.
