# Novel & Manuscript Planner

Gallery metadata + generator scripts for the Novel Planner sample project.

## Gallery metadata

- **Title:** Novel & Manuscript Planner
- **Tags:** `writing` `novel` `author` `fiction` `outline` `worldbuilding`
- **Description:** Everything to plan a novel in one place. Outline the manuscript from acts down to chapters and scenes, keep a character sheet and a location sheet for every player and place, and — the good part — every scene links straight to its POV character and its setting. Those sheets are written once and shared: tap "POV" or "Setting" from any scene and you land on the same page you filled in elsewhere. Rename anything, and re-point a scene's POV or setting with the tree's "Link Existing Page (Reference)" action.

## Structure

```
cover (root)
└── Book hub (book_hub, id "contents")   — Manuscript / Characters / Locations + logline
    ├── Manuscript (section, id "manuscript")
    │   └── Act 1..3 (section)
    │       └── Chapter 1..6 (chapter — synopsis + scene index + notes)
    │           └── Scene 1..5 (scene — writing page)
    │               ├── → POV character   (reference pointer, child 0)
    │               └── → Setting location (reference pointer, child 1)
    ├── Characters (section, id "characters")
    │   └── Character 1..12 (character — role/goal/traits/arc/notes)
    └── Locations (section, id "locations")
        └── Location 1..10 (location — type/description/atmosphere/notes)
```

- Templates: `cover`, `book_hub`, `section`, `chapter`, `scene`, `character`, `location`
- Default size: 318 nodes — but the 180 reference pointers **add no pages** (references
  resolve to the original sheet), so the exported PDF is 138 pages.
- Page: reMarkable Paper Pro, 509 × 679

## How references work here

Each scene owns two reference pointers: child 0 → a character, child 1 → a location. The scene's
indigo **POV ▸** and **Setting ▸** chips are `child_index` links to those pointers, and the engine
resolves a link-to-a-reference to the original node's page. So the character/location sheet you
write is shared by every scene that points at it — no duplicate pages. Defaults cycle through the
banks; re-point any scene from the editor tree.

## Navigation

- Cover → book hub; hub buttons → Manuscript / Characters / Locations
- Section grids → their children (acts, chapters via act, characters, locations)
- Chapter scene-grid → scene; scene **POV**/**Setting** → shared character/location sheet
- Every page: `Index` → hub, `Cover` → cover, `Back` chip → parent, corner triangles → prev/next sibling

## Tweak knobs

Top of `hierarchy.js`: `bookTitle`, `acts`, `chaptersPerAct`, `scenesPerChapter`,
`numCharacters`, `numLocations`.

## How to load

1. Editor → **Generator**.
2. Clear the **Templates** pane, paste `templates.js`.
3. Clear the **Hierarchy** pane, paste `hierarchy.js`.
4. **Run Generator**.
