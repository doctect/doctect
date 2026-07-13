# Story Atelier

Editorial novel-planning studio for reMarkable Paper Pro. Aubergine structure rails, antique-gold metadata, warm paper, manuscript typography, and original threaded-page artwork connect premise, story bible, chapters, scenes, continuity, and revision.

## Workflow

1. Define logline, reader promise, stakes, and dramatic question.
2. Shape each act through opening state, pressure, turn, climax, and exit state.
3. Build canonical character and location records in stable story-bible banks.
4. Map chapters, then assemble each chapter from directly accessible scene cards.
5. Give every scene a goal, conflict, outcome, POV, setting, story time, and continuity state.
6. Audit continuity and complete four focused revision passes.

Start Here offers a guided short mystery and a direct path to the clean blank workspace. Every guided page, including reference wrappers, displays **EXAMPLE** and a visible **Skip to blank workspace** control.

## Guided Mystery

**The Missing Seven Minutes** demonstrates one complete miniature chapter:

- Scene 01 identifies seven minutes missing from a railway arrival ledger.
- Scene 02 tests a witness account against official timing.
- Scene 03 reconstructs the platform route from a signal thread before the last train departs.
- Scene cards reference canonical records for detective Mara Venn, witness Elian Rowe, and Northbridge railway platform.
- A continuity ledger tracks time, knowledge, objects, weather, and movement across all three scenes.
- Four revision pages demonstrate structure, character, continuity, and line-edit passes.

All names, events, records, and railway details in this branch are teaching fiction.

## Configuration

Edit `DEFAULT_CONFIG` near the top of `hierarchy.js` before generation:

```js
const DEFAULT_CONFIG = {
  actCount: 3,
  chaptersPerAct: 8,
  scenesPerChapter: 3,
  characterCount: 12,
  locationCount: 8,
};
```

Supported integer ranges:

| Setting | Range | Purpose |
|---|---:|---|
| `actCount` | 1-5 | Act structure pages and chapter maps |
| `chaptersPerAct` | 1-12 | Chapter planners in each act map |
| `scenesPerChapter` | 1-6 | Scene cards attached to each chapter |
| `characterCount` | 1-30 | Canonical character records |
| `locationCount` | 1-20 | Canonical location records |

Unsupported or non-integer values fail with a clear `Story Atelier config` error before hierarchy generation.

## Inventory

Default configuration exports 151 pages:

- 1 cover and 1 Start Here guide
- 18 guided mystery pages; eight reference wrappers do not duplicate exported pages
- 1 blank workspace, 1 premise, and 3 act-structure pages
- 12 character records and 8 location records, each behind a stable bank index
- 3 chapter maps, 24 chapter planners, and 72 scene cards
- 1 continuity ledger and 4 revision passes

Minimum configuration exports 35 pages. Maximum configuration exports 509 pages. All supported banks and maps remain complete and within page bounds.

## Navigation

- Cover -> `start_here`
- Start Here -> `example_workspace` or `blank_workspace`
- Workspace cards -> premise, each act structure, story-bible banks, each act chapter map, continuity, and revision passes
- Character/location bank cards -> every canonical record
- Chapter-map cards -> every chapter in that act
- Chapter cards -> every scene in that chapter
- Guided scene cards -> reference wrappers for canonical character and location records
- **Up** follows the hierarchy parent; **Home** returns to `root`

Indexes use complete hierarchy-backed grids with stable semantic node IDs. No long bank is truncated, no fragile child-index link is used, and no inactive previous/next control is shown.

## Visual And Border Construction

Original manuscript-page, thread, and stitch SVG motifs were authored for Story Atelier. Aubergine establishes structural hierarchy; antique gold marks metadata and transitions; warm paper keeps writing regions calm. Contrast and hierarchy remain readable in grayscale.

Navigation grids explicitly use solid 0.8 px aubergine borders. Grid elements have no second stroke, preventing duplicate edges. Writable regions use visible `#fffaf3` fill with unstroked surfaces so scene planning, continuity, and revision space remains clear in PDF output.
