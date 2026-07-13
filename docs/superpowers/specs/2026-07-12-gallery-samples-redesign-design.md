# Gallery Sample Collection Redesign

**Date:** 2026-07-12<br>
**Status:** Approved design

## Summary

Replace the current 13 shallow, visually repetitive gallery sample generators with eight deeply designed flagship products. Each product must be ready for real use, visually distinct, professional, and inviting. Products target reMarkable Paper Pro only and use restrained domain-specific color.

Current `gallery-samples/` content will not be deleted. Move the entire directory intact, including existing unread PDF and PNG artifacts, to `archives/gallery-samples-original/`. Create a new `gallery-samples/` containing the redesigned collection.

## Goals

- Seed the gallery with eight polished products rather than many cookie-cutter demos.
- Optimize for real use first; generator-feature demonstration and gallery impact are secondary.
- Give each product distinct typography, composition, palette, SVG motifs, and workflows.
- Provide one realistic guided example per workflow and a clean blank workspace.
- Mark example pages clearly and provide prominent links that skip directly to blank content.
- Use domain-appropriate document sizes: complete periods where completeness matters, compact structures elsewhere.
- Make all navigation robust and all grid borders intentional.

## Non-goals

- Supporting A4 or multiple device variants in this round.
- Preserving current sample names, hierarchy shapes, template counts, or page counts.
- Inspecting or reusing existing sample PDF/PNG artifacts.
- Modifying generator runtime behavior unless required to create reliable validation tests.
- Building a universal visual shell reused unchanged across products.

## Collection

### 1. Academic Success System

**Working identity:** Study Compass<br>
**Palette:** eucalyptus, terracotta, parchment

Workflow: semester overview → course dashboard → weekly plan → Cornell notes → revision cards → exam plan.

- Guided example: environmental-science course with lecture note, linked revision cards, assignment, and exam review.
- Blank workspace: configurable course count, 14 teaching weeks, reusable note and revision-card banks.
- Consolidates old Cornell Notes, Flashcards, and Semester Planner samples.

### 2. Work Project Hub

**Working identity:** Project Desk<br>
**Palette:** navy, ochre, stone

Workflow: portfolio dashboard → project brief → outcomes → board → meetings → decisions → risks → weekly review.

- Guided example: website launch showing a meeting decision becoming a project action.
- Blank workspace: configurable projects, boards, meeting logs, decision register, risk register, and weekly reviews.
- Consolidates old Meeting Notes and Kanban samples.

### 3. Personal Finance Planner

**Working identity:** Money Map<br>
**Palette:** forest, brass, cream

Workflow: annual outlook → monthly plan → transactions → category review → sinking funds → goals → year review.

- Guided example: one completed month with realistic income, bills, discretionary spending, and savings allocations.
- Blank workspace: all 12 months, transaction sheets, annual summaries, and debt/savings goals.
- Replaces old Budget Tracker.

### 4. Wellness & Fitness Journal

**Working identity:** Wellbeing Rhythm<br>
**Palette:** clay, sage, warm gray

Workflow: baseline → monthly intentions → habit grid → weekly movement plan → workout log → recovery/reflection.

- Guided example: balanced week with habits, two strength sessions, walking, energy, and recovery.
- Blank workspace: 12 monthly habit dashboards, 52 weekly reviews, and configurable workout logs. Do not generate an unnecessary 365-page daily journal.
- Consolidates old Habit Tracker and Workout Log.

### 5. Seasonal Kitchen

**Palette:** olive, tomato, oat

Workflow: seasonal index → recipe library → recipe page → weekly meal plan → pantry → shopping list.

- Guided example: autumn week with three recipes feeding one combined shopping list.
- Blank workspace: category recipe bank, 12 meal-planning weeks, pantry inventories, and reusable shopping lists.
- Replaces old Recipe Book.

### 6. Travel Field Journal

**Working identity:** Field Notes from Elsewhere<br>
**Palette:** sea green, rust, sand

Workflow: journey dashboard → reservations → itinerary → daily field notes → packing → expenses → highlights.

- Guided example: concise Lisbon trip with linked reservations and three planned days.
- Blank workspace: configurable trip count and duration, each with complete planning and journaling sections.
- Replaces old Travel Journal.

### 7. Novel Story Studio

**Working identity:** Story Atelier<br>
**Palette:** aubergine, antique gold, paper

Workflow: premise → structure → characters → locations → chapter map → scene cards → continuity → revision.

- Guided example: short mystery showing one chapter assembled from linked scene, character, and location records.
- Blank workspace: three-act skeleton, configurable chapters/scenes, story-bible banks, and revision passes.
- Replaces old Novel Planner.

### 8. TTRPG Campaign Codex

**Palette:** oxblood, moss, vellum

Workflow: campaign dashboard → party → sessions → quests → NPCs → locations → factions → encounters → lore.

- Guided example: one session whose quest, NPC, location, and consequence cross-reference one another.
- Blank workspace: campaign-ready session log and generous world-building banks.
- Replaces old TTRPG Journal.

Old Sketchbook is archived without replacement. Freeform drawing needs little hierarchy and demonstrates fewer of Doctect's core strengths than the selected flagships.

## Shared Product Experience

Each generated document begins with:

