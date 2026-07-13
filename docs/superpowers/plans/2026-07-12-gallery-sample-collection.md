# Gallery Sample Collection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Archive the 13 existing sample generators and build eight polished, real-use reMarkable Paper Pro sample products with guided examples, blank workspaces, intentional grids, robust navigation, and automated validation.

**Architecture:** Keep every sample as independent `templates.js` and `hierarchy.js` scripts compatible with `HierarchyGeneratorModal`'s two-stage `new Function` execution. Add test-only loader and contract validator that execute scripts with generator-equivalent scopes, normalize templates, validate hierarchy/link/grid/bounds invariants, and support optional `SAMPLE_CONFIG` overrides. Implement each flagship as an independently testable directory, then perform collection-wide browser and PDF verification.

**Tech Stack:** JavaScript generator scripts, TypeScript, Vitest, React/Vite application, jsPDF export, Playwright/manual browser verification.

## Global Constraints

- Source design: `docs/superpowers/specs/2026-07-12-gallery-samples-redesign-design.md`.
- Target only reMarkable Paper Pro: exactly 509×679.
- Move current `gallery-samples/` intact to `archives/gallery-samples-original/`; never open archived PDF/PNG files.
- Produce exactly eight numbered product directories listed below.
- Every example page displays bound `EXAMPLE` text and visible **Skip to blank workspace** navigation.
- Every product uses stable IDs `root`, `start_here`, `example_workspace`, and `blank_workspace`.
- Major navigation uses stable specific-node IDs; child-index links are allowed only when contract tests prove them valid for every node using that template.
- Every grid explicitly sets `gridBorderMode`, `gridBorderColor`, `gridBorderWidth`, and `gridBorderStyle`; no renderer border defaults.
- Grid and element bounds must fit 509×679 without collisions with page navigation.
- All template and element IDs are deterministic; generated IDs are allowed only for non-addressed repeated hierarchy leaves.
- Each `hierarchy.js` starts with a documented `DEFAULT_CONFIG` and supports test overrides using `typeof SAMPLE_CONFIG === 'object'`.
- Product scripts contain no imports. Template scope uses only page constants; hierarchy scope uses only `templates`, `createId`, and optional test-only `SAMPLE_CONFIG` detection.
- Existing user-owned `scratch/` files remain untouched.
- Commit steps are conditional: run them only after explicit user authorization to create commits.

## File Structure

### Shared validation

- `tests/helpers/gallerySampleHarness.ts` — load scripts, execute generator-equivalent scopes, normalize templates, compute hierarchy/grid bounds, and validate shared contracts.
- `tests/unit/gallerySampleHarness.test.ts` — focused harness regression tests.
- `tests/unit/gallerySamples/collection.test.ts` — exactly-eight collection and full-contract smoke tests.
- `gallery-samples/README.md` — collection index, shared conventions, and generation instructions.

### Products

Each directory contains only `templates.js`, `hierarchy.js`, and `README.md`:

1. `gallery-samples/01-academic-success-system/`
2. `gallery-samples/02-work-project-hub/`
3. `gallery-samples/03-personal-finance-planner/`
4. `gallery-samples/04-wellness-fitness-journal/`
5. `gallery-samples/05-seasonal-kitchen/`
6. `gallery-samples/06-travel-field-journal/`
7. `gallery-samples/07-novel-story-studio/`
8. `gallery-samples/08-ttrpg-campaign-codex/`

---

### Task 1: Preserve Existing Samples and Establish New Collection

**Files:**
- Move: `gallery-samples/` → `archives/gallery-samples-original/`
- Create: `gallery-samples/README.md`

**Interfaces:**
- Consumes: user authorization to archive existing samples without reading artifacts.
- Produces: empty fresh collection root for Tasks 3–10; intact archive excluded from all readers/tests.

- [ ] **Step 1: Verify filesystem preconditions without reading sample files**

Run:

```bash
test -d gallery-samples && test ! -e archives/gallery-samples-original && printf 'ready\n'
```

Expected: `ready`.

- [ ] **Step 2: Move old tree intact and create fresh root**

Run:

```bash
mkdir -p archives && mv gallery-samples archives/gallery-samples-original && mkdir gallery-samples
```

Do not enumerate, hash, inspect, or open files beneath `archives/gallery-samples-original/`.

- [ ] **Step 3: Write collection README**

Create `gallery-samples/README.md` with:

```markdown
# Doctect Gallery Flagships

Eight reMarkable Paper Pro document products generated through **Hierarchy Generator**.

Each product contains:
- `templates.js` — paste into Templates Script.
- `hierarchy.js` — paste into Hierarchy Script.
- `README.md` — workflow, configuration, page inventory, and navigation map.

Shared conventions:
- Open **Start Here** after the cover.
- Guided pages are marked **EXAMPLE**.
- Every guided page links directly to **Blank workspace**.
- Edit `DEFAULT_CONFIG` near the top of `hierarchy.js` before generation when different counts are needed.

Products:
1. Academic Success System
2. Work Project Hub
3. Personal Finance Planner
4. Wellness & Fitness Journal
5. Seasonal Kitchen
6. Travel Field Journal
7. Novel Story Studio
8. TTRPG Campaign Codex
```

