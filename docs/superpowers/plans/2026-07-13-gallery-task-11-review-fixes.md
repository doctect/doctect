# Gallery Task 11 Review Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close every Task 11 review finding with stronger visible-chrome contracts, path-specific PDF regressions, all-product browser annotation clicks, and concrete visual evidence.

**Architecture:** Permanent changes stay in gallery validation tests, PDF regression tests, and approved docs. Browser/PDF generation, PDF.js viewer, captures, rasterized pages, manifests, and contact sheets live only under `/tmp/opencode`; browser clicks exercise PDF.js-rendered annotation anchors and assert resulting viewer page numbers.

**Tech Stack:** TypeScript, Vitest, jsPDF, PDF.js 5.4.624, Playwright Chromium, Vite/React editor, Poppler rasterization, ImageMagick contact sheets.

## Global Constraints

- Never open or inspect archived PDF/PNG artifacts.
- Keep all generated PDFs, images, browser harnesses, servers, and logs under `/tmp/opencode` and remove them before completion.
- Use red-green TDD for every permanent behavior change.
- Do not reject missing or zero `fontSize` when renderer fallback makes text visible; reject only non-positive effective sizes.
- Browser proof must click rendered PDF.js annotation-layer anchors, not stop at annotation metadata.
- Run full tests and production build before completion.
- Produce one final Task 11 review-fix commit containing only intended source, tests, and docs.

---

### Task 1: Strengthen Visible Binding Contract

**Files:**
- Modify: `tests/helpers/gallerySampleHarness.ts`
- Modify: `tests/unit/gallerySampleHarness.test.ts`

**Interfaces:**
- Consumes: normalized template `layers`, text element dimensions/style, and renderer font fallback behavior.
- Produces: `isVisibleTextBinding(element, field, template)` that rejects hidden-layer, transparent, zero-opacity, non-positive-effective-font, and determinably same-color text/background bindings.

- [ ] **Step 1: Add failing parameterized regressions**

Add cases for a binding on `visible: false` layer, negative `fontSize`, transparent `textColor`, alpha-zero text color, and identical solid `textColor`/`fill`. Add passing controls for omitted and zero `fontSize`, because PDF rendering uses `Number(fontSize) || 12`.

- [ ] **Step 2: Verify RED**

Run: `npm test -- --run tests/unit/gallerySampleHarness.test.ts`

Expected: new hidden-layer/font/color cases fail against dimensions-and-opacity-only validation.

- [ ] **Step 3: Implement minimal visibility checks**

Pass template context into `isVisibleTextBinding`; resolve matching layer visibility, calculate effective font size with renderer-equivalent fallback, parse deterministic CSS colors including alpha, and compare opaque text color with opaque solid element fill.

- [ ] **Step 4: Verify GREEN**

Run: `npm test -- --run tests/unit/gallerySampleHarness.test.ts tests/unit/gallerySamples/collection.test.ts`

Expected: both files pass and all eight products retain visible example chrome.

---

### Task 2: Cover Every Changed Grid PDF Path

**Files:**
- Modify: `tests/unit/pdfSvgGrayscaleOpacity.test.ts`
- Modify only if a regression exposes a defect: `services/pdfService.ts`

**Interfaces:**
- Consumes: `generatePDF(..., { isGreyscale: true })` and decoded PDF operators.
- Produces: focused fixtures for patterned cells, rounded uniform cell borders, and specialized per-side borders, including element opacity graphics states.

- [ ] **Step 1: Add failing path-specific fixtures**

Create one-child grid states that force `fillType: 'pattern'`, `gridBorderRadius > 0` with uniform sides, and element `borderSides` with distinct colors. Assert original RGB operators are absent, gray operators are present, and opacity emits matching `/ca` and `/CA` values.

- [ ] **Step 2: Verify RED quality**

Temporarily revert each relevant grayscale conversion in the test worktree one path at a time or use pre-fix baseline evidence, confirming each fixture detects its designated path rather than passing through another branch.

- [ ] **Step 3: Apply minimal renderer fix if needed**

Change only a path whose fixture fails; preserve current color export behavior and opacity state handling.

- [ ] **Step 4: Verify GREEN**

Run: `npm test -- --run tests/unit/pdfSvgGrayscaleOpacity.test.ts tests/unit/pdfElementOpacity.test.ts`

Expected: all path fixtures and existing SVG/plain-shape opacity tests pass.

---

### Task 3: Verify Blank Descendant PDF Context

**Files:**
- Modify: `tests/unit/gallerySamples/collection.test.ts`

**Interfaces:**
- Consumes: each product's `blank_workspace` subtree and production ancestor text binding resolution.
- Produces: one real PDF export rooted at a non-root blank descendant per product with its complete ancestor chain retained.

- [ ] **Step 1: Add failing descendant regression**

Select the first non-reference descendant whose template contains the bound Skip element. Export that descendant while retaining ancestors and assert no `/Dest` annotation is emitted by the empty inherited Skip binding.

- [ ] **Step 2: Verify RED quality**

Remove the `blank_workspace` empty-string boundary in a controlled loaded sample and confirm the new descendant export emits `/Dest`.

