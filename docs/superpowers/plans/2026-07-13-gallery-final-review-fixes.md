# Gallery Final Review Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close all final whole-branch reviewer findings for gallery chrome, grid ownership, PDF text visibility, deterministic hierarchy IDs, and TTRPG documentation.

**Architecture:** Gallery collection tests define cross-product geometry and grid contracts while focused product tests define Academic/Work border structure. PDF export resolves and trims text once, computes an explicit-font visibility predicate, and uses that predicate for glyph and annotation emission. Hierarchy determinism re-executes scripts with the same injected deterministic `createId` sequence and compares node keys and IDs.

**Tech Stack:** TypeScript, JavaScript generator scripts, Vitest, jsPDF, React/Vite, Playwright Chromium, PDF.js, Poppler.

## Global Constraints

- Work only in `.worktrees/gallery-sample-flagships`.
- Never inspect or modify archived artifacts; never touch `scratch/`.
- Preserve visible example/skip controls, stable Home/Up navigation, 509x679 bounds, accessibility, writing space, restrained color, and grayscale legibility.
- Missing `fontSize` defaults to 12; explicit non-positive or non-finite ordinary text emits no PDF glyph and no text link.
- Harness keeps rejecting explicit non-positive bound text.
- Grid border modes `all`, `outside`, and `inside` require positive finite width and style other than `none`; mode `none` permits zero width/style `none`.
- Grid element-level `stroke` must be empty or `none`, and `strokeWidth` must be zero.
- Temporary browser/PDF evidence belongs under `/tmp/opencode` and must be removed before completion.

---

### Task 1: Add Gallery Contract Regressions

**Files:**
- Modify: `tests/helpers/gallerySampleHarness.ts`
- Modify: `tests/unit/gallerySampleHarness.test.ts`
- Modify: `tests/unit/gallerySamples/collection.test.ts`
- Modify: `tests/unit/gallerySamples/academicSuccess.test.ts`
- Modify: `tests/unit/gallerySamples/workProjectHub.test.ts`

**Interfaces:**
- Consumes: normalized templates, raw hierarchy sources, deterministic injected `createId`.
- Produces: strict grid validation, hierarchy key/ID repeat validation, eight distinct chrome geometry signatures, and single-edge product assertions.

- [ ] **Step 1: Write failing grid regressions**

Add table-driven cases asserting bordered modes reject width `0`, non-finite width, and style `none`; `none` accepts width `0`/style `none`; every grid rejects non-empty element `stroke` or positive element `strokeWidth`.

- [ ] **Step 2: Write failing deterministic hierarchy regression**

Execute hierarchy source containing a direct `Math.random()` node key/ID and assert `validateSharedGalleryInvariants` reports hierarchy node keys/IDs as non-deterministic across repeated execution. Keep injected `createId` fixture passing.

- [ ] **Step 3: Write failing geometry and edge regressions**

Derive chrome signature from example, skip, section identity, Home, Up, and major decorative frame geometry in one non-cover template per product; assert set size equals eight. Assert Academic and Work grids have empty/`none` stroke and zero stroke width. Assert Work decision/risk row fills have no stroke, one outer boundary exists, and each internal divider coordinate occurs once.

- [ ] **Step 4: Run RED**

Run: `npm test -- --run tests/unit/gallerySampleHarness.test.ts tests/unit/gallerySamples/collection.test.ts tests/unit/gallerySamples/academicSuccess.test.ts tests/unit/gallerySamples/workProjectHub.test.ts`

Expected: failures identify current repeated chrome, dual grid borders, weak bordered-grid validation, random hierarchy IDs, and doubled Work row edges.

- [ ] **Step 5: Implement minimal harness checks**

In `validateTemplates`, branch by `gridBorderMode`, reject element-level grid strokes, and emit contextual errors. In `validateDeterministicIds`, compare sorted node keys and each node object's `id` after repeated execution in addition to templates/elements.

---

### Task 2: Diversify Product Chrome and Fix Product Borders

**Files:**
- Modify: `gallery-samples/01-academic-success-system/templates.js`
- Modify: `gallery-samples/02-work-project-hub/templates.js`
- Modify: `gallery-samples/03-personal-finance-planner/templates.js`
- Modify: `gallery-samples/04-wellness-fitness-journal/templates.js`
- Modify: `gallery-samples/05-seasonal-kitchen/templates.js`
- Modify: `gallery-samples/06-travel-field-journal/templates.js`
- Modify: `gallery-samples/07-novel-story-studio/templates.js`
- Modify: `gallery-samples/08-ttrpg-campaign-codex/templates.js`