- [ ] **Step 4: Verify transition shape without traversing archive**

Run:

```bash
test -d archives/gallery-samples-original && test -f gallery-samples/README.md && printf 'archive preserved; new root ready\n'
```

Expected: `archive preserved; new root ready`.

- [ ] **Step 5: Commit if explicitly authorized**

```bash
git add archives/gallery-samples-original gallery-samples/README.md
git commit -m "chore: archive original gallery samples"
```

---

### Task 2: Generator-Equivalent Sample Contract Harness

**Files:**
- Create: `tests/helpers/gallerySampleHarness.ts`
- Create: `tests/unit/gallerySampleHarness.test.ts`

**Interfaces:**
- Consumes: `normalizeGeneratedTemplates(raw)` and `getElementBounds(element, nodes, nodeId)`.
- Produces:
  - `loadGallerySample(slug: string, config?: Record<string, unknown>): LoadedGallerySample`
  - `executeGallerySample(templateSource: string, hierarchySource: string, config?: Record<string, unknown>): LoadedGallerySample`
  - `validateGallerySample(sample: LoadedGallerySample, contract: GallerySampleContract): string[]`
  - `validateSharedGalleryInvariants(sample: LoadedGallerySample): string[]`
  - `expectValidGallerySample(slug: string, contract: GallerySampleContract, config?: Record<string, unknown>): LoadedGallerySample`
  - `collectGallerySampleSlugs(): string[]`

- [ ] **Step 1: Write failing harness tests**

Create tests covering successful execution, bad parent/child/reference/type links, duplicate element IDs, overflow, implicit grid borders, missing example chrome, missing skip links, dead sibling links, and invalid child indexes. Use this exact valid fixture shape:

```ts
const templatesSource = `
return {
  cover: { id: 'cover', name: 'Cover', width: RM_PP_WIDTH, height: RM_PP_HEIGHT, elements: [
    { id: 'cover_open', type: 'text', x: 20, y: 20, w: 200, h: 30, text: 'Open', linkTarget: 'specific_node', linkValue: 'start_here' }
  ]},
  page: { id: 'page', name: 'Page', width: RM_PP_WIDTH, height: RM_PP_HEIGHT, elements: [
    { id: 'page_badge', type: 'text', x: 20, y: 20, w: 100, h: 20, text: '{{example_label}}' },
    { id: 'page_skip', type: 'text', x: 280, y: 20, w: 200, h: 20, text: '{{skip_label}}', linkTarget: 'specific_node', linkValue: 'blank_workspace' },
    { id: 'page_grid', type: 'grid', x: 20, y: 60, w: 100, h: 30, gridConfig: { cols: 2, gapX: 8, gapY: 8, sourceType: 'current', displayField: 'title', gridBorderMode: 'all', gridBorderColor: '#888888', gridBorderWidth: 1, gridBorderStyle: 'solid' } }
  ]}
};`;

const hierarchySource = `
const DEFAULT_CONFIG = { childCount: 2 };
const CONFIG = { ...DEFAULT_CONFIG, ...(typeof SAMPLE_CONFIG === 'object' ? SAMPLE_CONFIG : {}) };
const nodes = {
  root: { id: 'root', parentId: null, type: 'cover', title: 'Root', data: {}, children: ['start_here'] },
  start_here: { id: 'start_here', parentId: 'root', type: 'page', title: 'Start Here', data: {}, children: ['example_workspace', 'blank_workspace'] },
  example_workspace: { id: 'example_workspace', parentId: 'start_here', type: 'page', title: 'Example', data: { example_label: 'EXAMPLE', skip_label: 'Skip to blank workspace →' }, children: [] },
  blank_workspace: { id: 'blank_workspace', parentId: 'start_here', type: 'page', title: 'Blank workspace', data: {}, children: [] }
};
return { nodes, rootId: 'root' };`;
```

Contract fixture:

```ts
const contract: GallerySampleContract = {
  slug: 'fixture',
  expectedTemplateIds: ['cover', 'page'],
  pageCount: [4, 4],
  palette: ['#888888'],
  requiredStableNodeIds: ['root', 'start_here', 'example_workspace', 'blank_workspace'],
};
```

- [ ] **Step 2: Run test to verify failure**

Run: `npm test -- --run tests/unit/gallerySampleHarness.test.ts`

Expected: FAIL because `tests/helpers/gallerySampleHarness.ts` does not exist.

- [ ] **Step 3: Implement loader and contract types**

Define:

