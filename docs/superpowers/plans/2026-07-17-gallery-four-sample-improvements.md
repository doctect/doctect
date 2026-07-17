# Gallery Four-Sample Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the approved improvements to four gallery flagship generators (finance, wellness, travel, ttrpg) per `docs/superpowers/specs/2026-07-17-gallery-four-sample-improvements-design.md`.

**Architecture:** Each product is a pair of self-contained generator scripts (`templates.js` + `hierarchy.js`) executed by the Hierarchy Generator's two-scope sandbox and validated by `tests/helpers/gallerySampleHarness.ts`. Changes are: one additive harness extension (Task 1), then per-product script + test + README changes, then whole-collection verification. Navigation uses data-bound label elements (`nav_prev_label` / `nav_next_label` / `continue_label`) over `sibling` / `child_index` links; sequence ends get `''` labels.

**Tech Stack:** Plain JS generator scripts (no imports allowed), Vitest, jsPDF/pdfService for page-order and annotation checks, Playwright-based scratch tooling for real-modal verification.

## Global Constraints

- **Worktree isolation:** create via superpowers:using-git-worktrees before Task 1. Branch name: `feature/gallery-sample-improvements`.
- **Files allowed:** `gallery-samples/{03-personal-finance-planner,04-wellness-fitness-journal,06-travel-field-journal,08-ttrpg-campaign-codex}/**`, `tests/unit/gallerySamples/**`, `tests/helpers/gallerySampleHarness.ts`, `docs/superpowers/plans/2026-07-17-gallery-four-sample-improvements.md`. **Nothing else** (another agent works in this repo in parallel; `server/`, `components/`, `services/`, moderation docs are off-limits).
- Generator scripts stay self-contained: no `import`/`require`; Templates scope has only `RM_PP_WIDTH`(509)/`RM_PP_HEIGHT`(679)/`A4_WIDTH`/`A4_HEIGHT`; Hierarchy scope has only `templates`, `createId`, optional `SAMPLE_CONFIG`. Scripts end with their existing `return` statements.
- Page size 509×679 everywhere; all elements and expanded grids must stay in bounds (harness enforces; keep 16px clearance above footer rules where the existing tests assert it).
- Grid border standard: grid elements have `stroke: ''`, `strokeWidth: 0`, explicit `gridBorderMode/Color/Width/Style`; hand-built tables use fill-only cells, exactly one outer boundary rect, one 0.8-wide rect per internal edge.
- Deterministic ids: element ids come from each file's `elementId()` sequence; node ids are literal strings. Never call `createId` for nodes that anything links to.
- Every node of a template that binds `nav_prev_label`/`nav_next_label`/`continue_label` must define those keys (`''` allowed). Labels are honest: non-empty only when the link resolves; `''` at dead ends.
- Template `name` values must not equal any node title (scratch render tooling getByText collision).
- Palettes are fixed per product (tests assert): finance `#29483d/#b68a4c/#f4eddf`, wellness `#a96551/#7f9473/#f1e7df`, travel `#356f66/#b46148/#eadbc2`, codex `#783f38/#667153/#e8dcc7`.
- Commit after every task with the trailer:

```
Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_011dLQ24CZXuxKUhRtUoz2Tc
```

- Run tests with `npx vitest run <file>` from the worktree root.

---

### Task 1: Harness link-validation escapes (cousin fallback + empty-bound-label)

