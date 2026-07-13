# Story Atelier Scene Links Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every Story Atelier scene an exported Cast & Places companion page with writable, direct PDF links to every configured character and location.

**Architecture:** Each scene owns one real `scene_links` page. That page owns two reference wrappers targeting the canonical Character Bank and Location Bank; two grids use children-of-children traversal to reach every bank record without duplicating exported pages. The main scene card links to the companion through its only child.

**Tech Stack:** JavaScript generator scripts, TypeScript, Vitest, jsPDF, existing gallery-sample harness and PDF exporter.

## Global Constraints

- Source design: `docs/superpowers/specs/2026-07-13-story-atelier-scene-links-design.md`.
- Target remains reMarkable Paper Pro at exactly 509×679.
- Keep configuration ranges unchanged: acts 1–5, chapters per act 1–12, scenes per chapter 1–6, characters 1–30, locations 1–20.
- Every guided and blank scene receives one exported companion page.
- Every companion receives exactly two ordered group references: Character Bank, then Location Bank.
- Character and location records remain canonical and export once.
- Location grid must use `offsetMode: "static"` and `offsetStart: 1`.
- Blank cells provide numbered writable name lines; guided cells show concise example names.
- Main scene planning fields retain their current useful dimensions.
- All grids keep explicit, renderer-valid, non-overlapping borders.
- Existing untracked `.superpowers/brainstorm/` and `scratch/` files remain untouched.

---

### Task 1: Pre-linked Cast & Places Companion

**Files:**
- Modify: `gallery-samples/07-novel-story-studio/templates.js`
- Modify: `gallery-samples/07-novel-story-studio/hierarchy.js`
- Modify: `gallery-samples/07-novel-story-studio/README.md`
- Modify: `tests/unit/gallerySamples/novelStoryStudio.test.ts`

**Interfaces:**
- Consumes: existing `addNode`, `characterData`, `locationData`, `sceneData`, `grid`, `pageBase`, `titleBlock`, `computePageOrder`, and `traverseGridData`.
- Produces: template ID `scene_links`; `link_label` on canonical character/location records; one companion child per scene; two bank references per companion.

- [ ] **Step 1: Extend the product contract and add failing page-count tests**

Update expected templates to include `scene_links`, and change default contract range to `[220, 235]`. Assert production export counts:

```ts
it('exports one Cast & Places companion per scene', () => {
    const defaults = loadGallerySample(contract.slug);
    const minimum = loadGallerySample(contract.slug, {
        actCount: 1,
        chaptersPerAct: 1,
        scenesPerChapter: 1,
        characterCount: 1,
        locationCount: 1,
    });
    const maximum = loadGallerySample(contract.slug, {
        actCount: 5,
        chaptersPerAct: 12,
        scenesPerChapter: 6,
        characterCount: 30,
        locationCount: 20,
    });

    expect(exportedPageCount(defaults)).toBe(226);
    expect(exportedPageCount(minimum)).toBe(39);
    expect(exportedPageCount(maximum)).toBe(872);
});
```

- [ ] **Step 2: Add failing hierarchy and traversal tests**

For every canonical `scene` node, assert:

```ts
expect(scene.children).toHaveLength(1);
const links = sample.nodes[scene.children[0]];
expect(links.type).toBe('scene_links');
expect(links.parentId).toBe(scene.id);
expect(links.children).toHaveLength(2);
expect(sample.nodes[links.children[0]].referenceId).toMatch(/character_bank$/);
expect(sample.nodes[links.children[1]].referenceId).toMatch(/location_bank$/);
```

Use `traverseGridData` with each template grid's actual `traversalPath`; assert default returns 12 character IDs and 8 location IDs, maximum returns 30 and 20, and first/last IDs are canonical bank children.

Assert companion grids:

```ts
expect(characterGrid.gridConfig).toMatchObject({
    cols: 3,
    sourceType: 'current',
    displayField: 'link_label',
    offsetMode: 'static',
    offsetStart: 0,
    traversalPath: [
        { sliceStart: 0, sliceCount: 1 },
        { sliceStart: 0 },
    ],
});

expect(locationGrid.gridConfig).toMatchObject({
    cols: 3,
    sourceType: 'current',
    displayField: 'link_label',
    offsetMode: 'static',
    offsetStart: 1,
    traversalPath: [
        { sliceStart: 1, sliceCount: 1 },
        { sliceStart: 0 },
    ],
});
```

- [ ] **Step 3: Run focused tests to verify RED**

Run:

```bash
npm test -- --run tests/unit/gallerySamples/novelStoryStudio.test.ts
```

Expected: FAIL because `scene_links` does not exist, scenes have zero or manually selected reference children, traversal does not cover both banks, and page counts remain 151/35/509.

- [ ] **Step 4: Add canonical link labels and scene-link hierarchy helper**

Add `link_label` defaults:

```js
const characterData = (number, values = {}) => {
  const label = String(number).padStart(2, '0');
  return {
    subtitle: 'Desire, contradiction, voice, and scene-ready detail.',
    menu_label: `CHARACTER ${label}`,
    link_label: `${label}  __________________`,
    role: '', want: '', need: '', secret: '', voice: '', appearance: '', history: '', notes: '',
    ...values,
  };
};

const locationData = (number, values = {}) => {
  const label = String(number).padStart(2, '0');
  return {
    subtitle: 'A place as pressure system, social space, and continuity anchor.',
    menu_label: `LOCATION ${label}`,
    link_label: `${label}  __________________`,
    sensory: '', function: '', change: '', history: '', notes: '',
    ...values,
  };
};
```

Override guided records with concise labels such as `01  MARA VENN`, `02  ELIAN ROWE`, and `01  NORTHBRIDGE PLATFORM`.