**Interfaces:**
- Consumes: existing page helper callers and bound `example_label`/`skip_label` fields.
- Produces: eight unique chrome signatures without changing template IDs or hierarchy links.

- [ ] **Step 1: Remove grid element strokes**

Set every grid helper's element `stroke` to empty and `strokeWidth` to `0`; leave explicit `gridConfig` as sole cell-border owner.

- [ ] **Step 2: Refactor Work register edges**

Change decisions/risks row rectangles to fill-only, add one outer boundary rectangle per register, and add one explicit line/rectangle divider per internal boundary.

- [ ] **Step 3: Implement seven domain-specific chrome geometries**

Keep Academic study rail identity. Implement Work architectural top beam/right project marker; Finance ledger folio/top rule/centered footer; Wellness soft side tabs/arched header motif; Kitchen editorial masthead/recipe tab; Travel route-line edge/waypoint navigation; Novel manuscript margin/thread folio; TTRPG codex corner marks/heraldic footer. Keep every bound control visible and linked.

- [ ] **Step 4: Run GREEN**

Run: `npm test -- --run tests/unit/gallerySampleHarness.test.ts tests/unit/gallerySamples/collection.test.ts tests/unit/gallerySamples/academicSuccess.test.ts tests/unit/gallerySamples/workProjectHub.test.ts`

Expected: all focused gallery contract tests pass.

---

### Task 3: Correct PDF Text Visibility and Link Gating

**Files:**
- Modify: `tests/unit/pdfLinks.test.ts`
- Modify: `services/pdfService.ts`

**Interfaces:**
- Consumes: resolved text, optional `TemplateElement.fontSize`, internal/URL link targets.
- Produces: missing-size fallback 12 and explicit invalid-size/blank-text suppression shared by glyph and annotation paths.

- [ ] **Step 1: Write failing PDF regressions**

Assert explicit numeric/string zero and non-finite text produce neither unique glyph token nor `/Dest`; missing `fontSize` produces unique visible text and `/Dest`; whitespace-only resolved binding produces neither text token nor `/Dest`.

- [ ] **Step 2: Run RED**

Run: `npm test -- --run tests/unit/pdfLinks.test.ts`

Expected: explicit zero currently falls back to 12 and whitespace remains truthy.

- [ ] **Step 3: Implement one visibility predicate**

Trim `resolveText` output. Compute `fontSize = el.fontSize === undefined ? 12 : Number(el.fontSize)` and `renderText = textContent.length > 0 && Number.isFinite(fontSize) && fontSize > 0`. Use `renderText` around `applyFont`, text drawing, decoration, and text-element `applyElementLink`; retain non-text link behavior and grid/runtime defaults.

- [ ] **Step 4: Run GREEN**

Run: `npm test -- --run tests/unit/pdfLinks.test.ts tests/unit/gallerySampleHarness.test.ts`

Expected: PDF behavior and strict bound-text harness tests pass.

---

### Task 4: Correct TTRPG Documentation

**Files:**
- Modify: `gallery-samples/08-ttrpg-campaign-codex/README.md`

- [ ] **Step 1: Replace exact copy**

Change `Skip to blank workspace ->` to `Skip to blank workspace →`.

- [ ] **Step 2: Verify exact copy**

Run: `npm test -- --run tests/unit/gallerySamples/ttrpgCampaignCodex.test.ts tests/unit/gallerySamples/collection.test.ts`

Expected: both files pass.

---

### Task 5: Browser, PDF, and Full Verification

**Files:**
- Create temporarily: `/tmp/opencode/gallery-final-review/`
- Append: `.superpowers/sdd/final-review-fix-report.md`

- [ ] **Step 1: Run gallery and unit suites**

Run: `npm test -- --run tests/unit/gallerySampleHarness.test.ts tests/unit/gallerySamples tests/unit/pdfLinks.test.ts`

Run: `npm test -- --run`

- [ ] **Step 2: Run build and static checks**

Run: `npm run build`

Run: `git diff --check`

- [ ] **Step 3: Verify real browser imports and links**

Import representative pages through production hierarchy modal in Chromium. Exercise example Skip plus Home/Up links for all products and capture changed representative templates.

- [ ] **Step 4: Inspect new color and grayscale PDFs**

Generate representative exports under `/tmp/opencode/gallery-final-review`, rasterize changed chrome and Work/Academic grid pages, compare editor/color/grayscale output, and record distinctness, bounds, border ownership, writing space, and link behavior.

- [ ] **Step 5: Commit, report, and clean**

Inspect status/diff/log, stage only intended files, commit normal source/tests/docs changes, append exact commands/results/evidence/commit hashes/concerns to ignored report, remove `/tmp/opencode/gallery-final-review`, and verify no temporary processes remain.