```ts
export interface LoadedGallerySample {
  slug: string;
  templates: Record<string, any>;
  nodes: Record<string, any>;
  rootId: string;
  templateSource: string;
  hierarchySource: string;
}

export interface GallerySampleContract {
  slug: string;
  expectedTemplateIds: string[];
  pageCount: [number, number];
  palette: string[];
  requiredStableNodeIds: ['root', 'start_here', 'example_workspace', 'blank_workspace'];
}
```

Execution must mirror production:

```ts
const templateFn = new Function('consts', `with (consts) { ${templateSource} }`);
const raw = templateFn({ RM_PP_WIDTH: 509, RM_PP_HEIGHT: 679, A4_WIDTH: 595, A4_HEIGHT: 842 });
const normalized = normalizeGeneratedTemplates(raw);
const templates = normalized.templates ?? normalized.variants![normalized.activeVariantId!].templates;
let sequence = 0;
const createId = (prefix = 'node') => `${prefix}_${String(++sequence).padStart(4, '0')}`;
const hierarchyFn = new Function('templates', 'createId', 'SAMPLE_CONFIG', hierarchySource);
const result = hierarchyFn(templates, createId, config);
```

Use `readFileSync` only for `gallery-samples/<slug>/templates.js` and `hierarchy.js`. Reject slugs containing `/`, `\\`, or `..` so the helper cannot traverse into `archives/`.

`collectGallerySampleSlugs()` reads only immediate child directories of `gallery-samples/`, includes a directory only when `templates.js`, `hierarchy.js`, and `README.md` all exist, and returns lexical order. `validateSharedGalleryInvariants()` performs all structure, link, example, grid, and bounds checks that do not depend on product-specific template IDs, palette, or page-count ranges. `validateGallerySample()` concatenates shared errors with contract-specific errors and confirms every contract palette color occurs in `templateSource`.

- [ ] **Step 4: Implement contract validation**

Return contextual strings rather than throwing on first failure. Validate all Global Constraints plus:

```ts
const GRID_STYLES = new Set(['solid', 'dashed', 'dotted', 'double', 'none']);
const GRID_MODES = new Set(['all', 'outside', 'inside', 'none']);
```

For every node/template pair, call `getElementBounds`. Add `x + bounds.w <= 509` and `y + bounds.h <= 679` checks. Resolve `specific_node`, `child_index`, `parent`, `ancestor`, `sibling`, and reference destinations. A sibling link is valid only when every node rendered by that template has the requested sibling. Walk descendants of `example_workspace`; each must have `data.example_label === 'EXAMPLE'`, `data.skip_label === 'Skip to blank workspace →'`, a template text binding for both fields, and a `specific_node` link to `blank_workspace` on the skip element.

- [ ] **Step 5: Run focused harness tests**

Run: `npm test -- --run tests/unit/gallerySampleHarness.test.ts`

Expected: all harness tests PASS.

- [ ] **Step 6: Run existing generator tests**

Run: `npm test -- --run tests/unit/generatorTemplates.test.ts tests/unit/gallerySampleHarness.test.ts`

Expected: both suites PASS.

- [ ] **Step 7: Commit if explicitly authorized**

```bash
git add tests/helpers/gallerySampleHarness.ts tests/unit/gallerySampleHarness.test.ts
git commit -m "test: validate gallery sample generators"
```

---

### Task 3: Academic Success System

**Files:**
- Create: `gallery-samples/01-academic-success-system/templates.js`
- Create: `gallery-samples/01-academic-success-system/hierarchy.js`
- Create: `gallery-samples/01-academic-success-system/README.md`
- Create: `tests/unit/gallerySamples/academicSuccess.test.ts`

**Interfaces:**
- Consumes: Task 2 harness and shared stable IDs/example fields.
- Produces: Study Compass generator with semester, courses, weekly plans, Cornell notes, revision cards, assignments, and exam plans.

- [ ] **Step 1: Write failing product contract test**