Replace `addReference` with:

```js
const addSceneLinks = (sceneId, linksId, characterBankId, locationBankId, sceneNumber, example = false) => {
  addNode(linksId, sceneId, 'scene_links', `Scene ${String(sceneNumber).padStart(2, '0')} | Cast & Places`, {
    subtitle: 'Write the names used in this scene. Every slot already links to its canonical story-bible record.',
    menu_label: 'CAST & PLACES',
  }, { example });

  addNode(`${linksId}_characters`, linksId, 'bank', 'Character Links', {
    menu_label: 'CHARACTERS',
  }, { example, referenceId: characterBankId });

  addNode(`${linksId}_locations`, linksId, 'bank', 'Location Links', {
    menu_label: 'LOCATIONS',
  }, { example, referenceId: locationBankId });
};
```

Call it once after creating every guided and blank scene. Remove eight manually selected guided record references.

- [ ] **Step 5: Add the companion template and scene-card control**

Replace scene-card linked-record label/grid with one visible text control:

```js
text('scene', 'cast_places', 36, 500, 445, 48, 'CAST & PLACES  →', {
  fontSize: 10,
  fontWeight: 'bold',
  textColor: COLORS.aubergineDeep,
  fill: COLORS.auberginePale,
  align: 'center',
  linkTarget: 'child_index',
  linkValue: '0',
  borderRadius: 3,
})
```

Add `scene_links` with normal Story Atelier chrome/title, a character heading/grid and a visually separate location heading/grid:

- Character heading y=160; grid x=36, y=184, cell 137×18, 3 columns, gapY=2.
- Location heading y=400; grid x=36, y=424, cell 137×18, 3 columns, gapY=2.
- Character grid maximum ends at y=382.
- Location grid maximum, including its offset cell, ends at y=562.
- Both grids use no element-level stroke, explicit 0.8px borders, and `link_label` display.
- Location grid starts with one empty offset cell and `showEmptyCellBorders: false`.

Add `scene_links` to the returned template map.

- [ ] **Step 6: Add label-width, bounds, and canonical-export tests**

Use jsPDF Helvetica metrics at the actual grid font size; assert every default and maximum `link_label` is no wider than `cell.w - 8`.

Assert `validateGallerySample` returns no errors for minimum/default/maximum configurations. Update the existing maximum reachability test so ordinary hierarchy pages use their `navigator`, while each `scene_links` page validates its separate character and location traversal grids. Assert `computePageOrder` includes every `scene_links` page but excludes both bank-reference children. Assert canonical character/location IDs occur once in export order.

- [ ] **Step 7: Run focused tests to verify GREEN**

Run:

```bash
npm test -- --run tests/unit/gallerySamples/novelStoryStudio.test.ts tests/unit/gallerySampleHarness.test.ts
```

Expected: both files PASS.

- [ ] **Step 8: Update README**

Document the companion workflow, children-of-children bank traversal, numbered writable labels, location offset, direct PDF links, and exact 39/226/872 page counts. Remove claims that guided scenes manually select only their relevant records.

- [ ] **Step 9: Commit**

```bash
git add gallery-samples/07-novel-story-studio tests/unit/gallerySamples/novelStoryStudio.test.ts
git commit -m "fix(samples): prelink Story Atelier scene records"
```

---

### Task 2: PDF and Browser Verification

**Files:**
- Modify only if verification exposes a defect: Task 1 files

**Interfaces:**
- Consumes: generated Story Atelier state and production `generatePDF`/Hierarchy Generator.
- Produces: evidence that companion links work in editor import and exported PDF at default and maximum bank counts.

- [ ] **Step 1: Add focused PDF annotation test**

Generate Story Atelier with a compact configuration, export it using production `generatePDF`, and inspect link annotations. For a `scene_links` page, resolve and assert annotations target:

- first and last character pages;
- first and last location pages;
- parent scene through **Up**;
- `root` through **Home**.

The compact fixture must still include at least two characters and two locations so offset behavior is observable.

- [ ] **Step 2: Run the focused PDF annotation test**

Run:

```bash
npm test -- --run tests/unit/gallerySamples/novelStoryStudio.test.ts
```

Expected: PASS without production exporter changes. If it fails, use systematic debugging to correct generator hierarchy/template wiring before continuing.

- [ ] **Step 3: Run product and collection suites**

Run:

```bash
npm test -- --run tests/unit/gallerySamples tests/unit/gallerySampleHarness.test.ts tests/unit/pdfLinks.test.ts
```

Expected: all suites PASS.

- [ ] **Step 4: Run full suite and build**

Run:

```bash
npm test -- --run && npm run build
```

Expected: all tests PASS; Vite build exits 0.

- [ ] **Step 5: Verify in real browser and PDF**

Through Hierarchy Generator, import Story Atelier and inspect:

1. Guided Scene 02 → Cast & Places → Mara, Elian, and Northbridge links.
2. Blank first scene → Cast & Places → all 12 character and 8 location slots.
3. Location grid's first empty offset cell has no border or link.
4. Names have practical handwriting room and neither grid overlaps footer.
5. Main Scene Card planning fields retain their prior dimensions.

Export representative guided/blank links pages in color and grayscale. Click first/last character and location PDF links; verify correct canonical destinations. Keep temporary artifacts outside repository and remove them afterward.

- [ ] **Step 6: Inspect final status and commit verification fixes**

Run:

```bash
git status --short
git diff --check -- gallery-samples/07-novel-story-studio tests/unit/gallerySamples/novelStoryStudio.test.ts
```

If verification required source changes, commit them:

```bash
git add gallery-samples/07-novel-story-studio tests/unit/gallerySamples/novelStoryStudio.test.ts
git commit -m "test(samples): verify Story Atelier scene links"
```
