# Story Atelier Scene Cast & Places Links

**Date:** 2026-07-13  
**Status:** Approved design

## Problem

Story Atelier's guided mystery manually attaches selected character and location references to each scene. Blank scene cards have no reference children. This demonstrates Doctect's editor but fails PDF-only users: after export they cannot add links from a scene to the story-bible records they later name by hand.

## Goal

Every guided and blank scene must provide PDF links to every configured character and location record, while preserving enough room to handwrite names and keeping the main scene-planning fields spacious.

## Design

### Hierarchy

Each scene owns one exported `scene_links` companion page:

```text
Scene Card
└── Cast & Places page
    ├── Character Bank reference
    │   └── every configured character
    └── Location Bank reference
        └── every configured location
```

The two group nodes are reference wrappers targeting the canonical Character Bank and Location Bank. Grid traversal follows each wrapper's referenced target, so canonical records export once and links resolve to their existing pages.

The scene card links to its companion through `child_index: 0`. The companion's **Up** control returns to the scene; **Home** returns to `root`.

### Companion template

Add template ID `scene_links`.

- Character section traverses companion child 0, then that bank's children.
- Location section traverses companion child 1, then that bank's children.
- Location grid sets `offsetMode: "static"` and `offsetStart: 1` so its first row is visibly offset from the character set.
- Both grids use three columns, explicit non-overlapping borders, and fixed cell geometry that fits maximum configuration: 30 characters and 20 locations.
- Guided records show concise real example names.
- Blank records expose numbered writable labels such as `01  ____________`; labels remain directly linked to canonical record pages.
- Character and location sections use distinct but related fills/labels within Story Atelier's aubergine, antique-gold, and paper palette.

### Scene card

Retain Goal, Conflict, Outcome, POV, Setting, Story Time, and Continuity fields at their current useful sizes. Replace the current linked-record grid with a prominent **Cast & Places →** control targeting the companion page.

### Hierarchy generation

- Remove guided scenes' manually selected character/location reference wrappers.
- Create one companion page for every guided and blank scene.
- Give each companion exactly two ordered group references: Character Bank, then Location Bank.
- Populate canonical character/location data with a concise `link_label`:
  - guided: actual example name;
  - blank: numbered writable line.
- Supported configuration ranges remain unchanged.

## Page Counts

Reference wrappers do not export. Companion pages do.

- Minimum: 39 exported pages.
- Default: 226 exported pages.
- Maximum: 872 exported pages.

Tests must calculate and assert these values from production `computePageOrder` rather than only trusting documentation.

## Documentation

Update Story Atelier README to explain:

- every scene has an adjacent Cast & Places page;
- every configured character and location is pre-linked before PDF export;
- PDF users write names into numbered slots;
- location slots use an offset row for visual separation;
- revised inventory and page counts.

## Validation

Automated tests must prove:

1. Every scene has exactly one `scene_links` child.
2. Every companion has exactly two ordered bank-reference children.
3. Children-of-children traversal returns all characters and all locations at minimum, default, and maximum configurations.
4. Location grid uses static offset `1`; character grid starts at `0`.
5. First and last character/location cells link to canonical pages in generated PDF annotations.
6. Canonical records export once; group references do not export.
7. Writable labels fit inside cells using jsPDF font metrics.
8. Both expanded grids and all chrome remain within 509×679.
9. Guided pages retain `EXAMPLE` and Skip controls; blank pages remain clean.
10. Updated minimum/default/maximum page counts match production export order.

## Scope

Modify only Story Atelier generator scripts, README, focused tests, and associated design/implementation documentation. No generator runtime or schema changes are required.