```ts
const contract: GallerySampleContract = {
  slug: '01-academic-success-system',
  expectedTemplateIds: ['cover', 'start', 'workspace', 'semester', 'course', 'week', 'cornell', 'deck', 'card_front', 'card_back', 'assignments', 'exam'],
  pageCount: [115, 160],
  palette: ['#496f62', '#bd654f', '#f5f0e5'],
  requiredStableNodeIds: ['root', 'start_here', 'example_workspace', 'blank_workspace'],
};

it('generates the complete Study Compass', () => {
  expectValidGallerySample(contract.slug, contract);
});

it('supports a one-course minimum without breaking navigation', () => {
  const sample = loadGallerySample(contract.slug, { courseCount: 1, teachingWeeks: 4, notesPerCourse: 1, cardsPerCourse: 1 });
  expect(validateGallerySample(sample, { ...contract, pageCount: [20, 45] })).toEqual([]);
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `npm test -- --run tests/unit/gallerySamples/academicSuccess.test.ts`

Expected: FAIL because product scripts do not exist.

- [ ] **Step 3: Implement templates**

Use warm parchment, eucalyptus navigation, and terracotta example/status accents. Include original SVG line art based on compass/leaf/book geometry. Implement all 12 exact template IDs from the contract. Cornell pages use a 30/70 cue-note split and bottom summary; revision cards have visually different question/answer faces; semester/course pages use restrained dashboard composition rather than generic index grids. Every grid includes all four explicit grid-border properties.

Every non-cover template includes data-bound text elements for `{{example_label}}` and `{{skip_label}}`; skip elements link to `blank_workspace`. Keep writing regions quiet and navigation labels at least 11px.

- [ ] **Step 4: Implement hierarchy**

Use:

```js
const DEFAULT_CONFIG = { courseCount: 4, teachingWeeks: 14, notesPerCourse: 6, cardsPerCourse: 8 };
const CONFIG = { ...DEFAULT_CONFIG, ...(typeof SAMPLE_CONFIG === 'object' ? SAMPLE_CONFIG : {}) };
```

Create one realistic environmental-science example linking one Cornell note to a two-sided revision card and exam plan. Build blank semester with 4 courses by default. Use references for revision cards linked from notes rather than duplicate card pages. Every example descendant receives both example fields. README documents configuration ranges: courses 1–6, weeks 4–18, notes 1–12, cards 1–20.

- [ ] **Step 5: Run product and harness tests**

Run: `npm test -- --run tests/unit/gallerySamples/academicSuccess.test.ts tests/unit/gallerySampleHarness.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit if explicitly authorized**

```bash
git add gallery-samples/01-academic-success-system tests/unit/gallerySamples/academicSuccess.test.ts
git commit -m "feat: add academic gallery flagship"
```

---

### Task 4: Work Project Hub

**Files:**
- Create: `gallery-samples/02-work-project-hub/templates.js`
- Create: `gallery-samples/02-work-project-hub/hierarchy.js`
- Create: `gallery-samples/02-work-project-hub/README.md`
- Create: `tests/unit/gallerySamples/workProjectHub.test.ts`

**Interfaces:**
- Consumes: Task 2 harness.
- Produces: Project Desk generator connecting project briefs, paper Kanban, meetings, decisions, risks, and reviews.

- [ ] **Step 1: Write failing product contract test**

```ts
const contract: GallerySampleContract = {
  slug: '02-work-project-hub',
  expectedTemplateIds: ['cover', 'start', 'workspace', 'portfolio', 'brief', 'board', 'meeting_index', 'meeting', 'decisions', 'risks', 'weekly_review', 'weekly_review_final'],
  pageCount: [50, 80],
  palette: ['#263f52', '#c79b45', '#eee9dd'],
  requiredStableNodeIds: ['root', 'start_here', 'example_workspace', 'blank_workspace'],
};

it('generates Project Desk', () => expectValidGallerySample(contract.slug, contract));
it('supports one compact project', () => {
  const sample = loadGallerySample(contract.slug, { projectCount: 1, meetingsPerProject: 1, reviewWeeks: 4 });
  expect(validateGallerySample(sample, { ...contract, pageCount: [18, 35] })).toEqual([]);
});
```

- [ ] **Step 2: Run test and confirm missing-file failure**

Run: `npm test -- --run tests/unit/gallerySamples/workProjectHub.test.ts`

Expected: FAIL because product scripts do not exist.

- [ ] **Step 3: Implement product scripts and README**

Use:

```js
const DEFAULT_CONFIG = { projectCount: 3, meetingsPerProject: 8, reviewWeeks: 12 };
```

Build 12 contract templates with architectural navy blocks, ochre milestones, stone writing surfaces, and original geometric SVG marks. Guided website-launch example must connect a meeting decision to a referenced decision record and visible board action. Blank projects include brief, outcomes, three-column board with intentional column borders/WIP labels, meeting index/logs, decision table, risk table, and weekly reviews. Do not render fake movable task cards; provide writable operational lanes. README ranges: projects 1–6, meetings 1–20, reviews 4–52.

- [ ] **Step 4: Run focused tests**

Run: `npm test -- --run tests/unit/gallerySamples/workProjectHub.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit if explicitly authorized**

```bash
git add gallery-samples/02-work-project-hub tests/unit/gallerySamples/workProjectHub.test.ts
git commit -m "feat: add work project gallery flagship"
```

---

### Task 5: Personal Finance Planner

**Files:**
- Create: `gallery-samples/03-personal-finance-planner/templates.js`
- Create: `gallery-samples/03-personal-finance-planner/hierarchy.js`
- Create: `gallery-samples/03-personal-finance-planner/README.md`
- Create: `tests/unit/gallerySamples/personalFinance.test.ts`

**Interfaces:**
- Consumes: Task 2 harness.
- Produces: Money Map annual budgeting, transaction, sinking-fund, and goal system.

- [ ] **Step 1: Write failing contract test**

```ts
const contract: GallerySampleContract = {
  slug: '03-personal-finance-planner',
  expectedTemplateIds: ['cover', 'start', 'workspace', 'annual', 'month', 'transactions', 'category_review', 'sinking_funds', 'goal', 'year_review'],
  pageCount: [58, 78],
  palette: ['#29483d', '#b68a4c', '#f4eddf'],
  requiredStableNodeIds: ['root', 'start_here', 'example_workspace', 'blank_workspace'],
};

