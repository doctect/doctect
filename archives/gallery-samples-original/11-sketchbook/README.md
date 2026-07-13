# Sketchbook & Art Portfolio

Gallery metadata + generator scripts for the Sketchbook sample project.

## Gallery metadata

- **Title:** Sketchbook & Art Portfolio
- **Tags:** `art` `sketchbook` `drawing` `creative` `portfolio` `artist`
- **Description:** A sketchbook you can shape to how you draw. It's organised by paper surface — dot grid, square grid, ruled, and blank — so you flip straight to the guide you want, plus a Gallery to catalogue finished pieces with title, medium, date, and a framed plate. Line-art cover included. Rename the sections and pages to your projects.

## Structure

```
cover (root, easel/landscape art)
└── Sketchbook (section, id "contents")
    ├── Dot Grid (section)    └ Page × 16 (page_dot)
    ├── Square Grid (section) └ Page × 16 (page_grid)
    ├── Ruled (section)       └ Page × 16 (page_lined)
    ├── Blank (section)       └ Page × 16 (page_blank)
    └── Gallery (section)     └ Piece × 12 (gallery — title/medium/date + framed plate)
```

- Templates: `cover`, `section`, `page_dot`, `page_grid`, `page_lined`, `page_blank`, `gallery`
- Default size: 83 nodes / 83 pages
- Page: reMarkable Paper Pro, 509 × 679

## SVG + patterns

The cover is a pure-shape SVG (a framed landscape on an easel). Each drawing surface is a pattern
fill: `dots` for dot grid, overlaid `lines-h` + `lines-v` for square grid, `lines-h` for ruled, and
a faint border for blank — all in a light guide colour so pen strokes read on top.

## Navigation

- Cover → Sketchbook; Sketchbook grid → a surface section or Gallery; section grid → a page
- Every page: `Index` → Sketchbook, `Cover` → cover, `Back`/`Gallery` chip → parent, corner triangles → prev/next

## Tweak knobs

Top of `hierarchy.js`: `surfaces` (name + page type), `pagesPerSurface`, `galleryPieces`.

## How to load

1. Editor → **Generator**.
2. Clear the **Templates** pane, paste `templates.js`.
3. Clear the **Hierarchy** pane, paste `hierarchy.js`.
4. **Run Generator**.