The harness currently errors on any `sibling` link that has no direct sibling and any `child_index` link with no child at that index — for **every** node of the template. The PDF engine (`services/pdfService.ts` ~line 948) instead falls back to a "cousin" (next/previous uncle's first/last child **of the same template type**) for siblings, and silently emits no annotation when nothing resolves. This task teaches the harness both behaviors so bound-label nav chrome can exist on templates whose sequences have ends.

**Files:**
- Modify: `tests/helpers/gallerySampleHarness.ts` (functions `siblingDestination` area, `validateElementLink`)
- Test: `tests/unit/gallerySamples/harnessLinkEscapes.test.ts` (create)

**Interfaces:**
- Consumes: `executeGallerySample(templateSource, hierarchySource, config)` from the harness (already exported).
- Produces: `validateSharedGalleryInvariants` accepts (a) sibling links that resolve via engine-style cousin fallback, (b) sibling/child_index links that do NOT resolve **iff** the element has a `dataBinding` whose value on that node is `''`. All other behavior unchanged. Later tasks rely on exactly these two escapes.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/gallerySamples/harnessLinkEscapes.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { executeGallerySample, validateSharedGalleryInvariants } from '../../helpers/gallerySampleHarness';

const templatesSource = (element: string) => `
const templates = {
  hub: { id: 'hub', name: 'Hub', width: 509, height: 679, elements: [] },
  leaf: { id: 'leaf', name: 'Leaf', width: 509, height: 679, elements: [
    ${element}
  ] },
};
return templates;`;

// root(hub) -> [groupA(hub) -> leaf1, leaf2] , [groupB(hub) -> leaf3]
const hierarchySource = (leafData: string) => `
const nodes = {};
const add = (id, parentId, type, data = {}) => {
  nodes[id] = { id, parentId, type, title: id, data, children: [] };
  if (parentId) nodes[parentId].children.push(id);
};
add('root', null, 'hub');
add('groupA', 'root', 'hub');
add('groupB', 'root', 'hub');
${leafData}
return { nodes, rootId: 'root' };`;

const NEXT_CHIP = `{ id: 'leaf_next', type: 'text', x: 400, y: 10, w: 80, h: 20, rotation: 0, fill: '', stroke: '', strokeWidth: 0, opacity: 1, text: '{{nav_next_label}}', dataBinding: 'nav_next_label', fontSize: 10, fontFamily: 'helvetica', linkTarget: 'sibling', linkValue: '1' }`;
const CONTINUE_CHIP = `{ id: 'leaf_go', type: 'text', x: 400, y: 40, w: 80, h: 20, rotation: 0, fill: '', stroke: '', strokeWidth: 0, opacity: 1, text: '{{continue_label}}', dataBinding: 'continue_label', fontSize: 10, fontFamily: 'helvetica', linkTarget: 'child_index', linkValue: '0' }`;
const STATIC_NEXT = `{ id: 'leaf_static', type: 'text', x: 400, y: 10, w: 80, h: 20, rotation: 0, fill: '', stroke: '', strokeWidth: 0, opacity: 1, text: 'NEXT', fontSize: 10, fontFamily: 'helvetica', linkTarget: 'sibling', linkValue: '1' }`;

describe('gallery harness link escapes', () => {
  it('accepts a sibling link that resolves through engine cousin fallback', () => {
    // leaf2 is groupA's last child; groupB's first 'leaf' child is the cousin target.
    const sample = executeGallerySample(templatesSource(STATIC_NEXT), hierarchySource(`
add('leaf1', 'groupA', 'leaf', { nav_next_label: 'L2' });
add('leaf2', 'groupA', 'leaf', { nav_next_label: 'L3' });
add('leaf3', 'groupB', 'leaf', { nav_next_label: 'X' });`));
    const errors = validateSharedGalleryInvariants(sample)
      .filter(error => error.includes('leaf3'));
    // leaf3 has no next sibling AND no cousin AND no empty bound label -> must still error
    expect(errors).toHaveLength(1);
    const cleanErrors = validateSharedGalleryInvariants(sample)
      .filter(error => error.includes("'leaf2'"));
    // leaf2 resolves via cousin fallback -> no error
    expect(cleanErrors).toEqual([]);
  });

  it('accepts an unresolved sibling link when the bound label is empty', () => {
    const sample = executeGallerySample(templatesSource(NEXT_CHIP), hierarchySource(`
add('leaf1', 'groupA', 'leaf', { nav_next_label: 'L2 »' });
add('leaf2', 'groupA', 'leaf', { nav_next_label: '' });`));
    expect(validateSharedGalleryInvariants(sample)).toEqual([]);
  });

  it('still rejects an unresolved sibling link when the bound label is non-empty', () => {
    const sample = executeGallerySample(templatesSource(NEXT_CHIP), hierarchySource(`
add('leaf1', 'groupA', 'leaf', { nav_next_label: 'L2 »' });
add('leaf2', 'groupA', 'leaf', { nav_next_label: 'DEAD »' });`));
    const errors = validateSharedGalleryInvariants(sample);
    expect(errors.some(error => error.includes("sibling offset 1 does not resolve for node 'leaf2'"))).toBe(true);
  });

  it('accepts an unresolved child_index link when the bound label is empty', () => {
    const sample = executeGallerySample(templatesSource(CONTINUE_CHIP), hierarchySource(`
add('leaf1', 'groupA', 'leaf', { continue_label: '' });
add('leaf2', 'groupA', 'leaf', { continue_label: '' });`));
    expect(validateSharedGalleryInvariants(sample)).toEqual([]);
  });

  it('still rejects an unresolved child_index link when the label is non-empty', () => {
    const sample = executeGallerySample(templatesSource(CONTINUE_CHIP), hierarchySource(`
add('leaf1', 'groupA', 'leaf', { continue_label: 'GO »' });`));
    const errors = validateSharedGalleryInvariants(sample);
    expect(errors.some(error => error.includes("child index 0 does not resolve for node 'leaf1'"))).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify failures**

Run: `npx vitest run tests/unit/gallerySamples/harnessLinkEscapes.test.ts`
Expected: FAIL — cousin case reports an error for `leaf2`, empty-label cases report unresolved-link errors (current harness has no escapes).

- [ ] **Step 3: Implement harness changes**

In `tests/helpers/gallerySampleHarness.ts`, directly below the existing `siblingDestination` function, add:

```typescript
// Mirrors the PDF engine's cousin fallback (services/pdfService.ts, sibling links):
// at a sequence end, walk uncles in the offset direction and take the first uncle's
// first (forward) or last (backward) child of the SAME template type.
const cousinDestination = (node: any, offset: number, nodes: Record<string, any>) => {
    if (typeof node.parentId !== 'string') return undefined;
    const parent = nodes[node.parentId];
    if (!isRecord(parent) || typeof parent.parentId !== 'string') return undefined;
    const grandparent = nodes[parent.parentId];
    if (!isRecord(grandparent) || !Array.isArray(grandparent.children)) return undefined;
    const parentIndex = grandparent.children.indexOf(parent.id);
    if (parentIndex < 0) return undefined;
    const direction = offset > 0 ? 1 : -1;
    let uncleIndex = parentIndex + direction;
    while (uncleIndex >= 0 && uncleIndex < grandparent.children.length) {
        const uncle = nodes[grandparent.children[uncleIndex]];
        if (isRecord(uncle) && Array.isArray(uncle.children) && uncle.children.length > 0) {
            const candidates = uncle.children
                .map((childId: string) => nodes[childId])
                .filter((candidate: any) => isRecord(candidate) && candidate.type === node.type);
            if (candidates.length > 0) return direction > 0 ? candidates[0] : candidates[candidates.length - 1];
        }
        uncleIndex += direction;
    }
    return undefined;
};

// Design contract for bound nav chrome: an element whose visible label is data-bound
// and empty on this node renders nothing and emits no annotation, so an unresolved
// link is not a defect there.
const hasEmptyBoundLabel = (element: any, node: any) =>
    typeof element?.dataBinding === 'string'
    && element.dataBinding.length > 0
    && node?.data?.[element.dataBinding] === '';
```

Then in `validateElementLink`, replace the `child_index` branch:

```typescript
    if (target === 'child_index') {
        const index = parseInteger(element.linkValue);
        if (index === undefined || index < 0
            || (!nodes[node.children?.[index]] && !hasEmptyBoundLabel(element, node))) {
            errors.push(`${context} child index ${element.linkValue ?? ''} does not resolve for node '${node.id}'`);
        }
        return;
    }
```

and replace the `sibling` branch:

```typescript
    if (target === 'sibling') {
        const offset = parseInteger(element.linkValue ?? '1');
        if (offset === undefined || offset === 0
            || (!siblingDestination(node, offset, nodes)
                && !cousinDestination(node, offset, nodes)
                && !hasEmptyBoundLabel(element, node))) {
            errors.push(`${context} sibling offset ${element.linkValue ?? '1'} does not resolve for node '${node.id}'`);
        }
        return;
    }
```

- [ ] **Step 4: Run new test + full gallery suite**

Run: `npx vitest run tests/unit/gallerySamples/harnessLinkEscapes.test.ts`
Expected: PASS (5 tests).
Run: `npx vitest run tests/unit/gallerySamples/`
Expected: PASS — escapes are additive; all 8 products still validate.

- [ ] **Step 5: Commit**

```bash
git add tests/helpers/gallerySampleHarness.ts tests/unit/gallerySamples/harnessLinkEscapes.test.ts
git commit -m "test(samples): teach harness engine link fallbacks"
```

---

### Task 2: Money Map — flatten month branch + sequence navigation

**Files:**
- Modify: `gallery-samples/03-personal-finance-planner/templates.js`
- Modify: `gallery-samples/03-personal-finance-planner/hierarchy.js`
- Test: `tests/unit/gallerySamples/personalFinance.test.ts`

**Interfaces:**
- Consumes: Task 1 harness escapes.
- Produces: `month` children are `[tx01..txN, category_review]` (flat). Data keys `nav_prev_label`, `nav_next_label` on every node of types `month`, `sinking_funds`, `goal`, `year_review` (and later `bills`); `continue_label` on every `transactions` node. Element helper `navChips(templateId, { prev, next })` in templates.js. Task 3 adds the `bills` template between month 12 and sinking funds and MUST set both nav labels on it.

- [ ] **Step 1: Update the workflow test to the flat shape (failing first)**

In `tests/unit/gallerySamples/personalFinance.test.ts`, replace the whole `it('resolves month-to-transaction-to-review workflow and annual sections', …)` block with:

```typescript
    it('resolves flat month workflow, annual sections, and sequence navigation', () => {
        const sample = loadGallerySample(contract.slug);
        const openLog = findRole(sample, 'month', 'open_log');
        const continueLink = findRole(sample, 'transactions', 'continue');
        const reviewPrev = findRole(sample, 'category_review', 'nav_prev');
        const monthPrev = findRole(sample, 'month', 'nav_prev');
        const monthNext = findRole(sample, 'month', 'nav_next');
        const annualChildren = sample.nodes.blank_annual.children.map((id: string) => sample.nodes[id]);

        expect(openLog).toMatchObject({ linkTarget: 'child_index', linkValue: '0' });
        expect(continueLink).toMatchObject({
            linkTarget: 'sibling', linkValue: '1', dataBinding: 'continue_label',
        });
        expect(reviewPrev).toMatchObject({
            linkTarget: 'sibling', linkValue: '-1', dataBinding: 'nav_prev_label',
        });
        expect(monthPrev).toMatchObject({ linkTarget: 'sibling', linkValue: '-1', dataBinding: 'nav_prev_label' });
        expect(monthNext).toMatchObject({ linkTarget: 'sibling', linkValue: '1', dataBinding: 'nav_next_label' });
        expect(annualChildren.filter((node: any) => node.type === 'month')).toHaveLength(12);
        expect(annualChildren.filter((node: any) => node.type === 'sinking_funds')).toHaveLength(1);
        expect(annualChildren.filter((node: any) => node.type === 'goal')).toHaveLength(4);
        expect(annualChildren.filter((node: any) => node.type === 'year_review')).toHaveLength(1);

        annualChildren.filter((node: any) => node.type === 'month').forEach((month: any) => {
            const children = month.children.map((id: string) => sample.nodes[id]);
            expect(children.map((child: any) => child.type), month.id)
                .toEqual(['transactions', 'transactions', 'category_review']);
            expect(children[0].data.continue_label, month.id).toBe('LOG 02 »');
            expect(children[1].data.continue_label, month.id).toBe('REVIEW »');
            expect(children[2].data.nav_prev_label, month.id).toBe('« LOG 02');
        });

        const months = annualChildren.filter((node: any) => node.type === 'month');
        expect(months[0].data.nav_prev_label).toBe('');
        expect(months[0].data.nav_next_label).toBe('FEB »');
        expect(months[11].data.nav_prev_label).toBe('« NOV');
        expect(months[11].data.nav_next_label).toBe('BILLS »');
        expect(sample.nodes.blank_sinking_funds.data.nav_prev_label).toBe('« DEC');
        expect(sample.nodes.blank_sinking_funds.data.nav_next_label).toBe('GOAL 01 »');
        expect(sample.nodes.blank_goal_01.data.nav_prev_label).toBe('« FUNDS');
        expect(sample.nodes.blank_goal_04.data.nav_next_label).toBe('YEAR REVIEW »');
        expect(sample.nodes.blank_year_review.data.nav_prev_label).toBe('« GOAL 04');
        expect(sample.nodes.blank_year_review.data.nav_next_label).toBe('');
        expect(sample.nodes.example_january.data.nav_next_label).toBe('FUNDS »');
        expect(sample.nodes.example_transactions.data.continue_label).toBe('REVIEW »');
        expect(sample.nodes.example_category_review.data.nav_prev_label).toBe('« LOG 01');
    });
```

Note: `findRole` matches `_${role}_` in element ids — the chip elements below use roles `nav_prev` / `nav_next`, giving ids like `month_nav_prev_123`.

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/unit/gallerySamples/personalFinance.test.ts`
Expected: FAIL — no `nav_prev`/`nav_next` elements, chained (not flat) month children.

- [ ] **Step 3: Implement templates.js changes**

In `gallery-samples/03-personal-finance-planner/templates.js`:

(a) After the `titleBlock` definition, add the chip helper:

```javascript
const navChips = (templateId, { prev = true, next = true } = {}) => {
  const chips = [];
  if (prev) {
    chips.push(text(templateId, 'nav_prev', 31, 44, 90, 24, '{{nav_prev_label}}', {
      dataBinding: 'nav_prev_label',
      fontSize: 9,
      fontWeight: 'bold',
      textColor: COLORS.brass,
      linkTarget: 'sibling',
      linkValue: '-1',
    }));
  }
  if (next) {
    chips.push(text(templateId, 'nav_next', 391, 44, 90, 24, '{{nav_next_label}}', {
      dataBinding: 'nav_next_label',
      fontSize: 9,
      fontWeight: 'bold',
      textColor: COLORS.brass,
      align: 'right',
      linkTarget: 'sibling',
      linkValue: '1',
    }));
  }
  return chips;
};
```

(The section label spans x159–350 at y49; chips sit clear of it at x31–121 and x391–481.)

(b) Add `...navChips('month'),` as the first entries of `monthElements` (before `...pageBase('month', 'Monthly plan')` is fine — order inside the array doesn't matter for rendering except z-order; append at the END of the array to keep chip text above the paper rect):

At the end of `monthElements` array add:
```javascript
  ...navChips('month'),
```
Same for `sinkingElements`, `goalElements`, `yearReviewElements` — but year review gets no next chip and sinking/goal get both:
```javascript
  ...navChips('sinking_funds'),
```
```javascript
  ...navChips('goal'),
```
```javascript
  ...navChips('year_review', { next: false }),
```
Wait — year review's next label is `''` for all nodes, so the chip is invisible and its link dead-ends cleanly; both forms are safe. Use the uniform `...navChips('year_review')` and rely on the `''` label (simpler, and the harness escape from Task 1 covers it). Final: append `...navChips(id)` (both chips) to `monthElements`, `sinkingElements`, `goalElements`, `yearReviewElements`.

(c) In `categoryElements`, append a prev-only chip:
```javascript
  ...navChips('category_review', { next: false }),
```

(d) In `transactionElements`, replace the static continue button:

```javascript
  text('transactions', 'continue', 329, 574, 152, 34, 'NEXT LOG / REVIEW', {
    fontSize: 9,
    fontWeight: 'bold',
    textColor: COLORS.cream,
    fill: COLORS.forest,
    align: 'center',
    linkTarget: 'child_index',
    linkValue: '0',
  }),
```
with:
```javascript
  text('transactions', 'continue', 329, 574, 152, 34, '{{continue_label}}', {
    dataBinding: 'continue_label',
    fontSize: 9,
    fontWeight: 'bold',
    textColor: COLORS.cream,
    fill: COLORS.forest,
    align: 'center',
    linkTarget: 'sibling',
    linkValue: '1',
  }),
```

- [ ] **Step 4: Implement hierarchy.js changes**

In `gallery-samples/03-personal-finance-planner/hierarchy.js`:

(a) In the blank month loop, replace the chained construction:

```javascript
months.forEach((month, monthIndex) => {
  const monthNumber = String(monthIndex + 1).padStart(2, '0');
  const monthId = `blank_month_${monthNumber}`;
  addNode(monthId, 'blank_annual', 'month', month, blankMonthData(month));

  let parentId = monthId;
  for (let page = 1; page <= CONFIG.transactionPagesPerMonth; page += 1) {
    const pageNumber = String(page).padStart(2, '0');
    const transactionId = `${monthId}_transactions_${pageNumber}`;
    addNode(transactionId, parentId, 'transactions', `${month} Transactions ${pageNumber}`, blankTransactionData(month, page));
    parentId = transactionId;
  }
  addNode(`${monthId}_category_review`, parentId, 'category_review', `${month} Category Review`, blankCategoryData(month));
});
```

with the flat construction plus labels:

```javascript
const monthShorts = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

months.forEach((month, monthIndex) => {
  const monthNumber = String(monthIndex + 1).padStart(2, '0');
  const monthId = `blank_month_${monthNumber}`;
  addNode(monthId, 'blank_annual', 'month', month, {
    ...blankMonthData(month),
    nav_prev_label: monthIndex === 0 ? '' : `« ${monthShorts[monthIndex - 1]}`,
    nav_next_label: monthIndex === 11 ? 'BILLS »' : `${monthShorts[monthIndex + 1]} »`,
  });

  const pages = CONFIG.transactionPagesPerMonth;
  for (let page = 1; page <= pages; page += 1) {
    const pageNumber = String(page).padStart(2, '0');
    addNode(`${monthId}_transactions_${pageNumber}`, monthId, 'transactions', `${month} Transactions ${pageNumber}`, {
      ...blankTransactionData(month, page),
      continue_label: page < pages ? `LOG ${String(page + 1).padStart(2, '0')} »` : 'REVIEW »',
    });
  }
  addNode(`${monthId}_category_review`, monthId, 'category_review', `${month} Category Review`, {
    ...blankCategoryData(month),
    nav_prev_label: `« LOG ${String(pages).padStart(2, '0')}`,
  });
});
```

**Transitional note:** until Task 3 lands the bills page, December's `BILLS »` chip points at a sibling that doesn't exist yet — its direct sibling at +1 is `blank_sinking_funds`, so the link still resolves (to funds) and the harness passes. Task 3 makes the label truthful. Do NOT try to make Task 2's label `FUNDS »`; the Step-1 test already asserts the final `BILLS »` copy so both tasks stay consistent.

(b) Update the remaining blank sequence nodes:

```javascript
addNode('blank_sinking_funds', 'blank_annual', 'sinking_funds', 'My Sinking Funds', {
  ...blankSinkingData(),
  nav_prev_label: '« DEC',
  nav_next_label: 'GOAL 01 »',
});

for (let goal = 1; goal <= CONFIG.goalCount; goal += 1) {
  const goalNumber = String(goal).padStart(2, '0');
  addNode(`blank_goal_${goalNumber}`, 'blank_annual', 'goal', `Goal ${goalNumber}`, {
    ...blankGoalData(),
    nav_prev_label: goal === 1 ? '« FUNDS' : `« GOAL ${String(goal - 1).padStart(2, '0')}`,
    nav_next_label: goal === CONFIG.goalCount ? 'YEAR REVIEW »' : `GOAL ${String(goal + 1).padStart(2, '0')} »`,
  });
}
```
and add the two label keys to the year-review node's data object:
```javascript
  nav_prev_label: `« GOAL ${String(CONFIG.goalCount).padStart(2, '0')}`,
  nav_next_label: '',
```

(c) Flatten the example branch the same way. Change `example_transactions`'s parent from `'example_january'` stays — it already is a child of `example_january`; change `example_category_review`'s parent from `'example_transactions'` to `'example_january'`. Add to `example_january` data: `nav_prev_label: ''`, `nav_next_label: 'FUNDS »'` (Task 3 flips it to `'BILLS »'` when it inserts `example_bills`). Add to `example_transactions` data: `continue_label: 'REVIEW »'`. Add to `example_category_review` data: `nav_prev_label: '« LOG 01'`. Add to `example_sinking_funds`: `nav_prev_label: '« JAN'`, `nav_next_label: 'GOAL 01 »'`. Add to `example_goal`: `nav_prev_label: '« FUNDS'`, `nav_next_label: 'YEAR REVIEW »'`. Add to `example_year_review`: `nav_prev_label: '« GOAL 01'`, `nav_next_label: ''`.

**Correction for consistency with Step 1's test:** the test asserts `example_january.data.nav_next_label === 'FUNDS »'` — Task 3 will update BOTH the hierarchy label and this test assertion to `'BILLS »'` when the example bills page lands between them. Keep `'FUNDS »'` in this task.

(d) Update the writable-bindings test in `personalFinance.test.ts`: add to `nonWritableBindings`:

```typescript
            'nav_prev_label', 'nav_next_label', 'continue_label',
```

- [ ] **Step 5: Run tests**

Run: `npx vitest run tests/unit/gallerySamples/personalFinance.test.ts tests/unit/gallerySamples/collection.test.ts`
Expected: PASS (page counts unchanged at 66/51/94 in this task).

- [ ] **Step 6: Commit**

```bash
git add gallery-samples/03-personal-finance-planner tests/unit/gallerySamples/personalFinance.test.ts
git commit -m "feat(samples): flatten Money Map months and add sequence nav"
```

---

### Task 3: Money Map — bills register page + goal progress track

**Files:**
- Modify: `gallery-samples/03-personal-finance-planner/templates.js`
- Modify: `gallery-samples/03-personal-finance-planner/hierarchy.js`
- Modify: `gallery-samples/03-personal-finance-planner/README.md`
- Test: `tests/unit/gallerySamples/personalFinance.test.ts`

**Interfaces:**
- Consumes: Task 2's `navChips`, flat structure, label conventions.
- Produces: template id `bills` (name `Bills Register`), node ids `blank_bills` (after month 12, before sinking funds) and `example_bills` (after `example_january`). Data keys per bills node: `bill_1..8`, `due_1..8`, `amount_1..8`, `audit_note`, `subtitle`, `nav_prev_label`, `nav_next_label`.

- [ ] **Step 1: Write failing tests**

In `personalFinance.test.ts`:

(a) contract: add `'bills'` to `expectedTemplateIds`; change `pageCount` to `[58, 80]`.

(b) In the first test, change `expect(exportedPageCount(sample)).toBe(66);` to `.toBe(68);`.

(c) Min config test: `pageCount: [45, 65]` stays; change `.toBe(51)` to `.toBe(53)`. Max config test: change contract override to `pageCount: [90, 100]` stays; `.toBe(94)` to `.toBe(96)`.

(d) In the table-edge test, add `'bills'` to the `tableTemplates` array.

(e) In the writable-fields test, add to `writableFieldsByType`:

```typescript
            bills: [...ranges(['bill', 'due', 'amount'], 8), 'audit_note'],
```

(f) Update the two label assertions from Task 2's transitional copy: in the workflow test change nothing (it already expects `BILLS »` on December); change `expect(sample.nodes.example_january.data.nav_next_label).toBe('FUNDS »');` to `.toBe('BILLS »');`.

(g) Add a new test at the end of the describe block:

```typescript
    it('adds a recurring-bills register with paid-month ticks and a goal progress track', () => {
        const sample = loadGallerySample(contract.slug);
        const bills = sample.nodes.blank_bills;
        const annualChildren = sample.nodes.blank_annual.children;

        expect(bills).toMatchObject({ type: 'bills', parentId: 'blank_annual' });
        expect(annualChildren.indexOf('blank_bills')).toBe(12);
        expect(annualChildren.indexOf('blank_sinking_funds')).toBe(13);
        expect(bills.data).toMatchObject({
            nav_prev_label: '« DEC', nav_next_label: 'FUNDS »', bill_1: '', audit_note: '',
        });
        expect(sample.nodes.example_bills).toMatchObject({ parentId: 'example_annual', type: 'bills' });
        expect(sample.nodes.example_bills.data.bill_1).toBe('Internet (fictional)');
        expect(sample.nodes.example_annual.children.indexOf('example_bills')).toBe(1);

        const ticks = sample.templates.bills.elements.filter((element: any) =>
            element.type === 'rect' && element.id.includes('_tick_'),
        );
        expect(ticks).toHaveLength(96);
        ticks.forEach((tick: any) => {
            expect(tick.w, tick.id).toBe(12);
            expect(tick.h, tick.id).toBe(12);
            expect(tick).toMatchObject({ fill: '#fbf8ef', stroke: '#89978f', strokeWidth: 0.8 });
        });

        const monthInitials = sample.templates.bills.elements.filter((element: any) =>
            element.type === 'text' && element.id.includes('_tick_head_'),
        );
        expect(monthInitials.map((initial: any) => initial.text).join('')).toBe('JFMAMJJASOND');

        const segments = sample.templates.goal.elements.filter((element: any) =>
            element.type === 'rect' && element.id.includes('_progress_seg_'),
        );
        expect(segments).toHaveLength(10);
        segments.forEach((segment: any) => {
            expect(segment).toMatchObject({ fill: '#fbf8ef', stroke: '#29483d', strokeWidth: 0.8, h: 14 });
        });
    });
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/unit/gallerySamples/personalFinance.test.ts`
Expected: FAIL — no `bills` template.

- [ ] **Step 3: Implement templates.js**

(a) After `goalRows`/before `goalElements`... actually append after the `yearReviewElements` block a new template's elements:

```javascript
const billsTickHeader = () => {
  const cells = [];
  'JFMAMJJASOND'.split('').forEach((initial, index) => {
    cells.push(text('bills', 'tick_head', 296 + index * 15, 186, 12, 14, initial, {
      fontSize: 6,
      fontWeight: 'bold',
      textColor: COLORS.cream,
      align: 'center',
    }));
  });
  return cells;
};

const billsElements = [
  ...pageBase('bills', 'Bills & subscriptions'),
  ...titleBlock('bills'),
  text('bills', 'instruction', 31, 156, 450, 21, 'List what leaves the account on a schedule. Shade a square when that month is paid.', {
    fontSize: 10,
    fontStyle: 'italic',
    textColor: COLORS.muted,
  }),
  // header band
  rect('bills', 'table_cell_header_1', 31, 183, 150, 20, COLORS.forest),
  rect('bills', 'table_cell_header_2', 181, 183, 42, 20, COLORS.forest),
  rect('bills', 'table_cell_header_3', 223, 183, 68, 20, COLORS.forest),
  rect('bills', 'table_cell_header_4', 291, 183, 190, 20, COLORS.forest),
  text('bills', 'table_header_1', 36, 183, 140, 20, 'BILL', { fontSize: 9, fontWeight: 'bold', textColor: COLORS.cream }),
  text('bills', 'table_header_2', 185, 183, 36, 20, 'DUE', { fontSize: 9, fontWeight: 'bold', textColor: COLORS.cream }),
  text('bills', 'table_header_3', 227, 183, 60, 20, 'AMOUNT', { fontSize: 9, fontWeight: 'bold', textColor: COLORS.cream }),
  ...billsTickHeader(),
  // 8 rows
  ...Array.from({ length: 8 }, (_, index) => {
    const row = index + 1;
    const rowY = 203 + index * 40;
    const cells = [
      rect('bills', `table_cell_${row}_1`, 31, rowY, 150, 40, COLORS.paper),
      rect('bills', `table_cell_${row}_2`, 181, rowY, 42, 40, COLORS.paper),
      rect('bills', `table_cell_${row}_3`, 223, rowY, 68, 40, COLORS.paper),
      rect('bills', `table_cell_${row}_4`, 291, rowY, 190, 40, COLORS.paper),
      text('bills', `table_value_${row}_1`, 36, rowY, 140, 40, `{{bill_${row}}}`, { dataBinding: `bill_${row}`, fontSize: 9 }),
      text('bills', `table_value_${row}_2`, 185, rowY, 36, 40, `{{due_${row}}}`, { dataBinding: `due_${row}`, fontSize: 9, align: 'center' }),
      text('bills', `table_value_${row}_3`, 227, rowY, 60, 40, `{{amount_${row}}}`, { dataBinding: `amount_${row}`, fontSize: 9, align: 'right' }),
    ];
    for (let month = 0; month < 12; month += 1) {
      cells.push(rect('bills', `tick_${row}_${month + 1}`, 296 + month * 15, rowY + 14, 12, 12, COLORS.paper, {
        stroke: COLORS.rule,
        strokeWidth: 0.8,
      }));
    }
    return cells;
  }).flat(),
  // single-drawn internal edges + boundary (same convention as staticTable)
  ...[181, 223, 291].map((lineX, index) =>
    rect('bills', `table_line_vertical_${index + 1}`, lineX - 0.4, 183, 0.8, 340, COLORS.rule)),
  ...Array.from({ length: 8 }, (_, index) => {
    const isHeaderRule = index === 0;
    const thickness = isHeaderRule ? 1 : 0.8;
    return rect('bills', `table_line_horizontal_${index + 1}`, 31, 203 + index * 40 - thickness / 2, 450, thickness, isHeaderRule ? COLORS.brass : COLORS.rule);
  }),
  rect('bills', 'table_boundary', 31, 183, 450, 340, '', { stroke: COLORS.rule, strokeWidth: 0.8 }),
  text('bills', 'audit_label', 31, 543, 220, 18, 'ONE YOU COULD CANCEL THIS YEAR?', {
    fontSize: 9,
    fontWeight: 'bold',
    textColor: COLORS.brass,
  }),
  text('bills', 'audit', 261, 534, 220, 36, '{{audit_note}}', {
    dataBinding: 'audit_note',
    fontSize: 10,
    fontStyle: 'italic',
    fill: COLORS.brassPale,
  }),
  ...navChips('bills'),
];
```

Layout check (harness enforces): table 183–523, audit row 534–570, footer rule 625. Row height 40 × 8 + header 20 = 340. Tick columns 296 + 11×15 + 12 = 473 ≤ 481.

(b) Goal progress track — inside `goalElements`, after the `target_summary` element, insert:

```javascript
  text('goal', 'progress_label', 31, 234, 60, 14, 'PROGRESS', {
    fontSize: 8,
    fontWeight: 'bold',
    textColor: COLORS.muted,
  }),
  ...Array.from({ length: 10 }, (_, index) =>
    rect('goal', 'progress_seg', 95 + index * 39, 234, 36, 14, COLORS.paper, {
      stroke: COLORS.forest,
      strokeWidth: 0.8,
    })),
```

and change the goal table's `y` from `255` to stay `255` (the strip occupies 234–248; the table already starts at 255 — no change needed).

Note on element ids: `elementId()` appends a sequence suffix, so ten calls with role `progress_seg` produce unique ids `goal_progress_seg_NNN` — matching the test's `_progress_seg_` filter.

(c) Register the template in the return object:

```javascript
  bills: template('bills', 'Bills Register', billsElements),
```
(insert between `month` and `transactions` entries; object order is cosmetic).

- [ ] **Step 4: Implement hierarchy.js**

(a) Add a data factory near the other blank factories:

```javascript
const blankBillsData = () => {
  const data = {
    subtitle: 'Recurring bills and subscriptions, with one paid-square per month.',
    audit_note: '',
    nav_prev_label: '« DEC',
    nav_next_label: 'FUNDS »',
  };
  for (let row = 1; row <= 8; row += 1) {
    data[`bill_${row}`] = '';
    data[`due_${row}`] = '';
    data[`amount_${row}`] = '';
  }
  return data;
};
```

(b) Immediately after the blank month loop (before `blank_sinking_funds`):

```javascript
addNode('blank_bills', 'blank_annual', 'bills', 'Bills & Subscriptions', blankBillsData());
```

(c) Example branch — after `example_january`'s subtree additions but positioned as `example_annual`'s second child. Since children order follows `addNode` call order, move the call right after the `example_category_review` addNode (example_january's children don't affect example_annual ordering — `example_january` was added first, so `example_bills` added next lands at index 1):

```javascript
addNode('example_bills', 'example_annual', 'bills', 'Bills Register | Fictional', {
  subtitle: 'Fictional recurring costs | Shade squares as months are paid',
  bill_1: 'Internet (fictional)', due_1: '05', amount_1: '$55.00',
  bill_2: 'Music streaming (fictional)', due_2: '12', amount_2: '$11.99',
  bill_3: 'Renter insurance (fictional)', due_3: '20', amount_3: '$18.50',
  bill_4: '', due_4: '', amount_4: '',
  bill_5: '', due_5: '', amount_5: '',
  bill_6: '', due_6: '', amount_6: '',
  bill_7: '', due_7: '', amount_7: '',
  bill_8: '', due_8: '', amount_8: '',
  audit_note: 'Streaming overlaps a bundle - review in March.',
  nav_prev_label: '« JAN',
  nav_next_label: 'FUNDS »',
}, { example: true });
```

**Placement requirement:** the `addNode('example_bills', …)` call must come after `addNode('example_january', …)` but before `addNode('example_sinking_funds', …)` in source order so `example_annual.children` is `[example_january, example_bills, example_sinking_funds, example_goal, example_year_review]`.

(d) Update labels that referenced the old neighbors: `example_january.nav_next_label` → `'BILLS »'`; `example_sinking_funds.nav_prev_label` → `'« BILLS'`; `blank_sinking_funds.nav_prev_label` → `'« BILLS'`.

Also update the Step-1(g) test expectation accordingly — it asserts `blank_bills.data.nav_prev_label === '« DEC'` and `nav_next_label === 'FUNDS »'` (bills sits between December and funds; its own labels point outward — correct as written).

Wait: with bills between Dec and funds, `blank_sinking_funds.nav_prev_label` must read `'« BILLS'` — the Step-1 Task 2 test asserted `'« DEC'`. Update that assertion in this task to `'« BILLS'`. (Both edits are in this task's Step 1 — apply them there.)

- [ ] **Step 5: README**

Update `gallery-samples/03-personal-finance-planner/README.md`: Workflow list gains "Track recurring costs in **Bills & Subscriptions** (shade a square per paid month)." Page Inventory gains "- 1 recurring-bills register (and its guided example page)". Counts: "Default configuration exports 68 pages. Minimum configuration (`1 / 1`) exports 53 pages. Maximum configuration (`4 / 8`) exports 96 pages." Navigation Map: add `+-- Bills & Subscriptions` under Annual Outlook (both branches), and a line: "Month pages chain with « / » chips; December continues to Bills, then Funds → Goals → Year Review. Transaction sheets chain forward into the month's Category Review; Up from any sheet returns to its month."

- [ ] **Step 6: Run tests**

Run: `npx vitest run tests/unit/gallerySamples/personalFinance.test.ts tests/unit/gallerySamples/collection.test.ts`
Expected: PASS. Page counts 68/53/96.

- [ ] **Step 7: Commit**

```bash
git add gallery-samples/03-personal-finance-planner tests/unit/gallerySamples/personalFinance.test.ts
git commit -m "feat(samples): add Money Map bills register and goal track"
```

---

### Task 4: Wellbeing Rhythm — flat month structure + navigation

**Files:**
- Modify: `gallery-samples/04-wellness-fitness-journal/templates.js`
- Modify: `gallery-samples/04-wellness-fitness-journal/hierarchy.js`
- Test: `tests/unit/gallerySamples/wellnessFitness.test.ts`

**Interfaces:**
- Consumes: Task 1 harness escapes.
- Produces: `month_habits` children = `[week…, recovery, month_reflection]`; `week` children = `[workout…]`. Data keys: `nav_prev_label`/`nav_next_label` on every `week` and `recovery` node; `nav_prev_label` on every `month_reflection` node; `continue_label` on every `week` and `workout` node. Month page gains navigator grid (element role `navigator` on `month_habits`). Task 5 adds `milestones` under `blank_workspace` after `blank_baseline`.

- [ ] **Step 1: Rewrite the sequence test (failing first)**

In `wellnessFitness.test.ts` replace the whole `it('keeps all 52 weeks and their workouts in an accessible ordered sequence', …)` block with:

```typescript
    it('keeps weeks flat under months with chip navigation and indexable workouts', () => {
        const sample = loadGallerySample(contract.slug);
        const allWeeks: any[] = [];

        for (let month = 1; month <= 12; month += 1) {
            const monthNode = sample.nodes[`blank_month_${String(month).padStart(2, '0')}`];
            const children = monthNode.children.map((id: string) => sample.nodes[id]);
            const weeks = children.filter((child: any) => child.type === 'week');

            expect(children.at(-2).type, monthNode.id).toBe('recovery');
            expect(children.at(-1).type, monthNode.id).toBe('month_reflection');
            expect(children).toHaveLength(weeks.length + 2);
            weeks.forEach((week: any) => {
                const workouts = week.children.map((id: string) => sample.nodes[id]);
                expect(workouts.every((workout: any) => workout.type === 'workout'), week.id).toBe(true);
                expect(workouts, week.id).toHaveLength(2);
                expect(workouts[0].data.continue_label, week.id).toBe('STRENGTH 2 »');
                expect(workouts[1].data.continue_label, week.id).toBe('');
                expect(week.data.continue_label, week.id).toBe('STRENGTH 1 »');
            });
            allWeeks.push(...weeks);

            const recovery = children.at(-2);
            const reflection = children.at(-1);
            expect(recovery.data.nav_next_label).toBe('REFLECT »');
            expect(recovery.data.nav_prev_label).toMatch(/^« WEEK \d{2}$/);
            expect(reflection.data.nav_prev_label).toBe('« RECOVERY');
            expect(weeks.at(-1).data.nav_next_label).toBe('RECOVERY »');
        }

        expect(allWeeks.map(node => node.data.week_number)).toEqual(
            Array.from({ length: 52 }, (_, index) => index + 1),
        );
        expect(allWeeks[0].data.nav_prev_label).toBe('');
        expect(allWeeks[1].data.nav_prev_label).toBe('« WEEK 01');

        const monthNavigator = role(sample, 'month_habits', 'navigator');
        expect(monthNavigator).toBeTruthy();
        expect(monthNavigator.gridConfig).toMatchObject({
            sourceType: 'current', gridBorderMode: 'all', gridBorderStyle: 'solid',
        });
        expect(role(sample, 'week', 'continue')).toMatchObject({
            linkTarget: 'child_index', linkValue: '0', dataBinding: 'continue_label',
        });
        expect(role(sample, 'workout', 'continue')).toMatchObject({
            linkTarget: 'sibling', linkValue: '1', dataBinding: 'continue_label',
        });
        expect(role(sample, 'recovery', 'continue')).toMatchObject({
            linkTarget: 'sibling', linkValue: '1', dataBinding: 'nav_next_label',
        });
        expect(role(sample, 'month_reflection', 'workspace')).toMatchObject({
            linkTarget: 'specific_node',
            linkValue: 'blank_workspace',
        });
    });
```

Also in the guided-week test, change:
```typescript
        expect(guidedWorkouts).toHaveLength(1);
        expect(sample.nodes[guidedWorkouts[0].children[0]].type).toBe('workout');
```
to:
```typescript
        expect(guidedWorkouts).toHaveLength(2);
        expect(guidedWorkouts[1].data.continue_label).toBe('');
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/unit/gallerySamples/wellnessFitness.test.ts`
Expected: FAIL — chained structure, no labels, no month navigator.

- [ ] **Step 3: Implement templates.js**

In `gallery-samples/04-wellness-fitness-journal/templates.js`:

(a) Add a chip helper after `titleBlock`:

```javascript
const navChips = (templateId, { prev = true, next = true } = {}) => {
  const chips = [];
  if (prev) {
    chips.push(text(templateId, 'nav_prev', 336, 88, 70, 26, '{{nav_prev_label}}', {
      dataBinding: 'nav_prev_label',
      fontSize: 8.5,
      fontWeight: 'bold',
      textColor: COLORS.sageDeep,
      align: 'right',
      linkTarget: 'sibling',
      linkValue: '-1',
    }));
  }
  if (next) {
    chips.push(text(templateId, 'nav_next', 411, 88, 70, 26, '{{nav_next_label}}', {
      dataBinding: 'nav_next_label',
      fontSize: 8.5,
      fontWeight: 'bold',
      textColor: COLORS.clayDeep,
      align: 'right',
      linkTarget: 'sibling',
      linkValue: '1',
    }));
  }
  return chips;
};
```

(Title text at x32 y85 w449 is left-aligned and short — 'Week 37', month names — so the right 150px is visually free.)

(b) `monthHabitElements`: the habit matrices end at y 377+140=517; the continue button sits at y571. Between them add a week navigator. Replace the existing `text('month_habits', 'continue', …)` element and append the grid:

```javascript
  text('month_habits', 'index_label', 32, 528, 200, 15, 'OPEN A WEEK', {
    fontSize: 8, fontWeight: 'bold', textColor: COLORS.sageDeep,
  }),
  grid('month_habits', 'navigator', 32, 546, 87, 22, 5, { gapX: 4, gapY: 4 }),
```
keeping the `continue` element as-is (`BEGIN MONTH →`, child_index 0 — always valid: first child is a week or recovery). Move the continue button up is NOT needed: continue is at y571 h34 (ends 605), navigator rows: with up to 7 cells (5 weeks + recovery + reflection) → 2 rows = 22×2+4 = 48 → 546+48=594 … that collides with continue (571). Fix: navigator at `32, 540, 87, 20, 5, { gapX: 4, gapY: 3 }` → 2 rows = 43 → ends 583; continue moves to x328 w153 **y528 h30** instead. Final layout used below:

```javascript
  text('month_habits', 'index_label', 32, 524, 200, 14, 'OPEN A WEEK', {
    fontSize: 8, fontWeight: 'bold', textColor: COLORS.sageDeep,
  }),
  grid('month_habits', 'navigator', 32, 541, 87, 20, 5, { gapX: 4, gapY: 3 }),
```
and change the existing continue button's y from 571 to 528 and x/w to `328, 153` unchanged, height 26:
```javascript
  text('month_habits', 'continue', 328, 524, 153, 26, 'BEGIN MONTH →', {
    fontSize: 9, fontWeight: 'bold', textColor: COLORS.paper, fill: COLORS.sageDeep, align: 'center', borderRadius: 13,
    linkTarget: 'child_index', linkValue: '0',
  }),
```
Bounds: worst month has ceil(7/5)=2 rows → grid ends 541+43=584 ≤ 625−16=609 ✓. (weekCount 52 / monthCount 1 min gives ceil(54/5)=11 rows → 541+11×23−3=791 ✗ — **month navigator must handle the 1-month/52-week config**. Use 8 columns × 56w cells and cap rows: `grid('month_habits', 'navigator', 32, 541, 52, 16, 8, { gapX: 4, gapY: 3, fontSize: 6.5 })` → 54 children → 7 rows → 541+7×19−3=671 ✗ still. Constraint decision: keep the navigator but slice it: `dataSliceCount` is forbidden by nothing here (trip test forbids it for travel only) — but truncation hides weeks. Better: 9 cols × 45w × 14h cells, gaps 3: 54 cells → 6 rows → 541+6×17−3=640 ✗.)

**Resolution (use this):** place the navigator in the space freed by making the habit matrices sit higher — they're fixed. Instead put the navigator between subtitle and matrix: intention row is y146–176, matrix_note y184, matrix y213. No room. Final decision: month navigator uses `cols: 9`, cell `47×14`, `gapX 3, gapY 3, fontSize 6.5`, positioned at y543, and the extreme config (52 weeks in ≤4 months → up to 15 weeks+2 per month → 2 rows; the 1-month case cannot happen: `weekCount ≥ 4` and `monthCount:1` puts ALL 52+2 = impossible? No — monthCount 1, weekCount 52 IS legal) — so cap the visible index: `dataSliceCount: 27` (3 rows × 9) with the month's `BEGIN MONTH →` and week chips covering deep-linear traversal beyond 27. 3 rows → 543+3×17−3=591 ≤ 609 ✓.

```javascript
  grid('month_habits', 'navigator', 32, 543, 47, 14, 9, {
    gapX: 3, gapY: 3, dataSliceCount: 27,
  }),
```
and override the grid's fontSize by adding `fontSize: 6.5` to the element extras — the `grid()` helper sets fontSize 10; pass it through `extra`… the helper signature puts `extra` into `gridConfig`, not the element. Modify call to add the element-level override manually after creation:

```javascript
  (() => {
    const navigator = grid('month_habits', 'navigator', 32, 543, 47, 14, 9, {
      gapX: 3, gapY: 3, dataSliceCount: 27,
    });
    navigator.fontSize = 6.5;
    navigator.borderRadius = 3;
    return navigator;
  })(),
```

Default config months carry 4–5 weeks (+2) → one row of 9 shows everything; only the degenerate 1-month/52-week config truncates the index at 27 with linear chips still reaching every week.

(c) `weekElements`: append `...navChips('week')` and replace the continue element:

```javascript
  text('week', 'continue', 328, 574, 153, 32, '{{continue_label}}', {
    dataBinding: 'continue_label',
    fontSize: 9, fontWeight: 'bold', textColor: COLORS.paper, fill: COLORS.clay, align: 'center', borderRadius: 16,
    linkTarget: 'child_index', linkValue: '0',
  }),
```

(d) `workoutElements`: replace continue:

```javascript
  text('workout', 'continue', 328, 550, 153, 32, '{{continue_label}}', {
    dataBinding: 'continue_label',
    fontSize: 9, fontWeight: 'bold', textColor: COLORS.paper, fill: COLORS.sageDeep, align: 'center', borderRadius: 16,
    linkTarget: 'sibling', linkValue: '1',
  }),
```

(e) `recoveryElements`: replace the continue element (`REFLECT →`, child_index) with a sibling-based one bound to `nav_next_label`, and append a prev chip:

```javascript
  text('recovery', 'continue', 328, 578, 153, 28, '{{nav_next_label}}', {
    dataBinding: 'nav_next_label',
    fontSize: 9, fontWeight: 'bold', textColor: COLORS.paper, fill: COLORS.clay, align: 'center', borderRadius: 14,
    linkTarget: 'sibling', linkValue: '1',
  }),
  ...navChips('recovery', { next: false }),
```

(f) `reflectionElements`: append `...navChips('month_reflection', { next: false })`.

- [ ] **Step 4: Implement hierarchy.js**

Replace the blank month/week loop with:

```javascript
let previousWeekNumber = 0;
for (let monthIndex = 0; monthIndex < CONFIG.monthCount; monthIndex += 1) {
  const monthNumber = String(monthIndex + 1).padStart(2, '0');
  const monthName = monthNames[monthIndex];
  const monthId = `blank_month_${monthNumber}`;
  addNode(monthId, 'blank_workspace', 'month_habits', monthName, {
    ...habitData(),
    subtitle: `${monthName} | Habits are cues to notice, not targets to perfect.`,
  });

  const monthWeeks = weeksByMonth[monthIndex];
  monthWeeks.forEach((weekNumber, weekIndex) => {
    const weekId = `blank_week_${String(weekNumber).padStart(2, '0')}`;
    const isLastInMonth = weekIndex === monthWeeks.length - 1;
    addNode(weekId, monthId, 'week', `Week ${String(weekNumber).padStart(2, '0')}`, {
      ...weekData(weekNumber),
      nav_prev_label: previousWeekNumber === 0 ? '' : `« WEEK ${String(previousWeekNumber).padStart(2, '0')}`,
      nav_next_label: isLastInMonth ? 'RECOVERY »' : `WEEK ${String(weekNumber + 1).padStart(2, '0')} »`,
      continue_label: CONFIG.workoutsPerWeek > 0 ? 'STRENGTH 1 »' : '',
    });
    previousWeekNumber = weekNumber;

    for (let workout = 1; workout <= CONFIG.workoutsPerWeek; workout += 1) {
      addNode(`${weekId}_workout_${String(workout).padStart(2, '0')}`, weekId, 'workout', `Week ${weekNumber} | Strength ${workout}`, {
        ...workoutData(weekNumber, workout),
        continue_label: workout < CONFIG.workoutsPerWeek ? `STRENGTH ${workout + 1} »` : '',
      });
    }
  });

  const lastWeekLabel = monthWeeks.length > 0
    ? `« WEEK ${String(monthWeeks[monthWeeks.length - 1]).padStart(2, '0')}`
    : '';
  addNode(`blank_month_${monthNumber}_recovery`, monthId, 'recovery', `${monthName} Recovery Notes`, {
    ...recoveryData(monthName),
    nav_prev_label: lastWeekLabel,
    nav_next_label: 'REFLECT »',
  });
  addNode(`blank_month_${monthNumber}_reflection`, monthId, 'month_reflection', `${monthName} Reflection`, {
    ...reflectionData(monthName),
    nav_prev_label: '« RECOVERY',
  });
}
```

(The `for (let monthIndex …)` replaces the previous `for` loop wholesale; `weeksByMonth` computation above it is unchanged.)

Restructure the example branch identically: `example_month` children become `[example_week, example_recovery, example_reflection]`, `example_week` children `[example_workout_01, example_workout_02]`:

- `addNode('example_workout_02', 'example_workout_01', …)` → parent `'example_week'`.
- `addNode('example_recovery', 'example_workout_02', …)` → parent `'example_month'`.
- `addNode('example_reflection', 'example_recovery', …)` → parent `'example_month'`.
- Add to `example_week` data: `nav_prev_label: ''`, `nav_next_label: 'RECOVERY »'`, `continue_label: 'STRENGTH 1 »'`.
- Add to `example_workout_01` data: `continue_label: 'STRENGTH 2 »'`; to `example_workout_02`: `continue_label: ''`.
- Add to `example_recovery` data: `nav_prev_label: '« WEEK 01'`, `nav_next_label: 'REFLECT »'`.
- Add to `example_reflection` data: `nav_prev_label: '« RECOVERY'`.

**Source-order requirement:** `example_recovery` and `example_reflection` must be added AFTER both workouts so `example_month.children` ends `[…, example_recovery, example_reflection]` — they're month children now, and the workouts are week children, so the only ordering constraint is recovery before reflection.

- [ ] **Step 5: Run tests**

Run: `npx vitest run tests/unit/gallerySamples/wellnessFitness.test.ts tests/unit/gallerySamples/collection.test.ts`
Expected: PASS — page counts unchanged (204 / 19 / 308): restructure moves nodes, adds none.

- [ ] **Step 6: Commit**

```bash
git add gallery-samples/04-wellness-fitness-journal tests/unit/gallerySamples/wellnessFitness.test.ts
git commit -m "feat(samples): flatten Wellbeing Rhythm months with week navigation"
```

---

### Task 5: Wellbeing Rhythm — body map + strength milestones page

**Files:**
- Modify: `gallery-samples/04-wellness-fitness-journal/templates.js`
- Modify: `gallery-samples/04-wellness-fitness-journal/hierarchy.js`
- Modify: `gallery-samples/04-wellness-fitness-journal/README.md`
- Test: `tests/unit/gallerySamples/wellnessFitness.test.ts`

**Interfaces:**
- Consumes: Task 4 structure; wellness `staticTable(templateId, group, x, y, widths, rowHeight, headers, rows, alignments)` helper.
- Produces: template `milestones` (name `Milestones Tracker`), node `blank_milestones` (child of `blank_workspace`, index 1, right after `blank_baseline`); recovery template gains two body-outline SVGs (element roles `body_front`, `body_back`).

- [ ] **Step 1: Write failing tests**

In `wellnessFitness.test.ts`:

(a) contract: add `'milestones'` to `expectedTemplateIds`; `pageCount` stays `[180, 220]`.

(b) First test: `.toBe(204)` → `.toBe(205)`; `toBeLessThan(221)` → `toBeLessThan(222)`.

(c) Short-journal test: `.toBe(19)` → `.toBe(20)`. Max test: `.toBe(308)` → `.toBe(309)`.

(d) Add to `writablePatterns` in the blank-data test:

```typescript
            /^(date|best|target)_\d+$/,
```

(e) New test at the end of the describe block:

```typescript
    it('adds a strength milestones page and recovery body maps', () => {
        const sample = loadGallerySample(contract.slug);

        expect(sample.nodes.blank_milestones).toMatchObject({
            type: 'milestones', parentId: 'blank_workspace',
        });
        expect(sample.nodes.blank_workspace.children.indexOf('blank_milestones')).toBe(1);
        expect(sample.nodes.blank_milestones.data.movement_1).toBe('');

        const milestoneBindings = new Set(sample.templates.milestones.elements
            .map((element: any) => element.dataBinding)
            .filter(Boolean));
        ['movement_1', 'date_1', 'best_1', 'target_1', 'movement_8', 'target_8'].forEach(field => {
            expect(milestoneBindings.has(field), field).toBe(true);
        });

        const bodyMaps = sample.templates.recovery.elements.filter((element: any) =>
            element.type === 'svg' && (element.id.includes('_body_front_') || element.id.includes('_body_back_')),
        );
        expect(bodyMaps).toHaveLength(2);
        bodyMaps.forEach((map: any) => {
            expect(map.svgContent).toContain('viewBox');
            expect(map.svgContent).not.toMatch(/<svg[^>]*\s(width|height)=/);
            expect(map.svgContent).not.toMatch(/<(script|image|foreignObject|use|style)/i);
        });
        expect(sample.templates.milestones.name).not.toBe('Strength Milestones');
    });
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/unit/gallerySamples/wellnessFitness.test.ts`
Expected: FAIL — no milestones template.

- [ ] **Step 3: Implement templates.js**

(a) Add the body-outline SVGs after `smallArc`:

```javascript
const bodyFront = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 90 150">
  <g fill="none" stroke="#7f9473" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="45" cy="16" r="10"/>
    <path d="M45 26 V88"/>
    <path d="M45 34 L20 44 L14 74 M45 34 L70 44 L76 74"/>
    <path d="M32 32 C32 58 34 74 36 88 L34 142 M58 32 C58 58 56 74 54 88 L56 142"/>
    <path d="M36 88 H54"/>
    <path d="M34 142 H26 M56 142 H64"/>
  </g>
</svg>`;

const bodyBack = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 90 150">
  <g fill="none" stroke="#a96551" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="45" cy="16" r="10"/>
    <path d="M45 26 V60 M45 60 C40 76 40 82 42 88 M45 60 C50 76 50 82 48 88"/>
    <path d="M45 34 L20 44 L14 74 M45 34 L70 44 L76 74"/>
    <path d="M32 32 C32 58 34 74 36 88 L34 142 M58 32 C58 58 56 74 54 88 L56 142"/>
    <path d="M36 88 H54 M31 50 H59"/>
    <path d="M34 142 H26 M56 142 H64"/>
  </g>
</svg>`;
```

(b) Rework `recoveryElements`' middle band. Replace the four pattern elements (`energy_label`, `energy_pattern`, `recovery_label`, `recovery_pattern` — currently two label/value pairs occupying x32 and x270 at y374–459) with a left-column stack plus right-column body panel:

```javascript
  text('recovery', 'energy_label', 32, 366, 211, 16, 'ENERGY PATTERN', { fontSize: 9, fontWeight: 'bold', textColor: COLORS.sageDeep }),
  text('recovery', 'energy_pattern', 32, 384, 211, 44, '{{energy_pattern}}', { dataBinding: 'energy_pattern', fontSize: 10, fill: COLORS.paper, verticalAlign: 'top' }),
  text('recovery', 'recovery_label', 32, 436, 211, 16, 'RECOVERY PATTERN', { fontSize: 9, fontWeight: 'bold', textColor: COLORS.sageDeep }),
  text('recovery', 'recovery_pattern', 32, 454, 211, 44, '{{recovery_pattern}}', { dataBinding: 'recovery_pattern', fontSize: 10, fill: COLORS.paper, verticalAlign: 'top' }),
  text('recovery', 'body_label', 270, 366, 211, 16, 'MARK STRAIN / TIGHTNESS', { fontSize: 9, fontWeight: 'bold', textColor: COLORS.clay }),
  rect('recovery', 'body_panel', 270, 384, 211, 114, COLORS.paper, { stroke: COLORS.rule, strokeWidth: 0.8 }),
  svg('recovery', 'body_front', 292, 390, 62, 103, bodyFront),
  svg('recovery', 'body_back', 380, 390, 62, 103, bodyBack),
  text('recovery', 'body_caption', 270, 498, 211, 13, 'front              back', {
    fontSize: 7.5, textColor: COLORS.muted, align: 'center',
  }),
```

and move the adjustment block down: `adjustment_label` y 493→516, `adjustment` y 520→534 with h 40, continue button unchanged at y578. (Delete the old y374–459 pattern elements entirely; keep every binding name identical.)

(c) New milestones template — add after `reflectionElements`:

```javascript
const milestoneRows = Array.from({ length: 8 }, (_, index) => {
  const row = index + 1;
  return [`movement_${row}`, `date_${row}`, `best_${row}`, `target_${row}`];
});

const milestonesElements = [
  ...pageBase('milestones', 'Strength milestones'),
  ...titleBlock('milestones'),
  text('milestones', 'note', 32, 155, 449, 28, 'Personal records without a deadline. Update whenever a number quietly moves.', {
    fontSize: 10, fontStyle: 'italic', textColor: COLORS.muted, fill: COLORS.sagePale, align: 'center',
  }),
  ...staticTable('milestones', 'records', 32, 205, [150, 80, 90, 129], 42,
    ['MOVEMENT', 'DATE', 'BEST', 'NEXT TARGET'], milestoneRows,
    ['left', 'center', 'center', 'left']),
];
```

(Table: 42 × 9 = 378 → 205..583 ≤ 609 ✓.)

(d) Register in the return object:

```javascript
  milestones: template('milestones', 'Milestones Tracker', milestonesElements),
```

- [ ] **Step 4: Implement hierarchy.js**

After `blank_baseline`'s addNode, add:

```javascript
addNode('blank_milestones', 'blank_workspace', 'milestones', 'Strength Milestones', (() => {
  const data = { subtitle: 'A quiet register of personal records and next honest targets.' };
  for (let row = 1; row <= 8; row += 1) {
    data[`movement_${row}`] = '';
    data[`date_${row}`] = '';
    data[`best_${row}`] = '';
    data[`target_${row}`] = '';
  }
  return data;
})());
```

(Placed immediately after baseline so `blank_workspace.children` = `[blank_baseline, blank_milestones, months…]`.)

- [ ] **Step 5: README**

Update `gallery-samples/04-wellness-fitness-journal/README.md`:
- Workflow: add "4.5 Log lifetime bests on the **Strength Milestones** page; mark strain on the recovery **body maps**." (renumber list items).
- Default Inventory: add "- 1 strength milestones register", change total to "205 exported pages total".
- Navigation section: replace the chain description with: "Month → any week via the OPEN A WEEK index or `BEGIN MONTH →`; weeks chain with « WEEK / WEEK » chips (first week of a month reaches back into the previous month's last week); the last week continues to Recovery → Reflection. Week → strength logs via `STRENGTH n »`; **Up** from a workout returns to its week, from a week to its month. **Previous** chips vanish at true sequence ends." Remove the sentence "Sequence links use a validated child at index 0…"; replace with "Continue chips are data-bound per node; zero-workout configurations show no dead controls."
- Border Construction: unchanged.

- [ ] **Step 6: Run tests**

Run: `npx vitest run tests/unit/gallerySamples/wellnessFitness.test.ts tests/unit/gallerySamples/collection.test.ts`
Expected: PASS. Counts 205 / 20 / 309.

- [ ] **Step 7: Commit**

```bash
git add gallery-samples/04-wellness-fitness-journal tests/unit/gallerySamples/wellnessFitness.test.ts
git commit -m "feat(samples): add Wellbeing body maps and milestones page"
```

---

### Task 6: Field Notes — day navigation + reservation ticks

**Files:**
- Modify: `gallery-samples/06-travel-field-journal/templates.js`
- Modify: `gallery-samples/06-travel-field-journal/hierarchy.js`
- Test: `tests/unit/gallerySamples/travelFieldJournal.test.ts`

**Interfaces:**
- Consumes: Task 1 harness escapes.
- Produces: data keys `nav_prev_label`/`nav_next_label` on every `day` node (blank + Lisbon). Element roles `nav_prev`/`nav_next` on the `day` template; roles `tick_confirmed`/`tick_paid` (rects) + labels on `reservation`.

- [ ] **Step 1: Write failing test**

Append to `travelFieldJournal.test.ts`:

```typescript
    it('chips day-to-day navigation and reservation status ticks', () => {
        const sample = loadGallerySample(contract.slug);
        const prev = role(sample, 'day', 'nav_prev');
        const next = role(sample, 'day', 'nav_next');

        expect(prev).toMatchObject({ linkTarget: 'sibling', linkValue: '-1', dataBinding: 'nav_prev_label' });
        expect(next).toMatchObject({ linkTarget: 'sibling', linkValue: '1', dataBinding: 'nav_next_label' });

        const days = sample.nodes.blank_trip_01_itinerary.children.map((id: string) => sample.nodes[id]);
        expect(days[0].data.nav_prev_label).toBe('');
        expect(days[0].data.nav_next_label).toBe('DAY 02 »');
        expect(days.at(-1)!.data.nav_prev_label).toBe('« DAY 04');
        expect(days.at(-1)!.data.nav_next_label).toBe('');

        const lisbonDays = sample.nodes.example_itinerary.children.map((id: string) => sample.nodes[id]);
        expect(lisbonDays[1].data.nav_prev_label).toBe('« DAY 01');
        expect(lisbonDays[1].data.nav_next_label).toBe('DAY 03 »');

        const ticks = sample.templates.reservation.elements.filter((element: any) =>
            element.type === 'rect' && (element.id.includes('_tick_confirmed_') || element.id.includes('_tick_paid_')),
        );
        expect(ticks).toHaveLength(2);
        ticks.forEach((tick: any) => {
            expect(tick).toMatchObject({ w: 13, h: 13, fill: '#fffaf1', stroke: '#356f66', strokeWidth: 0.8 });
        });
    });
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/unit/gallerySamples/travelFieldJournal.test.ts`
Expected: FAIL — roles missing.

- [ ] **Step 3: Implement templates.js**

(a) In the `day` template, shrink `date_label` from `w: 447` to `w: 250` and append after the `moment` field elements:

```javascript
    text('day', 'nav_prev', 296, 164, 85, 24, '{{nav_prev_label}}', {
      dataBinding: 'nav_prev_label',
      fontSize: 9,
      fontWeight: 'bold',
      textColor: COLORS.seaDeep,
      align: 'right',
      linkTarget: 'sibling',
      linkValue: '-1',
    }),
    text('day', 'nav_next', 391, 164, 90, 24, '{{nav_next_label}}', {
      dataBinding: 'nav_next_label',
      fontSize: 9,
      fontWeight: 'bold',
      textColor: COLORS.rustDeep,
      align: 'right',
      linkTarget: 'sibling',
      linkValue: '1',
    }),
```

(b) In the `reservation` template, after the `kind` element add:

```javascript
    rect('reservation', 'tick_confirmed', 330, 176, 13, 13, COLORS.paper, { stroke: COLORS.sea, strokeWidth: 0.8 }),
    text('reservation', 'tick_confirmed_label', 348, 172, 60, 20, 'CONFIRMED', {
      fontSize: 7.5, fontWeight: 'bold', textColor: COLORS.seaDeep,
    }),
    rect('reservation', 'tick_paid', 420, 176, 13, 13, COLORS.paper, { stroke: COLORS.sea, strokeWidth: 0.8 }),
    text('reservation', 'tick_paid_label', 438, 172, 43, 20, 'PAID', {
      fontSize: 7.5, fontWeight: 'bold', textColor: COLORS.seaDeep,
    }),
```

(The `kind` chip occupies x34–156 at y169–197; ticks sit right of it, clear of the provider field at y215.)

- [ ] **Step 4: Implement hierarchy.js**

(a) In `dayData`, add label parameters. Replace the factory:

```javascript
const dayData = (dayNumber, dayCount, values = {}) => ({
  subtitle: `Day ${String(dayNumber).padStart(2, '0')} | Shape a route, then record what was not on the list.`,
  menu_label: `DAY ${String(dayNumber).padStart(2, '0')}`,
  date_label: '',
  timeline: '',
  field_notes: '',
  weather: '',
  moment: '',
  nav_prev_label: dayNumber === 1 ? '' : `« DAY ${String(dayNumber - 1).padStart(2, '0')}`,
  nav_next_label: dayNumber === dayCount ? '' : `DAY ${String(dayNumber + 1).padStart(2, '0')} »`,
  ...values,
});
```

(b) Update the three Lisbon day nodes to pass the count: `dayData(1, 3, { … })`, `dayData(2, 3, { … })`, `dayData(3, 3, { … })`.

(c) Update the blank loop call: `dayData(dayNumber, CONFIG.daysPerTrip)`.

- [ ] **Step 5: Run tests**

Run: `npx vitest run tests/unit/gallerySamples/travelFieldJournal.test.ts tests/unit/gallerySamples/collection.test.ts`
Expected: PASS (counts unchanged 55/23/226; day chips dead-end cleanly at trip edges because neighbor sections contain no `day`-type children — harness cousin model mirrors the engine).

- [ ] **Step 6: Commit**

```bash
git add gallery-samples/06-travel-field-journal tests/unit/gallerySamples/travelFieldJournal.test.ts
git commit -m "feat(samples): add Field Notes day chips and reservation ticks"
```

---

### Task 7: Field Notes — Tastes & Finds + Tickets & Sketches pages

**Files:**
- Modify: `gallery-samples/06-travel-field-journal/templates.js`
- Modify: `gallery-samples/06-travel-field-journal/hierarchy.js`
- Modify: `gallery-samples/06-travel-field-journal/README.md`
- Test: `tests/unit/gallerySamples/travelFieldJournal.test.ts`

**Interfaces:**
- Consumes: travel `staticTable(templateId, group, x, y, widths, rowHeight, headers, rows)` and `field(...)` helpers; Task 6 conventions.
- Produces: templates `tastes` (name `Tastes Log`) and `sketches` (name `Sketch Frames`); per-trip nodes `blank_trip_NN_tastes`, `blank_trip_NN_sketches` inserted between expenses and highlights; Lisbon nodes `example_tastes`, `example_sketches` in the same position. Data keys: tastes `where_1..6`, `dish_1..6`, `best_bite`; sketches `caption_1..4`. Trip navigator cell height 62→44.

- [ ] **Step 1: Update tests (failing first)**

In `travelFieldJournal.test.ts`:

(a) contract: `expectedTemplateIds` gains `'tastes', 'sketches'` (after `'expenses'`); `pageCount` → `[50, 78]`.

(b) First test: `.toBe(55)` → `.toBe(63)`.

(c) One-day-trip test: `pageCount: [15, 30]` → `[20, 35]`; `.toBe(23)` → `.toBe(27)`.

(d) Max test: contract override `pageCount: [220, 235]` → `[235, 245]`; `.toBe(226)` → `.toBe(240)`; the `terminalTrip.children` expected array becomes:

```typescript
        expect(terminalTrip.children).toEqual([
            'blank_trip_06_reservations',
            'blank_trip_06_itinerary',
            'blank_trip_06_packing',
            'blank_trip_06_expenses',
            'blank_trip_06_tastes',
            'blank_trip_06_sketches',
            'blank_trip_06_highlights',
        ]);
```

(e) Semantic-stability test: same 7-element array per trip (insert the two new ids before `_highlights`).

(f) EXAMPLE-chrome walk: `expect(visited.size).toBe(13)` → `.toBe(15)`.

(g) Writable regex: extend with `|where_\d+|dish_\d+|best_bite|caption_\d+` (inside the existing group, before the closing `)$`).

(h) Writing-regions test: add `'tastes', 'sketches'` to the `['day', 'packing', 'expenses', 'highlights']` array.

(i) New test:

```typescript
    it('adds tastes and sketches pages to every trip', () => {
        const sample = loadGallerySample(contract.slug);

        expect(sample.nodes.blank_trip_01_tastes).toMatchObject({ type: 'tastes', parentId: 'blank_trip_01' });
        expect(sample.nodes.blank_trip_01_sketches).toMatchObject({ type: 'sketches', parentId: 'blank_trip_01' });
        expect(sample.nodes.example_tastes.data.where_1).toContain('Alfama');
        expect(sample.nodes.example_sketches.data.caption_1.length).toBeGreaterThan(0);

        const stars = sample.templates.tastes.elements.filter((element: any) =>
            element.type === 'rect' && element.id.includes('_star_'),
        );
        expect(stars).toHaveLength(30);
        stars.forEach((star: any) => {
            expect(star).toMatchObject({ w: 13, h: 13, stroke: '#b46148', strokeWidth: 0.8 });
        });

        const frames = sample.templates.sketches.elements.filter((element: any) =>
            element.type === 'rect' && element.id.includes('_frame_'),
        );
        expect(frames).toHaveLength(4);
        frames.forEach((frame: any) => {
            expect(frame).toMatchObject({ fill: '#fffaf1', stroke: '#9e988b', strokeWidth: 0.8 });
            expect(frame.w).toBeGreaterThanOrEqual(200);
            expect(frame.h).toBeGreaterThanOrEqual(140);
        });

        const navigator = role(sample, 'trip', 'navigator');
        expect(navigator.h).toBe(44);
    });
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/unit/gallerySamples/travelFieldJournal.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement templates.js**

(a) Trip navigator fit: in the `trip` template change `grid('trip', 'navigator', 34, 350, 137, 62, 3)` to `grid('trip', 'navigator', 34, 350, 137, 44, 3)` (7 cards → 3 rows → 350 + 3×44 + 2×8 = 498 ≤ travel_note y508 ✓).

(b) New `tastes` template (insert after `expenses`):

```javascript
const tastes = {
  id: 'tastes',
  name: 'Tastes Log',
  width: W,
  height: H,
  elements: [
    ...pageBase('tastes', 'tastes + finds'),
    ...titleBlock('tastes'),
    text('tastes', 'instruction', 34, 164, 447, 30, 'Food, drink, objects, small discoveries. Shade squares for the verdict — five means unforgettable.', {
      fontFamily: 'georgia', fontSize: 10, textColor: COLORS.muted,
    }),
    ...staticTable('tastes', 'log', 34, 204, [150, 200], 50, ['WHERE', 'WHAT'],
      Array.from({ length: 6 }, (_, index) => [`where_${index + 1}`, `dish_${index + 1}`])),
    // verdict header + star squares column (right of the table)
    rect('tastes', 'table_cell_header_log_3', 384, 204, 97, 50, COLORS.seaDeep),
    text('tastes', 'verdict_head', 388, 204, 89, 50, 'VERDICT', {
      fontSize: 8, fontWeight: 'bold', textColor: COLORS.paper,
    }),
    ...Array.from({ length: 6 }, (_, rowIndex) => {
      const rowY = 204 + 50 * (rowIndex + 1);
      const cells = [rect('tastes', `star_row_bg_${rowIndex + 1}`, 384, rowY, 97, 50, COLORS.paper)];
      for (let star = 0; star < 5; star += 1) {
        cells.push(rect('tastes', `star_${rowIndex + 1}_${star + 1}`, 390 + star * 18, rowY + 19, 13, 13, COLORS.paper, {
          stroke: COLORS.rust,
          strokeWidth: 0.8,
        }));
      }
      return cells;
    }).flat(),
    rect('tastes', 'verdict_line_vertical', 383.6, 204, 0.8, 350, COLORS.rule),
    rect('tastes', 'verdict_boundary', 384, 204, 97, 350, '', { stroke: COLORS.rule, strokeWidth: 0.8 }),
    ...field('tastes', 'best_bite', 'The one worth a detour', 'best_bite', 34, 570, 447, 30, { fontSize: 9 }),
  ],
};
```

Layout note: the travel `staticTable` renders 2 columns x34–384; the hand-built verdict column continues 384–481 with its own single-drawn edges (`verdict_line_vertical` covers the shared edge at x384; horizontal edges align with the table's own row lines at the same y values so no doubling: the verdict column adds NO horizontal lines — its row separation is implied by the table's full-width horizontals? They are NOT full width (table lines span only 350 wide). Add per-row horizontals for the verdict column:

```javascript
    ...Array.from({ length: 6 }, (_, index) =>
      rect('tastes', `verdict_line_horizontal_${index + 1}`, 384, 204 + 50 * (index + 1) - 0.4, 97, 0.8, COLORS.rule)),
```

(include this inside the elements array, before `verdict_boundary`). `best_bite` field: y570+19..600 ≤ 625 ✓.

(c) New `sketches` template (after `tastes`):

```javascript
const sketches = {
  id: 'sketches',
  name: 'Sketch Frames',
  width: W,
  height: H,
  elements: [
    ...pageBase('sketches', 'tickets + sketches'),
    ...titleBlock('sketches'),
    text('sketches', 'instruction', 34, 160, 447, 26, 'Draw the doorway, tape the stub, map the corner. Caption each frame below it.', {
      fontFamily: 'georgia', fontSize: 10, textColor: COLORS.muted,
    }),
    ...[0, 1, 2, 3].flatMap(index => {
      const col = index % 2;
      const row = Math.floor(index / 2);
      const frameX = 34 + col * 232;
      const frameY = 192 + row * 216;
      return [
        rect('sketches', `frame_${index + 1}`, frameX, frameY, 215, 160, COLORS.paper, {
          stroke: COLORS.rule,
          strokeWidth: 0.8,
        }),
        text('sketches', `caption_label_${index + 1}`, frameX, frameY + 166, 60, 16, 'CAPTION', {
          fontSize: 7, fontWeight: 'bold', textColor: COLORS.rustDeep,
        }),
        text('sketches', `caption_${index + 1}`, frameX + 62, frameY + 162, 153, 24, `{{caption_${index + 1}}}`, {
          dataBinding: `caption_${index + 1}`,
          fontFamily: 'georgia',
          fontSize: 9,
        }),
      ];
    }),
  ],
};
```

(Frames: rows at y192 and y408; captions end 408+160+24=592 ≤ 625 ✓. Columns x34 and x266, ending 481 ✓.)

(d) Add `tastes, sketches,` to the return object between `expenses` and `highlights`.

- [ ] **Step 4: Implement hierarchy.js**

(a) Factories after `expenseData`:

```javascript
const tastesData = (values = {}) => {
  const data = {
    subtitle: 'Tastes, objects, and small finds worth remembering precisely.',
    menu_label: 'TASTES',
    best_bite: '',
  };
  for (let row = 1; row <= 6; row += 1) {
    data[`where_${row}`] = '';
    data[`dish_${row}`] = '';
  }
  return { ...data, ...values };
};

const sketchesData = (values = {}) => ({
  subtitle: 'Four open frames for drawings, tickets, and glued-in scraps.',
  menu_label: 'SKETCHES',
  caption_1: '',
  caption_2: '',
  caption_3: '',
  caption_4: '',
  ...values,
});
```

(b) Lisbon branch — insert between `example_expenses` and `example_highlights` addNode calls:

```javascript
addNode('example_tastes', 'example_trip_lisbon', 'tastes', 'Lisbon | Tastes & Finds', tastesData({
  where_1: 'Bakery window, Alfama lane', dish_1: 'Warm custard pastry, extra cinnamon',
  where_2: 'Market counter, Baixa', dish_2: 'Grilled sardines with lemon',
  where_3: 'Corner kiosk by the river', dish_3: 'Bitter espresso, ceramic cup kept cool',
  best_bite: 'The pastry — order two immediately, regret nothing.',
}), { example: true });

addNode('example_sketches', 'example_trip_lisbon', 'sketches', 'Lisbon | Tickets & Sketches', sketchesData({
  caption_1: 'Tram ticket, morning ride west',
  caption_2: 'Tile pattern from an Alfama doorway',
  caption_3: 'Ferry deck rail at dusk',
  caption_4: 'Bookshop shelf that leaned like the street',
}), { example: true });
```

(c) Blank trips — insert between the expenses and highlights addNode calls in the loop:

```javascript
  addNode(`${prefix}_tastes`, prefix, 'tastes', `Journey ${tripLabel} | Tastes & Finds`, tastesData());
  addNode(`${prefix}_sketches`, prefix, 'sketches', `Journey ${tripLabel} | Tickets & Sketches`, sketchesData());
```

- [ ] **Step 5: README**

Update `gallery-samples/06-travel-field-journal/README.md`: Workflow step 5 becomes "Prepare packing, keep a simple expense ledger, log tastes and finds, fill sketch frames, and close with highlights." Guided Lisbon list gains "- A tastes log and captioned sketch frames". Inventory: "Default configuration exports 63 pages"; guided Lisbon "15 pages"; each blank journey gains "a tastes log and a sketch-frames page"; "Minimum configuration exports 27 pages. Maximum configuration exports 240 pages…". Navigation: add "- Day pages chain with « DAY / DAY » chips inside each journey" and note the dashboard's 7 cards.

- [ ] **Step 6: Run tests**

Run: `npx vitest run tests/unit/gallerySamples/travelFieldJournal.test.ts tests/unit/gallerySamples/collection.test.ts`
Expected: PASS. Counts 63/27/240.

- [ ] **Step 7: Commit**

```bash
git add gallery-samples/06-travel-field-journal tests/unit/gallerySamples/travelFieldJournal.test.ts
git commit -m "feat(samples): add Field Notes tastes and sketches pages"
```

---

### Task 8: Wayfarer Codex — session chips, threads & clocks, round tracker

**Files:**
- Modify: `gallery-samples/08-ttrpg-campaign-codex/templates.js`
- Modify: `gallery-samples/08-ttrpg-campaign-codex/hierarchy.js`
- Test: `tests/unit/gallerySamples/ttrpgCampaignCodex.test.ts`

**Interfaces:**
- Consumes: Task 1 escapes; codex `field(...)` helper and faction-reputation hand-rolled table conventions.
- Produces: template `threads` (name `Thread Clocks`); nodes `blank_threads` (child of `blank_workspace` at index 2, after `blank_party`) and `example_threads` (child of `example_workspace`, after `example_party`); data keys per threads node: `thread_1..7`, `owner_1..7`, `move_1..7`; `nav_prev_label`/`nav_next_label` on every `session` node; encounter template roles `round_label` + `round_seg_1..6`. Task 9 adds the bank rail to `threads` too — this task's template must leave x ≥ 487 empty.

- [ ] **Step 1: Update tests (failing first)**

In `ttrpgCampaignCodex.test.ts`:

(a) contract: `expectedTemplateIds` gains `'threads'`; `pageCount` → `[92, 130]`.

(b) First test: `toHaveLength(125)` → `toHaveLength(127)`.

(c) Min-config test: `pageCount: [22, 42]` → `[24, 44]`; `toHaveLength(40)` → `toHaveLength(42)`; expected `blank_workspace.children` array gains `'blank_threads'` at index 2:

```typescript
        expect(sample.nodes.blank_workspace.children).toEqual([
            'blank_campaign',
            'blank_party',
            'blank_threads',
            'blank_session_bank',
            'blank_quest_bank',
            'blank_npc_bank',
            'blank_location_bank',
            'blank_faction_bank',
            'blank_encounter_bank',
            'blank_lore_bank',
        ]);
```

(d) Max test: `pageCount: [208, 208]` → `[210, 210]`; `toHaveLength(208)` → `toHaveLength(210)`.

(e) Guided-chrome test: `expect(guidedIds).toHaveLength(25)` → `.toHaveLength(26)`.

(f) Writable regex: extend the group with `|thread_\d+|owner_\d+|move_\d+`.

(g) New test:

```typescript
    it('adds threads-and-clocks tracking, session chips, and encounter rounds', () => {
        const sample = loadGallerySample(contract.slug);

        expect(sample.nodes.blank_threads).toMatchObject({ type: 'threads', parentId: 'blank_workspace' });
        expect(sample.nodes.example_threads).toMatchObject({ type: 'threads', parentId: 'example_workspace' });
        expect(sample.nodes.example_threads.data.thread_1).toMatch(/Greenwarden/i);

        const clockSegments = sample.templates.threads.elements.filter((element: any) =>
            element.type === 'rect' && element.id.includes('_clock_seg_'),
        );
        expect(clockSegments).toHaveLength(42);
        clockSegments.forEach((segment: any) => {
            expect(segment).toMatchObject({ w: 14, h: 14, stroke: '#783f38', strokeWidth: 0.8 });
        });

        const sessionPrev = role(sample, 'session', 'nav_prev');
        const sessionNext = role(sample, 'session', 'nav_next');
        expect(sessionPrev).toMatchObject({ linkTarget: 'sibling', linkValue: '-1', dataBinding: 'nav_prev_label' });
        expect(sessionNext).toMatchObject({ linkTarget: 'sibling', linkValue: '1', dataBinding: 'nav_next_label' });
        const sessions = sample.nodes.blank_session_bank.children.map((id: string) => sample.nodes[id]);
        expect(sessions[0].data.nav_prev_label).toBe('');
        expect(sessions[0].data.nav_next_label).toBe('S02 »');
        expect(sessions.at(-1)!.data.nav_next_label).toBe('');
        expect(sample.nodes.example_session_01.data.nav_prev_label).toBe('');
        expect(sample.nodes.example_session_01.data.nav_next_label).toBe('');

        const roundSegments = sample.templates.encounter.elements.filter((element: any) =>
            element.type === 'rect' && element.id.includes('_round_seg_'),
        );
        expect(roundSegments).toHaveLength(6);
        expect(sample.templates.threads.name).not.toBe('Threads & Clocks');
    });
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/unit/gallerySamples/ttrpgCampaignCodex.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement templates.js**

(a) Session chips — append to the `session` template's elements array:

```javascript
    text('session', 'nav_prev', 336, 82, 66, 24, '{{nav_prev_label}}', {
      dataBinding: 'nav_prev_label',
      fontSize: 8,
      fontWeight: 'bold',
      textColor: COLORS.mossDeep,
      align: 'right',
      linkTarget: 'sibling',
      linkValue: '-1',
    }),
    text('session', 'nav_next', 408, 82, 73, 24, '{{nav_next_label}}', {
      dataBinding: 'nav_next_label',
      fontSize: 8,
      fontWeight: 'bold',
      textColor: COLORS.oxblood,
      align: 'right',
      linkTarget: 'sibling',
      linkValue: '1',
    }),
```

(Title at y78 is left-aligned georgia 21px; session titles are short.)

(b) Encounter round tracker — in the `encounter` template, change the `notes` field call from `y 491, h 51` to `y 500, h 42`, and insert before it:

```javascript
    text('encounter', 'round_label', 40, 482, 50, 14, 'ROUND', {
      fontSize: 7, fontWeight: 'bold', textColor: COLORS.oxblood,
    }),
    ...Array.from({ length: 6 }, (_, index) =>
      rect('encounter', 'round_seg', 96 + index * 22, 482, 14, 14, COLORS.writing, {
        stroke: COLORS.oxblood,
        strokeWidth: 0.8,
      })),
```

(`elementId` suffixes make ids `encounter_round_seg_NNN` — matches `_round_seg_`.)

(c) New `threads` template (insert after `lore`):

```javascript
const threadsRows = Array.from({ length: 7 }, (_, index) => index + 1);

const threads = {
  id: 'threads',
  name: 'Thread Clocks',
  width: W,
  height: H,
  elements: [
    ...pageBase('threads', 'threads and clocks'),
    ...titleBlock('threads'),
    text('threads', 'key', 40, 152, 441, 16, 'SHADE A SEGMENT WHEN PRESSURE ADVANCES. FULL CLOCK = THE THREAD RESOLVES ITSELF.', {
      fontSize: 6.8,
      fontWeight: 'bold',
      textColor: COLORS.oxblood,
      characterSpacing: 0.4,
    }),
    // header band
    rect('threads', 'head_thread', 40, 174, 145, 18, COLORS.mossDeep),
    rect('threads', 'head_clock', 185, 174, 130, 18, COLORS.mossDeep),
    rect('threads', 'head_owner', 315, 174, 66, 18, COLORS.mossDeep),
    rect('threads', 'head_move', 381, 174, 100, 18, COLORS.mossDeep),
    text('threads', 'head_thread_label', 45, 174, 135, 18, 'THREAD', { fontSize: 7, fontWeight: 'bold', textColor: COLORS.writing }),
    text('threads', 'head_clock_label', 190, 174, 120, 18, 'CLOCK', { fontSize: 7, fontWeight: 'bold', textColor: COLORS.writing }),
    text('threads', 'head_owner_label', 320, 174, 56, 18, 'OWNER', { fontSize: 7, fontWeight: 'bold', textColor: COLORS.writing }),
    text('threads', 'head_move_label', 386, 174, 90, 18, 'NEXT MOVE', { fontSize: 7, fontWeight: 'bold', textColor: COLORS.writing }),
    ...threadsRows.flatMap(row => {
      const rowY = 192 + (row - 1) * 54;
      const cells = [
        rect('threads', `writing_thread_${row}`, 40, rowY, 145, 54, COLORS.writing),
        text('threads', `thread_value_${row}`, 46, rowY + 4, 133, 46, `{{thread_${row}}}`, {
          dataBinding: `thread_${row}`, fontFamily: 'georgia', fontSize: 8.6, verticalAlign: 'top',
        }),
        rect('threads', `cell_clock_${row}`, 185, rowY, 130, 54, COLORS.writing),
        rect('threads', `cell_owner_${row}`, 315, rowY, 66, 54, COLORS.writing),
        text('threads', `owner_value_${row}`, 319, rowY + 4, 58, 46, `{{owner_${row}}}`, {
          dataBinding: `owner_${row}`, fontSize: 8, verticalAlign: 'top',
        }),
        rect('threads', `writing_move_${row}`, 381, rowY, 100, 54, COLORS.writing),
        text('threads', `move_value_${row}`, 386, rowY + 4, 90, 46, `{{move_${row}}}`, {
          dataBinding: `move_${row}`, fontFamily: 'georgia', fontSize: 8, verticalAlign: 'top',
        }),
      ];
      for (let segment = 0; segment < 6; segment += 1) {
        cells.push(rect('threads', `clock_seg_${row}_${segment + 1}`, 191 + segment * 20, rowY + 20, 14, 14, COLORS.writing, {
          stroke: COLORS.oxblood,
          strokeWidth: 0.8,
        }));
      }
      return cells;
    }),
    // single-drawn edges
    ...[185, 315, 381].map((lineX, index) =>
      rect('threads', `line_vertical_${index + 1}`, lineX - 0.4, 174, 0.8, 396, COLORS.rule)),
    ...threadsRows.map(row =>
      rect('threads', `line_horizontal_${row}`, 40, 192 + (row - 1) * 54 - 0.4, 441, 0.8, COLORS.rule)),
    rect('threads', 'boundary', 40, 174, 441, 396, '', { stroke: COLORS.rule, strokeWidth: 0.8 }),
  ],
};
```

(Table 174–570; footer rule 620 ✓. Thread cells w145 ≥104, move cells w100 — named `writing_move_` but the writing-region test asserts w≥104 for codex `_writing_` rects: **rename** move cell role to `cell_move_${row}` and thread cell keeps `writing_thread_`. Adjust the flatMap accordingly — only `writing_thread_N` uses the `writing_` prefix.)

Corrected two lines inside the flatMap:

```javascript
        rect('threads', `cell_move_${row}`, 381, rowY, 100, 54, COLORS.writing),
```
(replaces the `writing_move_${row}` rect; the `move_value_${row}` text is unchanged).

(d) Register in the return object: add `threads,` after `lore`.

- [ ] **Step 4: Implement hierarchy.js**

(a) Factory after `loreData`:

```javascript
const threadsData = (values = {}) => {
  const data = {
    subtitle: 'Fronts, dangers, and promises in motion. One row per thread; shade clocks as pressure builds.',
    menu_label: 'THREADS + CLOCKS',
  };
  for (let row = 1; row <= 7; row += 1) {
    data[`thread_${row}`] = '';
    data[`owner_${row}`] = '';
    data[`move_${row}`] = '';
  }
  return { ...data, ...values };
};
```

(b) `sessionData` gains labels — replace the factory:

```javascript
const sessionData = (number, count, values = {}) => ({
  subtitle: `Session ${String(number).padStart(2, '0')} | Prepare pressure, record choices, and carry consequences forward.`,
  menu_label: `SESSION ${String(number).padStart(2, '0')}`,
  date: '',
  recap: '',
  opening: '',
  beats: '',
  decisions: '',
  consequence: '',
  outcome: '',
  next_steps: '',
  nav_prev_label: number === 1 ? '' : `« S${String(number - 1).padStart(2, '0')}`,
  nav_next_label: number === count ? '' : `S${String(number + 1).padStart(2, '0')} »`,
  ...values,
});
```

Callers: the guided session becomes `sessionData(1, 1, { … })`. In `blankBanks`, the session entry's factory receives only `(number)` via the generic loop — change the loop to pass counts:

```javascript
blankBanks.forEach(([key, label, count, type, dataFactory, note]) => {
  const bankId = `blank_${key}_bank`;
  addNode(bankId, 'blank_workspace', 'bank', `${label[0]}${label.slice(1).toLowerCase()} Bank`, bankData(label, count, note));
  for (let number = 1; number <= count; number += 1) {
    const numberLabel = String(number).padStart(2, '0');
    const data = key === 'session' ? dataFactory(number, count) : dataFactory(number);
    addNode(`blank_${key}_${numberLabel}`, bankId, type, `${label[0]}${label.slice(1).toLowerCase()} ${numberLabel}`, data);
  }
});
```

(c) Blank threads — insert right after `blank_party`'s adventurer loop, before `blankBanks`:

```javascript
addNode('blank_threads', 'blank_workspace', 'threads', 'Threads & Clocks', threadsData());
```

(d) Example threads — insert after the last `example_character_03` addNode, before `example_session_bank`:

```javascript
addNode('example_threads', 'example_workspace', 'threads', 'Threads & Clocks | Ashen Bell', threadsData({
  thread_1: 'Greenwarden recovery party rides for Briar Watch',
  owner_1: 'Iora / GM',
  move_1: 'Arrives at dawn unless delayed by the gate oath.',
  thread_2: 'The waking mile spreads north under the hill',
  owner_2: 'GM',
  move_2: 'Each damped toll adds one stable milestone.',
}), { example: true });
```

Wait — ordering: `example_workspace.children` currently `[example_campaign, example_party, example_session_bank, …]`; the guided-chrome count test just counts nodes (26), and no test asserts example_workspace child order. Place `example_threads` after `example_party` in source order (i.e. after the `example_character_03` call because characters attach to `example_party`, not the workspace — the workspace order is set by `example_campaign`/`example_party`/`example_threads`/banks call order). Its clock rows 1–2 filled; rows 3–7 stay `''` (guided pages may carry partial content; the blank-writable test only checks `blank_` nodes).

- [ ] **Step 5: Run tests**

Run: `npx vitest run tests/unit/gallerySamples/ttrpgCampaignCodex.test.ts tests/unit/gallerySamples/collection.test.ts`
Expected: PASS. Counts 127/42/210.

- [ ] **Step 6: Commit**

```bash
git add gallery-samples/08-ttrpg-campaign-codex tests/unit/gallerySamples/ttrpgCampaignCodex.test.ts
git commit -m "feat(samples): add Codex threads page, session chips, round ticks"
```

---

### Task 9: Wayfarer Codex — bank tab rail + README

**Files:**
- Modify: `gallery-samples/08-ttrpg-campaign-codex/templates.js`
- Modify: `gallery-samples/08-ttrpg-campaign-codex/README.md`
- Test: `tests/unit/gallerySamples/ttrpgCampaignCodex.test.ts`

**Interfaces:**
- Consumes: Task 8's `threads` template; stable bank ids `blank_session_bank` … `blank_lore_bank`.
- Produces: `bankRail(templateId, activeKey)` helper; rail elements (roles `rail_tab_*`, `rail_label_*`, `rail_link_*`) on templates `campaign, bank, party, character, session, quest, npc, location, faction, encounter, lore, threads`.

- [ ] **Step 1: Write failing test**

Append to `ttrpgCampaignCodex.test.ts`:

```typescript
    it('gives every interior page a bank tab rail with one active tab on records', () => {
        const sample = loadGallerySample(contract.slug);
        const railTemplates = [
            'campaign', 'bank', 'party', 'character', 'session', 'quest',
            'npc', 'location', 'faction', 'encounter', 'lore', 'threads',
        ];
        const expectedTargets = [
            'blank_session_bank', 'blank_quest_bank', 'blank_npc_bank', 'blank_location_bank',
            'blank_faction_bank', 'blank_encounter_bank', 'blank_lore_bank',
        ];
        const activeByTemplate: Record<string, string> = {
            session: 'ses', quest: 'qst', npc: 'npc', location: 'loc',
            faction: 'fac', encounter: 'enc', lore: 'lor',
        };

        railTemplates.forEach(templateId => {
            const elements = sample.templates[templateId].elements;
            const links = elements.filter((element: any) => element.id.includes('_rail_link_'));
            const tabs = elements.filter((element: any) => element.id.includes('_rail_tab_'));
            const labels = elements.filter((element: any) => element.id.includes('_rail_label_'));

            expect(links, templateId).toHaveLength(7);
            expect(tabs, templateId).toHaveLength(7);
            expect(labels, templateId).toHaveLength(7);
            expect(links.map((link: any) => link.linkValue)).toEqual(expectedTargets);
            links.forEach((link: any) => {
                expect(link.linkTarget, link.id).toBe('specific_node');
                expect(link.fill, link.id).toBe('');
                expect(link.stroke, link.id).toBe('');
                expect(link.rotation, link.id).toBe(0);
                expect(link.x, link.id).toBeGreaterThanOrEqual(485);
                expect(link.x + link.w, link.id).toBeLessThanOrEqual(509);
            });
            labels.forEach((label: any) => {
                expect(label.rotation, label.id).toBe(90);
            });

            const activeKey = activeByTemplate[templateId];
            const activeTabs = tabs.filter((tab: any) => tab.fill === '#783f38');
            if (activeKey) {
                expect(activeTabs, templateId).toHaveLength(1);
                expect(activeTabs[0].id).toContain(`_rail_tab_${activeKey}_`);
            } else {
                expect(activeTabs, templateId).toHaveLength(0);
            }
        });

        ['cover', 'start', 'workspace'].forEach(templateId => {
            expect(sample.templates[templateId].elements.some((element: any) =>
                element.id.includes('_rail_'),
            ), templateId).toBe(false);
        });
    });
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/unit/gallerySamples/ttrpgCampaignCodex.test.ts`
Expected: FAIL — no rail elements.

- [ ] **Step 3: Verify rotated-text bounds handling, then implement**

First check how `getElementBounds` treats rotation (the harness bound-checks every element):

Run: `grep -n "rotation" components/canvas/elementBounds.ts | head`

- If it returns the axis-aligned bounding box of the rotated element: a 48×20 text at x473 rotated 90° has AABB 20×48 centered at (497, y+24) → x487..507, inside the page. Use the coordinates below unchanged.
- If it ignores rotation (returns the unrotated box): the unrotated box x473 w48 ends at 521 > 509 → the harness would flag overflow. In that case place the label as a 20×48 box at x487 with rotation 90 — visually rotated around its center, AABB identical (48×20 → clipped? No: AABB of a 20×48 box rotated 90° is 48×20 centered at (497, y+24) → x473..521 — same problem mirrored). **Whichever variant keeps both the raw box AND the harness-computed bounds inside 509 is the one to use**; check the helper first and pick. If neither passes, drop rotation: horizontal 3-letter labels `fontSize: 5.8` in an 18×48 box at x488 with `verticalAlign: 'middle'`, `align: 'center'`.

In `templates.js`, after the `routeMark` constant add:

```javascript
const BANK_TABS = [
  ['SES', 'blank_session_bank'],
  ['QST', 'blank_quest_bank'],
  ['NPC', 'blank_npc_bank'],
  ['LOC', 'blank_location_bank'],
  ['FAC', 'blank_faction_bank'],
  ['ENC', 'blank_encounter_bank'],
  ['LOR', 'blank_lore_bank'],
];

const bankRail = (templateId, activeKey = '') => BANK_TABS.flatMap(([key, target], index) => {
  const tabY = 92 + index * 54;
  const active = key === activeKey;
  const lowerKey = key.toLowerCase();
  return [
    rect(templateId, `rail_tab_${lowerKey}`, 487, tabY, 20, 48, active
      ? COLORS.oxblood
      : (index % 2 === 0 ? COLORS.mossPale : COLORS.oxbloodPale), { borderRadius: 4 }),
    text(templateId, `rail_label_${lowerKey}`, 473, tabY + 14, 48, 20, key, {
      rotation: 90,
      fontSize: 6.8,
      fontWeight: 'bold',
      textColor: active ? COLORS.writing : COLORS.oxbloodDeep,
      align: 'center',
    }),
    rect(templateId, `rail_link_${lowerKey}`, 487, tabY, 20, 48, '', {
      linkTarget: 'specific_node',
      linkValue: target,
      zIndex: 30,
    }),
  ];
});
```

Append to each template's elements array:

```javascript
    ...bankRail('campaign'),
```
```javascript
    ...bankRail('bank'),
```
```javascript
    ...bankRail('party'),
```
```javascript
    ...bankRail('character'),
```
```javascript
    ...bankRail('session', 'SES'),
```
```javascript
    ...bankRail('quest', 'QST'),
```
```javascript
    ...bankRail('npc', 'NPC'),
```
```javascript
    ...bankRail('location', 'LOC'),
```
```javascript
    ...bankRail('faction', 'FAC'),
```
```javascript
    ...bankRail('encounter', 'ENC'),
```
```javascript
    ...bankRail('lore', 'LOR'),
```
```javascript
    ...bankRail('threads'),
```

(Rail: 7 tabs at y92..464, x487–507 — clear of the 441-wide field column ending at 481 and the corner marks ending at y54.)

- [ ] **Step 4: README**

Update `gallery-samples/08-ttrpg-campaign-codex/README.md`:
- Workflow: "Campaign charter -> party -> threads & clocks -> sessions -> …". Add: "Every interior page carries a right-edge bank rail (SES QST NPC LOC FAC ENC LOR) for one-tap lookup; record pages highlight their own bank. From guided example pages the rail jumps into the blank codex's banks."
- Guided Adventure: add "- A threads-and-clocks page with two active Ashen Bell fronts."
- Blank Inventory: add "- 1 threads & clocks tracker." Change "103 blank pages" → "104 blank pages", default total "125" → "127", minimum "40" → "42", maximum "208" → "210".
- Page Priorities: add "- Threads & clocks keep campaign pressure visible: one row per front, six shade-in segments each."
- Navigation notes: add "- Session records chain with « S / S » chips; first and last sessions show no dead chip."

- [ ] **Step 5: Run tests**

Run: `npx vitest run tests/unit/gallerySamples/ttrpgCampaignCodex.test.ts tests/unit/gallerySamples/collection.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add gallery-samples/08-ttrpg-campaign-codex tests/unit/gallerySamples/ttrpgCampaignCodex.test.ts
git commit -m "feat(samples): add Codex bank tab rail"
```

---

### Task 10: Whole-collection verification (unit + real modal + PDF)

**Files:**
- Modify (fixes only, if verification finds problems): the four product directories + their tests
- No new production files. Verification artifacts go to the scratchpad directory, NOT the repo.

**Interfaces:**
- Consumes: everything above; `scratch/render_project.mjs` + `scratch/render_all.mjs` (Playwright drivers that paste both scripts into the real Hierarchy Generator modal on a Vite dev server at :3002, run Preview, screenshot template tabs, and export the PDF).

- [ ] **Step 1: Full unit suite**

Run: `npx vitest run`
Expected: entire suite PASS (not just gallerySamples — pdfService and generator tests must be untouched). Any failure in files outside the allowed list means an accidental edit — revert it.

- [ ] **Step 2: Read the scratch tooling, adapt invocation only if needed**

Read `scratch/render_project.mjs` header comments for usage (`node scratch/render_project.mjs <sample-dir> TabName:out.png … --pdf out.pdf`, dev server on :3002 via `npx vite --port 3002`). The tooling clicks template tabs by `name` — the four products' new template names are `Bills Register`, `Milestones Tracker`, `Tastes Log`, `Sketch Frames`, `Thread Clocks`; none equals a node title (verify by grep before running):

Run: `grep -n "Bills Register\|Milestones Tracker\|Tastes Log\|Sketch Frames\|Thread Clocks" gallery-samples/*/hierarchy.js`
Expected: no matches (node titles differ).

If the tooling lives outside the worktree (scratch/ is untracked in main checkout), copy the two .mjs files into the scratchpad and run from there — do not commit them.

- [ ] **Step 3: Real-modal drive, one product at a time**

Start the dev server in the background (`npx vite --port 3002`), then for each product render the changed/new pages to the scratchpad, e.g.:

```bash
node scratch/render_project.mjs gallery-samples/03-personal-finance-planner \
  "Monthly Plan:money-month.png" "Bills Register:money-bills.png" "Debt or Savings Goal:money-goal.png" --pdf money-map.pdf
node scratch/render_project.mjs gallery-samples/04-wellness-fitness-journal \
  "Monthly Habit Rhythm:well-month.png" "Recovery Notes:well-recovery.png" "Milestones Tracker:well-pr.png"
node scratch/render_project.mjs gallery-samples/06-travel-field-journal \
  "Daily Field Notes:travel-day.png" "Tastes Log:travel-tastes.png" "Sketch Frames:travel-sketches.png"
node scratch/render_project.mjs gallery-samples/08-ttrpg-campaign-codex \
  "Session Record:codex-session.png" "Thread Clocks:codex-threads.png" "NPC Record:codex-npc.png"
```

Inspect each PNG (Read tool): chips present and legible, no overlapping text, bills ticks aligned under J–D initials, body maps inside their panel, sketches frames square, codex rail tabs readable and not clipped.

- [ ] **Step 4: PDF spot checks**

Export each product's PDF via the tooling's `--pdf` flag and verify (Read page ranges or a small Node script in the scratchpad using pdfjs/text extraction):
- Money Map: February plan page carries « JAN / MAR » annotations; December carries BILLS »; a transactions page's continue lands on the next sheet/review.
- Wellbeing: month page week-index cells link to week pages; last week's RECOVERY » lands on recovery.
- Field Notes: DAY 02 » on day 1 lands on day 2; last day shows no next chip.
- Codex: rail SES tab on an NPC page lands on the session bank page; threads clocks render as 42 squares.
- Grayscale: export one product with the grayscale option (per tooling support) or visually confirm contrast from the PNGs (all four palettes were chosen for grayscale legibility; new elements reuse palette colors only).

Verification method for annotations (scratchpad script):

```javascript
// scratchpad/check_links.cjs — count /Dest annotations per page
const fs = require('fs');
const pdf = fs.readFileSync(process.argv[2], 'latin1');
console.log('Dest annotations:', (pdf.match(/\/Dest/g) || []).length);
```
Expected: counts strictly greater than the pre-change exports (baseline: run once against `git stash`-free HEAD builds is unnecessary — just assert > 0 and eyeball a click in a PDF viewer if available).

- [ ] **Step 5: Fix anything found, re-run affected tests, final full suite**

Run: `npx vitest run`
Expected: PASS.

- [ ] **Step 6: Commit fixes (if any) and wrap up**

```bash
git add -A gallery-samples tests
git commit -m "fix(samples): verification follow-ups for four-flagship improvements"
```

Then follow superpowers:finishing-a-development-branch (merge options back to `main`; the worktree branch carries 8–9 commits touching only the allowed paths).

---

## Self-Review (performed while writing)

- **Spec coverage:** flatten+nav (Tasks 2, 4, 6, 8), bills+goal track (3), body map+milestones (5), tastes+sketches+ticks (6–7), rail+threads+rounds+session chips (8–9), harness contract (1), verification (10), READMEs (3, 5, 7, 9). Endpoint audit encoded in harness escape + per-task label assertions.
- **Placeholders:** none; every step carries code or exact commands.
- **Type consistency:** `nav_prev_label`/`nav_next_label`/`continue_label` uniform across tasks; roles `nav_prev`/`nav_next`/`continue`/`navigator` match the `findRole`/`role` helpers' `_${name}_` convention; new template names avoid node-title collisions.
- **Known risk flags for implementers:** (1) Task 9 Step 3's rotated-label bounds check MUST be done before committing to coordinates; (2) Task 4's month navigator uses `dataSliceCount: 27` — only the degenerate 1-month/52-week config truncates, and linear chips still reach every week; (3) Task 2 ships December's `BILLS »` label one task before the bills page exists — the link resolves to funds in the interim and Task 3 restores truthfulness; run Tasks 2 and 3 back-to-back.