it('generates all twelve blank months and a guided month', () => {
  const sample = expectValidGallerySample(contract.slug, contract);
  expect(Object.values(sample.nodes).filter((node: any) => node.type === 'month' && !node.data.example_label)).toHaveLength(12);
});

it('supports minimum transaction and goal banks', () => {
  const sample = loadGallerySample(contract.slug, { transactionPagesPerMonth: 1, goalCount: 1 });
  expect(validateGallerySample(sample, { ...contract, pageCount: [45, 65] })).toEqual([]);
});
```

- [ ] **Step 2: Run test and confirm failure**

Run: `npm test -- --run tests/unit/gallerySamples/personalFinance.test.ts`

Expected: FAIL because product scripts do not exist.

- [ ] **Step 3: Implement product scripts and README**

Use fixed 12-month blank structure and `DEFAULT_CONFIG = { transactionPagesPerMonth: 2, goalCount: 4 }`. Guided January contains realistic but clearly fictional income, housing, food, transport, leisure, and savings figures. Tables use explicit all-cell borders, a stronger header fill, consistent currency columns, and no overlapping decorative frame. Include annual cash-flow, monthly plan, transaction logs, category review, sinking funds, goals, and year review. Original SVG uses restrained ring/path motifs, never currency-brand imagery. README permits 1–4 transaction pages and 1–8 goals.

- [ ] **Step 4: Run focused tests**

Run: `npm test -- --run tests/unit/gallerySamples/personalFinance.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit if explicitly authorized**

```bash
git add gallery-samples/03-personal-finance-planner tests/unit/gallerySamples/personalFinance.test.ts
git commit -m "feat: add finance gallery flagship"
```

---

### Task 6: Wellness & Fitness Journal

**Files:**
- Create: `gallery-samples/04-wellness-fitness-journal/templates.js`
- Create: `gallery-samples/04-wellness-fitness-journal/hierarchy.js`
- Create: `gallery-samples/04-wellness-fitness-journal/README.md`
- Create: `tests/unit/gallerySamples/wellnessFitness.test.ts`

**Interfaces:**
- Consumes: Task 2 harness.
- Produces: Wellbeing Rhythm annual habits, weekly movement, workout, energy, and recovery journal.

- [ ] **Step 1: Write failing contract test**

```ts
const contract: GallerySampleContract = {
  slug: '04-wellness-fitness-journal',
  expectedTemplateIds: ['cover', 'start', 'workspace', 'baseline', 'month_habits', 'week', 'workout', 'recovery', 'month_reflection'],
  pageCount: [180, 220],
  palette: ['#a96551', '#7f9473', '#f1e7df'],
  requiredStableNodeIds: ['root', 'start_here', 'example_workspace', 'blank_workspace'],
};

it('generates a complete year without daily-page bloat', () => {
  const sample = expectValidGallerySample(contract.slug, contract);
  expect(Object.values(sample.nodes).filter((node: any) => node.type === 'month_habits' && !node.data.example_label)).toHaveLength(12);
  expect(Object.keys(sample.nodes).length).toBeLessThan(221);
});

it('supports a short journal without workout pages', () => {
  const sample = loadGallerySample(contract.slug, { monthCount: 1, weekCount: 4, workoutsPerWeek: 0 });
  expect(validateGallerySample(sample, { ...contract, pageCount: [15, 30] })).toEqual([]);
});
```

- [ ] **Step 2: Run test and confirm failure**

Run: `npm test -- --run tests/unit/gallerySamples/wellnessFitness.test.ts`

Expected: FAIL because product scripts do not exist.

- [ ] **Step 3: Implement product scripts and README**

Use `DEFAULT_CONFIG = { monthCount: 12, weekCount: 52, workoutsPerWeek: 2 }`. Guided week includes sleep, hydration, walking, two strength sessions, energy rating, and recovery notes without medical claims. Habit matrix uses explicit complete borders and legible day numbers; workout tables include movement, sets, reps, load, RPE, and notes. Separate recovery/reflection page prevents overloaded workout pages. Warm shapes and botanical/arc SVG motifs support calm identity. README ranges: months 1–12, weeks 4–52, workouts 0–4.

- [ ] **Step 4: Run focused tests**