1. Distinct domain-specific cover.
2. One-page Start Here guide.
3. Two prominent choices: **Explore guided example** and **Skip to blank workspace**.
4. Guided example branch.
5. Clean blank-workspace branch.

Every example page must display a bound `EXAMPLE` eyebrow or badge and a visible **Skip to blank workspace** control targeting the stable blank-workspace node ID. Start Here and example hubs provide the same direct skip path. Blank pages must not contain fake user data.

Navigation uses clearly labeled Previous, Up, Next, and Home controls where those actions apply. Products may style and position navigation differently; they must not share one cookie-cutter header/footer. First/last pages must not display misleading active controls when no destination exists. Major destinations use stable node IDs, not fragile child indexes.

Related records should use references or stable direct links where they add practical value: note → revision card, meeting → decision, recipe → meal plan, scene → character/location, session → quest/NPC/location.

## Visual Direction

- Canvas: reMarkable Paper Pro, 509×679.
- Base surfaces: warm off-white rather than stark white.
- Color: two or three muted domain colors. Color establishes hierarchy and navigation; writing areas remain calm.
- Typography, cover composition, geometry, and SVG artwork must be domain-specific.
- Shared collection standards: spacing, legibility, touch-target size, contrast, and information hierarchy.
- Avoid repeated double-border covers, centered-title formulas, tiny gray chips, generic black rules, and identical triangle navigation.
- Designs must remain understandable in grayscale.

## Generator Architecture

Each product directory contains:

- `templates.js`: palette, SVG assets, element/layout helpers, and templates.
- `hierarchy.js`: clearly labeled configuration, node helpers, guided example, and blank workspace.
- `README.md`: product purpose, workflows, page inventory, configuration guide, and navigation map.

Scripts remain self-contained because `HierarchyGeneratorModal` executes them independently with `new Function`. Do not add runtime imports. Template scripts may use injected page-size constants but not `createId`; hierarchy scripts may use `templates` and `createId` but not page-size constants.

All template and element IDs must be deterministic. Major hierarchy destinations must have stable literal IDs. Repeated leaf nodes may use `createId` when no stable link targets them. Each hierarchy exposes a documented configuration block for counts, names, dates, and optional sections. Supported configuration changes must not invalidate navigation.

## Grid Border Standard

No grid may rely on renderer border defaults.

- Data tables explicitly set `gridBorderMode: "all"`, border color, width, style, header treatment, and row/column emphasis where used.
- Calendar and habit matrices draw a complete intentional cell structure, including empty/offset cells when required.
- Navigation-card grids use deliberate gaps, rounded cell borders, and explicit border properties.
- Borderless indexes explicitly set `gridBorderMode: "none"`; spacing and background establish grouping.
- Avoid doubled strokes caused by overlapping grid borders and decorative rectangles.
- Typical strokes are 0.75–1px. Stronger outer/header strokes require a clear hierarchy purpose.
- Expanded grid dimensions must remain within page bounds and clear headers, footers, and navigation.
- Grid borders must be checked in both editor rendering and PDF export.

## Validation and Error Handling

Add development-only validation tooling/tests that execute both scripts using the generator's two-stage scope model. Fail with product and object context when any invariant breaks.

Validate:

- Script syntax and runtime completion.
- Non-empty normalized templates and valid root node.
- Unique template, element, and node IDs.
- Resolved node types, parents, children, references, and stable link targets.
- Valid configured child indexes where an index link is unavoidable.
- Element bounds and expanded grid bounds within 509×679.
- Explicit grid border mode/color/width/style.
- Required Example markers and Skip-to-blank links.
- Valid minimum and representative configuration values.
- Expected page-count ranges.

Configuration constraints belong in each README. Invalid supported configurations must fail clearly rather than import a partially broken document.

## Verification

For each product:

1. Run automated generator and structural validation tests.
2. Import through the real hierarchy generator modal.
3. Inspect cover, Start Here, guided example, blank hub, densest grid/table, and a writing page.
4. Exercise hierarchy navigation, skip links, and cross-references.
5. Export representative pages and verify typography, SVG, grid borders, color, and PDF link annotations.
6. Check grayscale readability.

Existing PDFs and PNGs under the archived samples must never be opened. Newly generated verification artifacts should be temporary and kept outside product directories unless explicitly requested as final gallery assets.

## Filesystem Transition

1. Ensure `archives/` exists.
2. Move current untracked `gallery-samples/` intact to `archives/gallery-samples-original/`.
3. Create a new `gallery-samples/`.
4. Add eight numbered product directories and shared development validation tooling.

No archived file should be modified or inspected during this transition.

## Acceptance Criteria

- Eight products listed above generate successfully on reMarkable Paper Pro.
- Each has distinct, professional art direction and practical end-to-end workflow.
- Every product includes marked guided examples, with working skip-to-blank navigation on every example page.
- Blank workspaces are immediately usable and avoid generic filler.
- All important links and references resolve after supported configuration changes.
- All grid borders are explicit, intentional, non-overlapping, and verified in editor/PDF output.
- No page content or expanded grid overflows or collides with navigation.
- Automated tests and project build pass.
- Existing sample tree is preserved intact under `archives/gallery-samples-original/` without opening its PDF/PNG artifacts.