- [ ] **Step 3: Restore product boundary and verify GREEN**

Run: `npm test -- --run tests/unit/gallerySamples/collection.test.ts`

Expected: all eight descendant exports contain no leaked Skip destination.

---

### Task 4: Correct Work Plan Contract

**Files:**
- Modify: `docs/superpowers/plans/2026-07-12-gallery-sample-collection.md`

**Interfaces:**
- Produces: Work Project Hub plan matching implemented 12-template terminal-review design.

- [ ] **Step 1: Update exact template contract**

Append `'weekly_review_final'` to Work `expectedTemplateIds` and change “Build 11 contract templates” to “Build 12 contract templates.”

- [ ] **Step 2: Verify doc consistency**

Compare plan list with `tests/unit/gallerySamples/workProjectHub.test.ts` and run `git diff --check`.

---

### Task 5: Exercise All-Product PDF Annotations in Chromium

**Files:**
- Create temporarily: `/tmp/opencode/gallery-task11-review/generate.test.ts`
- Create temporarily: `/tmp/opencode/gallery-task11-review/viewer.html`
- Create temporarily: `/tmp/opencode/gallery-task11-review/viewer.mjs`
- Create temporarily: `/tmp/opencode/gallery-task11-review/server.mjs`
- Create temporarily: `/tmp/opencode/gallery-task11-review/verify-links.mjs`

**Interfaces:**
- Consumes: complete generated color PDFs, PDF.js `PDFViewer`/`PDFLinkService`, source element rectangles, resolved target page numbers.
- Produces: click log containing product, role, source page, annotation ID, expected page, actual page, and PASS for every applicable Skip/Home/Up/Next and cross-reference case.

- [ ] **Step 1: Generate all eight PDFs and click manifest**

Use gallery loader plus production page ordering/link resolution to choose one valid annotation for each applicable role in each product and one cross-reference where available. Include source rectangle and exact expected target page.

- [ ] **Step 2: Serve genuine PDF.js viewer**

Render PDFs with PDF.js viewer components so normal annotation layers create clickable anchors. Expose viewer page state only for Playwright assertions.

- [ ] **Step 3: Click every manifested anchor**

For each case, navigate to source page, match rendered annotation by source rectangle/annotation ID, dispatch a real Playwright click, wait for PDF.js navigation, and assert `currentPageNumber === expectedTargetPage`.

- [ ] **Step 4: Record exact outcomes**

Write concise JSON/text evidence with command, click total, per-role totals, per-product totals, and every source/target result for report inclusion.

---

### Task 6: Produce and Inspect Visual Evidence

**Files:**
- Create temporarily: `/tmp/opencode/gallery-task11-review/editor/`
- Create temporarily: `/tmp/opencode/gallery-task11-review/pdf-color/`
- Create temporarily: `/tmp/opencode/gallery-task11-review/pdf-gray/`
- Create temporarily: `/tmp/opencode/gallery-task11-review/contact-*.png`

**Interfaces:**
- Consumes: one representative page per product, complete color/grayscale PDFs, production editor rendering.
- Produces: paired editor/color-PDF/grayscale-PDF images and concrete inspection notes.

- [ ] **Step 1: Capture representative editor pages**

Import each product through production hierarchy modal, select the chosen dense or cross-linked representative page, and capture editor canvas.

- [ ] **Step 2: Rasterize matching PDF pages**

Use `pdftoppm` on newly generated color and grayscale PDFs at the exact matching page numbers.

- [ ] **Step 3: Build compact contact sheets**

Create editor/color/grayscale sheets labeled by product without altering source artifacts.

- [ ] **Step 4: Inspect and record observations**

Record product-specific evidence for grid-border parity, distinct muted accents, grayscale hierarchy/legibility, and crisp SVG/vector appearance. Log any defect and fix it test-first before regenerating evidence.

---

### Task 7: Final Verification, Report, Cleanup, and Commit

**Files:**
- Modify ignored report: `.superpowers/sdd/task-11-report.md`
- Modify ignored progress: `.superpowers/sdd/progress.md`

**Interfaces:**
- Produces: exact red/green evidence, browser click outcomes, visual observations, final test/build counts, concerns, clean temporary state, and final commit hash.

- [ ] **Step 1: Run focused and full verification**

Run:

```bash
npm test -- --run tests/unit/gallerySampleHarness.test.ts tests/unit/gallerySamples/collection.test.ts tests/unit/pdfSvgGrayscaleOpacity.test.ts tests/unit/pdfElementOpacity.test.ts
npm test -- --run
npm run build
git diff --check
```

- [ ] **Step 2: Review final diff**

Check intended files only, no archive/scratch changes, no generated artifacts, and no unrelated modifications.

- [ ] **Step 3: Append Task 11 report**

Include exact commands/counts, per-role browser click totals, all-product visual observations, defects/fixes, known warnings, and temporary cleanup evidence.

- [ ] **Step 4: Remove temporary artifacts and stop servers**

Delete only `/tmp/opencode/gallery-task11-review` and verify no matching files/processes remain.

- [ ] **Step 5: Commit authorized files**

Commit source/tests/docs only with `test: close gallery verification gaps`, then update ignored report/progress with commit hash.