Run: `npm test -- --run tests/unit/gallerySamples/wellnessFitness.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit if explicitly authorized**

```bash
git add gallery-samples/04-wellness-fitness-journal tests/unit/gallerySamples/wellnessFitness.test.ts
git commit -m "feat: add wellness gallery flagship"
```

---

### Task 7: Seasonal Kitchen

**Files:**
- Create: `gallery-samples/05-seasonal-kitchen/templates.js`
- Create: `gallery-samples/05-seasonal-kitchen/hierarchy.js`
- Create: `gallery-samples/05-seasonal-kitchen/README.md`
- Create: `tests/unit/gallerySamples/seasonalKitchen.test.ts`

**Interfaces:**
- Consumes: Task 2 harness.
- Produces: Seasonal Kitchen recipe, meal-plan, pantry, and shopping workflow.

- [ ] **Step 1: Write failing contract test**

```ts
const contract: GallerySampleContract = {
  slug: '05-seasonal-kitchen',
  expectedTemplateIds: ['cover', 'start', 'workspace', 'season_index', 'category', 'recipe', 'meal_plan', 'pantry', 'shopping'],
  pageCount: [78, 105],
  palette: ['#687b55', '#bc6549', '#f3ead9'],
  requiredStableNodeIds: ['root', 'start_here', 'example_workspace', 'blank_workspace'],
};

it('generates recipe and planning banks', () => expectValidGallerySample(contract.slug, contract));
it('supports one category, recipe, and planning week', () => {
  const sample = loadGallerySample(contract.slug, { categoryCount: 1, recipesPerCategory: 1, mealPlanWeeks: 1 });
  expect(validateGallerySample(sample, { ...contract, pageCount: [14, 30] })).toEqual([]);
});
```

- [ ] **Step 2: Run test and confirm failure**

Run: `npm test -- --run tests/unit/gallerySamples/seasonalKitchen.test.ts`

Expected: FAIL because product scripts do not exist.

- [ ] **Step 3: Implement product scripts and README**

Use `DEFAULT_CONFIG = { categoryCount: 6, recipesPerCategory: 8, mealPlanWeeks: 12 }`. Guided autumn week contains three complete fictional recipes and a linked combined shopping list. Recipe pages provide yield, prep, cook, difficulty, ingredients, method, notes, and repeat rating. Blank shopping pages group produce, pantry, chilled, bakery, and household. Use culinary-editorial typography, plate/leaf SVG shapes, olive navigation, tomato accents, and oat writing surfaces. Grid cards and meal tables receive explicit intentional borders. README ranges: categories 1–8, recipes 1–16, weeks 1–52.

- [ ] **Step 4: Run focused tests**

Run: `npm test -- --run tests/unit/gallerySamples/seasonalKitchen.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit if explicitly authorized**

```bash
git add gallery-samples/05-seasonal-kitchen tests/unit/gallerySamples/seasonalKitchen.test.ts
git commit -m "feat: add kitchen gallery flagship"
```

---

### Task 8: Travel Field Journal

**Files:**
- Create: `gallery-samples/06-travel-field-journal/templates.js`
- Create: `gallery-samples/06-travel-field-journal/hierarchy.js`
- Create: `gallery-samples/06-travel-field-journal/README.md`
- Create: `tests/unit/gallerySamples/travelFieldJournal.test.ts`

**Interfaces:**
- Consumes: Task 2 harness.
- Produces: Field Notes from Elsewhere journey planning and memory workflow.

- [ ] **Step 1: Write failing contract test**

```ts
const contract: GallerySampleContract = {
  slug: '06-travel-field-journal',
  expectedTemplateIds: ['cover', 'start', 'workspace', 'trip', 'reservations', 'reservation', 'itinerary', 'day', 'packing', 'expenses', 'highlights'],
  pageCount: [45, 70],
  palette: ['#356f66', '#b46148', '#eadbc2'],
  requiredStableNodeIds: ['root', 'start_here', 'example_workspace', 'blank_workspace'],
};

it('generates linked planning and field-note sections', () => expectValidGallerySample(contract.slug, contract));
it('supports one one-day trip without reservations', () => {
  const sample = loadGallerySample(contract.slug, { tripCount: 1, daysPerTrip: 1, reservationsPerTrip: 0 });
  expect(validateGallerySample(sample, { ...contract, pageCount: [15, 30] })).toEqual([]);
});
```

- [ ] **Step 2: Run test and confirm failure**

Run: `npm test -- --run tests/unit/gallerySamples/travelFieldJournal.test.ts`

Expected: FAIL because product scripts do not exist.

- [ ] **Step 3: Implement product scripts and README**

Use `DEFAULT_CONFIG = { tripCount: 3, daysPerTrip: 5, reservationsPerTrip: 2 }`. Guided Lisbon trip contains three realistic days plus lodging and transit records; no real booking numbers or personal data. Trip dashboard links with stable IDs to reservations, itinerary, packing, expenses, and highlights. Day pages use timeline composition and quiet field-note space. Use original route/compass/topographic SVG motifs distinct from archived artwork. Expense grids and itinerary cards define explicit border properties. README ranges: trips 1–6, days 1–21, reservations 0–8.

- [ ] **Step 4: Run focused tests**

Run: `npm test -- --run tests/unit/gallerySamples/travelFieldJournal.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit if explicitly authorized**

```bash
git add gallery-samples/06-travel-field-journal tests/unit/gallerySamples/travelFieldJournal.test.ts
git commit -m "feat: add travel gallery flagship"
```

---

### Task 9: Novel Story Studio

**Files:**
- Create: `gallery-samples/07-novel-story-studio/templates.js`
- Create: `gallery-samples/07-novel-story-studio/hierarchy.js`
- Create: `gallery-samples/07-novel-story-studio/README.md`
- Create: `tests/unit/gallerySamples/novelStoryStudio.test.ts`

**Interfaces:**
- Consumes: Task 2 harness.
- Produces: Story Atelier premise, structure, story-bible, scene, continuity, and revision system.

- [ ] **Step 1: Write failing contract test**

```ts
const contract: GallerySampleContract = {
  slug: '07-novel-story-studio',
  expectedTemplateIds: ['cover', 'start', 'workspace', 'premise', 'structure', 'bank', 'character', 'location', 'chapter_map', 'chapter', 'scene', 'continuity', 'revision'],
  pageCount: [120, 155],
  palette: ['#4a405c', '#b18b54', '#eee4d4'],
  requiredStableNodeIds: ['root', 'start_here', 'example_workspace', 'blank_workspace'],
};

it('generates linked story-bible and manuscript planning pages', () => expectValidGallerySample(contract.slug, contract));
it('supports a one-act miniature story', () => {
  const sample = loadGallerySample(contract.slug, { actCount: 1, chaptersPerAct: 1, scenesPerChapter: 1, characterCount: 1, locationCount: 1 });
  expect(validateGallerySample(sample, { ...contract, pageCount: [18, 35] })).toEqual([]);
});
```

- [ ] **Step 2: Run test and confirm failure**

Run: `npm test -- --run tests/unit/gallerySamples/novelStoryStudio.test.ts`

Expected: FAIL because product scripts do not exist.

- [ ] **Step 3: Implement product scripts and README**

Use `DEFAULT_CONFIG = { actCount: 3, chaptersPerAct: 8, scenesPerChapter: 3, characterCount: 12, locationCount: 8 }`. Guided mystery links one chapter to three scenes and referenced detective, witness, and railway-platform records. Blank hierarchy supplies three-act structure, chapter map, scene cards, character/location banks, continuity checks, and four revision passes. Use editorial manuscript styling, aubergine structure rails, gold metadata, and original thread/page SVG motifs. Scene pages prioritize goal/conflict/outcome, POV, setting, time, and continuity. README ranges: acts 1–5, chapters 1–12 per act, scenes 1–6 per chapter, characters 1–30, locations 1–20.

- [ ] **Step 4: Run focused tests**

Run: `npm test -- --run tests/unit/gallerySamples/novelStoryStudio.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit if explicitly authorized**

```bash
git add gallery-samples/07-novel-story-studio tests/unit/gallerySamples/novelStoryStudio.test.ts
git commit -m "feat: add novel gallery flagship"
```

---

### Task 10: TTRPG Campaign Codex

**Files:**
- Create: `gallery-samples/08-ttrpg-campaign-codex/templates.js`
- Create: `gallery-samples/08-ttrpg-campaign-codex/hierarchy.js`
- Create: `gallery-samples/08-ttrpg-campaign-codex/README.md`
- Create: `tests/unit/gallerySamples/ttrpgCampaignCodex.test.ts`

**Interfaces:**
- Consumes: Task 2 harness.
- Produces: Campaign Codex session, party, quest, NPC, location, faction, encounter, and lore system.

- [ ] **Step 1: Write failing contract test**

```ts
const contract: GallerySampleContract = {
  slug: '08-ttrpg-campaign-codex',
  expectedTemplateIds: ['cover', 'start', 'workspace', 'campaign', 'bank', 'party', 'character', 'session', 'quest', 'npc', 'location', 'faction', 'encounter', 'lore'],
  pageCount: [90, 125],
  palette: ['#783f38', '#667153', '#e8dcc7'],
  requiredStableNodeIds: ['root', 'start_here', 'example_workspace', 'blank_workspace'],
};

it('generates a cross-referenced campaign codex', () => expectValidGallerySample(contract.slug, contract));
it('supports minimum campaign banks', () => {
  const sample = loadGallerySample(contract.slug, { partySize: 1, sessionCount: 1, questCount: 1, npcCount: 1, locationCount: 1, factionCount: 1, encounterCount: 1, loreCount: 1 });
  expect(validateGallerySample(sample, { ...contract, pageCount: [22, 42] })).toEqual([]);
});
```

- [ ] **Step 2: Run test and confirm failure**

Run: `npm test -- --run tests/unit/gallerySamples/ttrpgCampaignCodex.test.ts`

Expected: FAIL because product scripts do not exist.

- [ ] **Step 3: Implement product scripts and README**

Use `DEFAULT_CONFIG = { partySize: 5, sessionCount: 16, questCount: 12, npcCount: 20, locationCount: 12, factionCount: 8, encounterCount: 12, loreCount: 8 }`. Guided adventure links one session to a quest, NPC, location, faction consequence, and encounter through reference nodes. Blank banks remain generous but configurable. Use restrained codex typography, oxblood status/faction marks, moss navigation, vellum surfaces, and original heraldic/die/route SVG geometry. Quest and faction pages expose status/reputation clearly; encounter pages prioritize objectives, environment, adversaries, and aftermath. README documents ranges for every count.

- [ ] **Step 4: Run focused tests**

Run: `npm test -- --run tests/unit/gallerySamples/ttrpgCampaignCodex.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit if explicitly authorized**

```bash
git add gallery-samples/08-ttrpg-campaign-codex tests/unit/gallerySamples/ttrpgCampaignCodex.test.ts
git commit -m "feat: add campaign gallery flagship"
```

---

### Task 11: Collection Contract and Full Verification

**Files:**
- Create: `tests/unit/gallerySamples/collection.test.ts`
- Modify only if verification exposes defects: product files from Tasks 3–10

**Interfaces:**
- Consumes: all eight product directories and Task 2 harness.
- Produces: collection-wide proof that all products satisfy shared contracts and remain visually/export correct.

- [ ] **Step 1: Write collection test**

```ts
const EXPECTED_SLUGS = [
  '01-academic-success-system',
  '02-work-project-hub',
  '03-personal-finance-planner',
  '04-wellness-fitness-journal',
  '05-seasonal-kitchen',
  '06-travel-field-journal',
  '07-novel-story-studio',
  '08-ttrpg-campaign-codex',
];

it('contains exactly the eight approved products', () => {
  expect(collectGallerySampleSlugs()).toEqual(EXPECTED_SLUGS);
});

it.each(EXPECTED_SLUGS)('%s has no structural contract errors', slug => {
  const sample = loadGallerySample(slug);
  expect(validateSharedGalleryInvariants(sample)).toEqual([]);
});
```

`collectGallerySampleSlugs` must ignore root `README.md` and return only directories containing all three required files. It must never traverse `archives/`.

- [ ] **Step 2: Run collection tests**

Run: `npm test -- --run tests/unit/gallerySamples tests/unit/gallerySampleHarness.test.ts`

Expected: all gallery sample suites PASS.

- [ ] **Step 3: Run full unit suite**

Run: `npm test -- --run`

Expected: all tests PASS.

- [ ] **Step 4: Run production build**

Run: `npm run build`

Expected: Vite build exits 0.

- [ ] **Step 5: Perform real-browser generator verification**

Start app with `npm run dev`. For each product, paste `templates.js` and `hierarchy.js` into Hierarchy Generator and generate it. Verify these exact pages:

| Product | Pages to inspect |
|---|---|
| Academic | cover, Start Here, example Cornell note/card, blank semester, course grid |
| Work | cover, example meeting/decision/board, blank portfolio, risk table |
| Finance | cover, example month/transactions, blank annual view, sinking funds |
| Wellness | cover, example week/workout, blank habit month, recovery page |
| Kitchen | cover, example recipe/meal plan/shopping, blank category index |
| Travel | cover, example trip/day/reservation, blank trip dashboard, expenses |
| Novel | cover, example chapter/scene/character, blank chapter map, continuity |
| TTRPG | cover, example session/quest/NPC, blank campaign dashboard, encounter |

On every example page, click **Skip to blank workspace** and confirm selection lands on `blank_workspace`. Exercise all visible Home/Up/Previous/Next controls and cross-references. Confirm dense grids have intentional single strokes, no doubled edges, no footer overlap, and no clipped final row.

- [ ] **Step 6: Perform PDF and grayscale verification**

For each product, export the inspected representative pages. Verify:

- SVG art remains vector and correctly colored.
- Grid borders match editor output.
- Internal links work in the PDF.
- Muted accents remain distinguishable in normal color.
- Grayscale output preserves hierarchy and legibility.

Store temporary exports outside `gallery-samples/` and `archives/`, then remove them after verification. Do not open archived assets.

- [ ] **Step 7: Re-run tests after visual fixes**

Run:

```bash
npm test -- --run && npm run build
```

Expected: all tests PASS and build exits 0.

- [ ] **Step 8: Inspect final diff and untracked files**

Run:

```bash
git status --short && git diff --stat && git diff -- docs/superpowers/specs/2026-07-12-gallery-samples-redesign-design.md docs/superpowers/plans/2026-07-12-gallery-sample-collection.md tests gallery-samples
```

Confirm `scratch/` is unchanged, archive was moved intact, no temporary exports remain, and only intended source/docs/tests are staged if staging was authorized.

- [ ] **Step 9: Commit if explicitly authorized**

```bash
git add gallery-samples tests/unit/gallerySamples docs/superpowers/specs/2026-07-12-gallery-samples-redesign-design.md docs/superpowers/plans/2026-07-12-gallery-sample-collection.md
git commit -m "test: verify gallery flagship collection"
```
