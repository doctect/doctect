# Gallery Twelve Expansion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build twelve new flagship-depth gallery generator products (slots 09–20) with per-product tests, rendered samples, and publish-ready READMEs, per `docs/superpowers/specs/2026-07-30-gallery-twelve-expansion-design.md`.

**Architecture:** Each product is an independent `gallery-samples/NN-slug/` directory holding `templates.js` + `hierarchy.js` (the Hierarchy Generator's two `new Function` scopes), a README whose top half is the gallery listing text, and rendered `samples/`. The existing `tests/helpers/gallerySampleHarness.ts` validates every product; each task adds a product spec under `tests/unit/gallerySamples/` and appends its slug to `collection.test.ts` so the suite stays green after every task. Per-node cross-links (gamebook choices, chess candidate moves, pedigree boxes, month→plant rows) use **reference-node children + `child_index` chips** — the established pattern that resolves differently per node and adds zero pages.

**Tech Stack:** JavaScript generator scripts, TypeScript, Vitest, Playwright render tooling (`scratch/`), jsPDF export.

## Global Constraints

- Source design: `docs/superpowers/specs/2026-07-30-gallery-twelve-expansion-design.md`. Read it plus `tests/helpers/gallerySampleHarness.ts` and one existing flagship (`gallery-samples/06-travel-field-journal/`) before implementing any product.
- Work on branch `feature/gallery-twelve-expansion`.
- Target exactly reMarkable Paper Pro 509×679, single variant, per-product muted palette that stays legible in grayscale.
- Every product uses stable IDs `root`, `start_here`, `example_workspace`, `blank_workspace`. Every `example_workspace` descendant (and the hub itself) sets `data.example_label = 'EXAMPLE'` and `data.skip_label = 'Skip to blank workspace →'` (exact strings — the harness checks them), with visible text bindings and the skip element linking `specific_node → blank_workspace`. `blank_workspace` sets both fields to `''` so the whole blank tree inherits the suppression.
- Template scope: bare consts `RM_PP_WIDTH` (509) / `RM_PP_HEIGHT` (679) only, no `createId`, `return templates;`. Hierarchy scope: `createId('prefix')` + `templates` only, plus `const CONFIG = { ...DEFAULT_CONFIG, ...(typeof SAMPLE_CONFIG === 'object' ? SAMPLE_CONFIG : {}) };`. No imports in product scripts.
- Per-node cross-links: give the source node **reference children** (`referenceId` set, `type` equal to the original node's template — the harness enforces the type match) and put `child_index` chips on the template. An unresolved `child_index` or `sibling` link is acceptable only when the element's bound label is `''`. Controls that must vanish at dead ends are **unfilled text chips** (ink `textColor`, no `fill`) — a filled shape bound to a possibly-`''` label paints an empty box.
- No rotated text (`elementBounds` ignores rotation). WinAnsi-safe glyphs in template/static text: `»`, `«`, `–`, `·`; never `→`/`▸`/`↓` (the harness-mandated `skip_label` data string is the one exception). Every grid sets `gridBorderMode`, `gridBorderColor`, `gridBorderWidth`, `gridBorderStyle` explicitly.
- Template `name` values must differ from every node title and from each other (render tooling clicks tabs by exact text). Use the exact template names listed per task — the Task 1 render runner's shot tables depend on them.
- Element and template IDs deterministic; generated IDs (`createId`) only for repeated non-addressed leaves.
- Factual products (Quiz Night trivia, Opening Atlas chess lines, The Grower's Year horticulture, The Observatory astronomy) must be accurate and evergreen; the task's reviewer verifies facts. Fictional content (story, families, companies) must be clearly fictional.
- Rendering needs a dev server: `npx vite --port 3002` (start in background if not already running). Render with `node scratch/render_expansion.mjs <slug>`; spot-check PDF links with `node scratch/pdf_spot.cjs <pdf> page <N>`.
- Run tests with `npm test -- --run <paths>`. Product tests import from `'../../helpers/gallerySampleHarness'` exactly as the existing specs do. The `isBlankBranch` / `isExampleBranch` helpers walk `parentId` up to `blank_workspace` / `example_workspace` (Task 3 Step 1 shows the code); every product test file that uses one copies its own definition — no shared test helper file.
- Commit after each task with the message given in the task, ending with:

```
Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01726g8ocwEqB6qZNASSh64Y
```

## File Structure

- `scratch/render_expansion.mjs` — PNG + PDF render runner for slots 09–20 (Task 1; skips not-yet-built dirs).
- `gallery-samples/09-adventure-gamebook/` … `gallery-samples/20-habit-quest-rpg/` — twelve product directories, each `templates.js`, `hierarchy.js`, `README.md`, `samples/`.
- `tests/unit/gallerySamples/<camelCaseSlug>.test.ts` — one product spec per task.
- `tests/unit/gallerySamples/collection.test.ts` — `EXPECTED_SLUGS` grows by one slug per product task; count-specific test names generalized in Task 1.
- `gallery-samples/README.md` — product list grows to twenty in Task 14.

Every product task (2–13) follows the same eight steps; the per-task sections give the concrete contract test, config, structure, and content. Steps reference the product's slug, camelCase test name, template names, and commit message from its own section.

---

### Task 1: Branch, render runner, collection test generalization

**Files:**
- Create: `scratch/render_expansion.mjs`
- Modify: `tests/unit/gallerySamples/collection.test.ts` (test names only)

**Interfaces:**
- Consumes: `scratch/render_all.mjs` mechanics (proven Playwright flow), `scratch/render_project.mjs`.
- Produces: `node scratch/render_expansion.mjs [slug]` renders `samples/NN_label.png` shots + `<slug>.pdf` for every existing expansion product; collection test names no longer hardcode "eight".

- [ ] **Step 1: Create the branch**

```bash
git checkout -b feature/gallery-twelve-expansion
```

- [ ] **Step 2: Generalize collection test names**

In `tests/unit/gallerySamples/collection.test.ts` rename `'contains exactly the eight approved products'` → `'contains exactly the approved products'` and `'gives all eight products distinct core chrome geometry'` → `'gives all products distinct core chrome geometry'`. Change nothing else.

- [ ] **Step 3: Write the render runner**

Create `scratch/render_expansion.mjs` by copying the working mechanics of `scratch/render_all.mjs` (Playwright launch, textarea injection via the React-aware value setter, Run Generator, Templates view, per-tab clipped screenshots, Export PDF download) with this project table, filtered by `existsSync(p.dir)` and an optional slug argument:

```js
const projects = [
  { dir: 'gallery-samples/09-adventure-gamebook', slug: 'adventure-gamebook',
    shots: [['Cover Plate', 'cover'], ['Adventure Section', 'section'], ['Ending Page', 'ending'], ['Tracking Sheet', 'tracking'], ['Story Map Sheet', 'story_map'], ['Authoring Hub', 'hub']] },
  { dir: 'gallery-samples/10-trivia-quiz-night', slug: 'trivia-quiz-night',
    shots: [['Quiz Cover', 'cover'], ['Round Hub', 'round'], ['Question Card', 'question'], ['Answer Card', 'answer'], ['Score Sheet', 'score'], ['Host Kit Hub', 'hub']] },
  { dir: 'gallery-samples/11-chess-opening-repertoire', slug: 'chess-opening-repertoire',
    shots: [['Atlas Cover', 'cover'], ['Repertoire Hub', 'repertoire'], ['Chapter Opener', 'chapter'], ['Position Page', 'position'], ['Line Worksheet', 'worksheet'], ['Practice Hub', 'hub']] },
  { dir: 'gallery-samples/12-family-history-workbook', slug: 'family-history-workbook',
    shots: [['Workbook Cover', 'cover'], ['Pedigree Chart', 'chart'], ['Person Page', 'person'], ['Family Group Sheet', 'group'], ['Story Prompts', 'prompts'], ['Research Ledger', 'research']] },
  { dir: 'gallery-samples/13-language-learning-lab', slug: 'language-learning-lab',
    shots: [['Lab Cover', 'cover'], ['Deck Hub', 'deck'], ['Card Front', 'front'], ['Card Back', 'back'], ['Grammar Sheet', 'grammar'], ['Drill Sheet', 'drill']] },
  { dir: 'gallery-samples/14-job-search-hq', slug: 'job-search-hq',
    shots: [['Tracker Cover', 'cover'], ['Pipeline Board', 'pipeline'], ['Company Dossier', 'dossier'], ['Star Story Sheet', 'star'], ['Offer Comparison', 'comparison'], ['Weekly Review Sheet', 'review']] },
  { dir: 'gallery-samples/15-garden-almanac', slug: 'garden-almanac',
    shots: [['Almanac Cover', 'cover'], ['Bed Map', 'bed'], ['Month Spread', 'month'], ['Plant Card', 'plant'], ['Plant Index', 'index'], ['Harvest Ledger', 'harvest']] },
  { dir: 'gallery-samples/16-reading-journal', slug: 'reading-journal',
    shots: [['Room Cover', 'cover'], ['Bookshelf', 'shelf'], ['Book Page', 'book'], ['Quote Leaf', 'quote'], ['Series Ledger', 'series'], ['Wrap Up Sheet', 'wrapup']] },
  { dir: 'gallery-samples/17-home-owners-manual', slug: 'home-owners-manual',
    shots: [['Manual Cover', 'cover'], ['Home Dashboard', 'dashboard'], ['Room Page', 'room'], ['System Page', 'system'], ['Appliance Card', 'appliance'], ['Season Checklist', 'season']] },
  { dir: 'gallery-samples/18-music-practice-studio', slug: 'music-practice-studio',
    shots: [['Shed Cover', 'cover'], ['Repertoire Rack', 'rack'], ['Piece Page', 'piece'], ['Session Log', 'session'], ['Chord Sheet', 'chord'], ['Gig Planner', 'gig']] },
  { dir: 'gallery-samples/19-astronomy-observation-log', slug: 'astronomy-observation-log',
    shots: [['Dome Cover', 'cover'], ['Month Sky', 'month'], ['Target Card', 'target'], ['Observation Sheet', 'observation'], ['Life List', 'lifelist'], ['Observatory Hub', 'hub']] },
  { dir: 'gallery-samples/20-habit-quest-rpg', slug: 'habit-quest-rpg',
    shots: [['Ledger Cover', 'cover'], ['Character Sheet', 'character'], ['Skill Tree', 'tree'], ['Daily Quest', 'daily'], ['Boss Battle', 'boss'], ['Trophy Hall', 'trophy']] },
].filter(p => existsSync(p.dir)).filter(p => !process.argv[2] || p.slug === process.argv[2]);
```

Write PNGs to `<dir>/samples/NN_label.png` and the PDF to `<dir>/samples/<slug>.pdf` exactly as `render_all.mjs` does. If the filtered list is empty, print `no expansion products found` and exit 0.

- [ ] **Step 4: Verify runner degrades gracefully and tests stay green**

Run:

```bash
node scratch/render_expansion.mjs && npm test -- --run tests/unit/gallerySamples/collection.test.ts
```

Expected: `no expansion products found`, collection suite PASS.

- [ ] **Step 5: Commit**

```bash
git add scratch/render_expansion.mjs tests/unit/gallerySamples/collection.test.ts
git commit -m "chore: expansion render runner and count-free collection test names"
```

---

### Task 2: The Branching Road (09-adventure-gamebook)

**Files:**
- Create: `gallery-samples/09-adventure-gamebook/{templates.js,hierarchy.js,README.md}`
- Create: `tests/unit/gallerySamples/adventureGamebook.test.ts`
- Modify: `tests/unit/gallerySamples/collection.test.ts` (append slug)

**Interfaces:**
- Consumes: harness (`expectValidGallerySample`, `loadGallerySample`, `validateGallerySample`), shared stable IDs.
- Produces: complete 50-section choose-your-own-adventure with authoring kit.

- [ ] **Step 1: Write failing contract test**

```ts
import { describe, expect, it } from 'vitest';
import {
    expectValidGallerySample, loadGallerySample, validateGallerySample,
    type GallerySampleContract,
} from '../../helpers/gallerySampleHarness';

const contract: GallerySampleContract = {
  slug: '09-adventure-gamebook',
  expectedTemplateIds: ['cover', 'start', 'workspace', 'section', 'ending', 'tracking', 'story_map', 'branch_planner', 'blank_section'],
  pageCount: [70, 90],
  palette: ['#3f3a33', '#7c5c3a', '#efe7d6'],
  requiredStableNodeIds: ['root', 'start_here', 'example_workspace', 'blank_workspace'],
};

const choiceDestinations = (sample: any, node: any): string[] => node.children
  .map((id: string) => sample.nodes[id])
  .filter((child: any) => child?.referenceId)
  .map((child: any) => child.referenceId);

describe('09-adventure-gamebook', () => {
  it('generates The Branching Road', () => {
    expectValidGallerySample(contract.slug, contract);
  });

  it('tells a fully reachable story with five endings and a loop', () => {
    const sample = expectValidGallerySample(contract.slug, contract);
    const sections = Object.values(sample.nodes).filter((n: any) =>
      !n.referenceId && (n.type === 'section' || n.type === 'ending'));
    expect(sections).toHaveLength(50);
    expect(sections.filter((n: any) => n.type === 'ending')).toHaveLength(5);

    const inbound = new Map<string, number>();
    const visited = new Set<string>();
    const queue = ['section_001'];
    while (queue.length) {
      const id = queue.shift()!;
      if (visited.has(id)) continue;
      visited.add(id);
      for (const dest of choiceDestinations(sample, sample.nodes[id])) {
        inbound.set(dest, (inbound.get(dest) ?? 0) + 1);
        queue.push(dest);
      }
    }
    expect(visited.size).toBe(50);
    sections.forEach((n: any) => {
      const choices = choiceDestinations(sample, n);
      if (n.type === 'ending') expect(choices).toHaveLength(0);
      else expect(choices.length).toBeGreaterThanOrEqual(1);
    });
    expect([...inbound.values()].some(count => count >= 2)).toBe(true);
  });

  it('supports a smaller authoring kit', () => {
    const sample = loadGallerySample(contract.slug, { blankSectionCount: 8 });
    expect(validateGallerySample(sample, { ...contract, pageCount: [58, 78] })).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `npm test -- --run tests/unit/gallerySamples/adventureGamebook.test.ts`
Expected: FAIL — product scripts do not exist.

- [ ] **Step 3: Implement templates**

Vintage-gamebook identity: ink `#3f3a33`, leather `#7c5c3a`, parchment `#efe7d6`; compass-rose / forking-path SVG on the cover; numbered-section masthead. Template names exactly: `Cover Plate`, `Start Here Guide`, `Authoring Hub`, `Adventure Section`, `Ending Page`, `Tracking Sheet`, `Story Map Sheet`, `Branch Planner Sheet`, `Blank Section Sheet`. The `section` template: section-number masthead (`{{title}}`), a large bound prose block (`{{prose}}`), and four choice chips — unfilled text chips bound to `{{choice_1_label}}`…`{{choice_4_label}}` with `child_index` links `0`–`3`. The `ending` template: distinct ending banner (bound `{{ending_kind}}` — "A good end" / "An ill end"), epilogue prose, and an always-labelled filled `specific_node` chip back to `start_here`. `tracking`: sections-visited checkbox grid (5×10, explicit borders) and an items-carried list. `story_map` / `branch_planner`: worksheet frames with writing lines (`lines-h` pattern); `blank_section`: numbered blank prose area plus four writable choice lines with a `p. ___` stub each — no links.

- [ ] **Step 4: Implement hierarchy and README**

`DEFAULT_CONFIG = { blankSectionCount: 20 }` (range 8–40). Author the complete story inline: 50 sections with stable IDs `section_001`…`section_050` (five of them typed `ending`), each non-ending section's `data.prose` a 60–120 word passage of an original, clearly fictional forest-road mystery, 1–4 choices as reference children (`type` matching the destination's template) with `choice_N_label` data (unused slots `''`). Include at least one honor-system item gate ("If you took the lantern …") and at least one section with two inbound routes. Page order: root → start_here → tracking → the 50 sections (flat children of a section hub or of start_here) → example_workspace (one worked `story_map` of the included adventure, EXAMPLE chrome) → blank_workspace (`workspace` template) with 2 story maps, 2 branch planners, and `CONFIG.blankSectionCount` blank sections. README: listing text (`# The Branching Road`, pitch, `## Why you'll like it`, `## Workflow`), configuration ranges, page inventory, navigation map, and `## Publishing` with tags `adventure, gamebook, interactive, story, game, fiction` and the six preview tabs from Task 1's shot table.

- [ ] **Step 5: Run product test**

Run: `npm test -- --run tests/unit/gallerySamples/adventureGamebook.test.ts`
Expected: PASS.

- [ ] **Step 6: Append slug to collection and run it**

Add `'09-adventure-gamebook'` to `EXPECTED_SLUGS` in `tests/unit/gallerySamples/collection.test.ts` (keep lexical order). Run: `npm test -- --run tests/unit/gallerySamples/collection.test.ts` — PASS.

- [ ] **Step 7: Render samples and spot-check PDF links**

With `npx vite --port 3002` running:

```bash
node scratch/render_expansion.mjs adventure-gamebook
node scratch/pdf_spot.cjs gallery-samples/09-adventure-gamebook/samples/adventure-gamebook.pdf page 4
```

Confirm six PNGs + PDF exist; the section-1 page's choice annotations land on the destination section pages the story defines (compare against `hierarchy.js`). Fix and re-render if not.

- [ ] **Step 8: Commit**

```bash
git add gallery-samples/09-adventure-gamebook tests/unit/gallerySamples/adventureGamebook.test.ts tests/unit/gallerySamples/collection.test.ts
git commit -m "feat: add The Branching Road adventure gamebook flagship"
```

---

### Task 3: Quiz Night (10-trivia-quiz-night)

**Files:**
- Create: `gallery-samples/10-trivia-quiz-night/{templates.js,hierarchy.js,README.md}`
- Create: `tests/unit/gallerySamples/triviaQuizNight.test.ts`
- Modify: `tests/unit/gallerySamples/collection.test.ts` (append slug)

**Interfaces:**
- Consumes: harness.
- Produces: 6-round × 10-question self-scoring quiz with pre-linked host kit.

- [ ] **Step 1: Write failing contract test**

```ts
const contract: GallerySampleContract = {
  slug: '10-trivia-quiz-night',
  expectedTemplateIds: ['cover', 'start', 'workspace', 'round', 'question', 'answer', 'scoreboard', 'grand_total'],
  pageCount: [165, 195],
  palette: ['#2e3438', '#b08d3f', '#f0ede4'],
  requiredStableNodeIds: ['root', 'start_here', 'example_workspace', 'blank_workspace'],
};

describe('10-trivia-quiz-night', () => {
  it('generates Quiz Night', () => {
    expectValidGallerySample(contract.slug, contract);
  });

  it('links every question to its answer and back, with real content', () => {
    const sample = expectValidGallerySample(contract.slug, contract);
    const authored = Object.values(sample.nodes).filter((n: any) =>
      !n.referenceId && n.type === 'question' && !isBlankBranch(sample, n));
    expect(authored).toHaveLength(60);
    authored.forEach((q: any) => {
      const answer = q.children.map((id: string) => sample.nodes[id]).find((c: any) => c?.type === 'answer' && !c.referenceId);
      expect(answer, `${q.id} answer child`).toBeTruthy();
      expect(String(q.data.question_text ?? '').length).toBeGreaterThan(10);
      expect(String(answer.data.answer_text ?? '').length).toBeGreaterThan(0);
    });
  });

  it('pre-links blank host-kit rounds', () => {
    const sample = loadGallerySample(contract.slug, { blankRoundCount: 0 });
    expect(validateGallerySample(sample, { ...contract, pageCount: [125, 150] })).toEqual([]);
  });
});
```

Where `isBlankBranch(sample, n)` walks `parentId` up and returns true when an ancestor is `blank_workspace`. Define it at the top of the test file:

```ts
const isBlankBranch = (sample: any, node: any): boolean => {
  let current = node;
  while (current) {
    if (current.id === 'blank_workspace') return true;
    current = current.parentId ? sample.nodes[current.parentId] : undefined;
  }
  return false;
};
```

- [ ] **Step 2: Run test to verify failure** — same command shape as Task 2, file `triviaQuizNight.test.ts`. Expected: FAIL.

- [ ] **Step 3: Implement templates**

Chalkboard identity: board `#2e3438`, brass `#b08d3f`, chalk paper `#f0ede4`; double-rule dividers, oversized round/question numerals, pint-glass + question-mark SVG motifs. Template names: `Quiz Cover`, `How To Host`, `Host Kit Hub`, `Round Hub`, `Question Card`, `Answer Card`, `Score Sheet`, `Grand Total Sheet`. `question`: round/number masthead, big bound `{{question_text}}`, answer-writing lines, unfilled `Reveal »` chip (`child_index` 0 — the answer node is the question's first real child). `answer`: bound `{{answer_text}}` large, `{{fun_fact}}` line, `Next question »` unfilled chip bound `{{next_label}}` (`child_index` 0 — the answer node's own child is a reference to the next question; `''` bound label and no child on each round's last answer) and an always-labelled `Back to round` chip (`ancestor` 2). `round`: ten question rows (bound titles, `child_index` 0–9) with per-team score boxes. `scoreboard`: 6 rounds × 6 team columns with explicit all-cell borders; `grand_total`: totals + winner box.

- [ ] **Step 4: Implement hierarchy and README**

`DEFAULT_CONFIG = { blankRoundCount: 2 }` (range 0–4). Author six themed rounds (General Knowledge, Science & Nature, History, Geography, Arts, Wildcard) × 10 questions: evergreen, verifiable facts (capital cities, chemical symbols, classic literature, landmark dates); each answer node carries `answer_text` + `fun_fact`. Structure: start_here → rounds (each round's children = its 10 questions; each question's only child = its answer; each answer's only child = a reference to the next question, omitted on the round's last answer) → scoreboard ×2 → grand_total → example_workspace (one worked specimen Q&A pair under an example hub, EXAMPLE chrome) → blank_workspace hub with `CONFIG.blankRoundCount` blank rounds (round + 10 question + 10 answer nodes with `''` content but identical linking, so a handwritten quiz navigates for free). README listing (`# Quiz Night`), config, inventory, nav map, `## Publishing`: tags `trivia, quiz, party, games, pub-quiz, questions`, six preview tabs per Task 1.

- [ ] **Steps 5–8: Test, collection append, render, commit** — identical shape to Task 2: product test PASS; append `'10-trivia-quiz-night'`; `node scratch/render_expansion.mjs trivia-quiz-night` + `pdf_spot.cjs` on a question page (Reveal annotation lands on that question's answer page); commit `feat: add Quiz Night trivia flagship` with files `gallery-samples/10-trivia-quiz-night tests/unit/gallerySamples/triviaQuizNight.test.ts tests/unit/gallerySamples/collection.test.ts`.

---

### Task 4: Opening Atlas (11-chess-opening-repertoire)

**Files:**
- Create: `gallery-samples/11-chess-opening-repertoire/{templates.js,hierarchy.js,README.md}`
- Create: `tests/unit/gallerySamples/chessOpeningRepertoire.test.ts`
- Modify: `tests/unit/gallerySamples/collection.test.ts` (append slug)

**Interfaces:**
- Consumes: harness.
- Produces: navigable chess move tree with 64-cell bound board diagrams and reference-node transpositions.

- [ ] **Step 1: Write failing contract test**

```ts
const contract: GallerySampleContract = {
  slug: '11-chess-opening-repertoire',
  expectedTemplateIds: ['cover', 'start', 'workspace', 'repertoire', 'chapter', 'position', 'worksheet', 'study_log'],
  pageCount: [52, 74],
  palette: ['#2b3542', '#a08248', '#edf0f4'],
  requiredStableNodeIds: ['root', 'start_here', 'example_workspace', 'blank_workspace'],
};

const FILES = ['a','b','c','d','e','f','g','h'];
const SQUARES = FILES.flatMap(f => [1,2,3,4,5,6,7,8].map(r => `${f}${r}`));

describe('11-chess-opening-repertoire', () => {
  it('generates Opening Atlas', () => {
    expectValidGallerySample(contract.slug, contract);
  });

  it('binds a full 64-square board and keeps every position chess-legal at the king level', () => {
    const sample = expectValidGallerySample(contract.slug, contract);
    const positionTemplate = sample.templates.position;
    SQUARES.forEach(square => {
      expect(positionTemplate.elements.some((e: any) => e.dataBinding === square || (e.text ?? '').includes(`{{${square}}}`)),
        `board cell ${square}`).toBe(true);
    });
    const positions = Object.values(sample.nodes).filter((n: any) => n.type === 'position' && !n.referenceId);
    expect(positions.length).toBeGreaterThanOrEqual(36);
    positions.filter((n: any) => !isBlankBranch(sample, n)).forEach((position: any) => {
      const pieces = SQUARES.map(square => position.data[square] ?? '');
      expect(pieces.filter(p => p === 'K'), `${position.id} white king`).toHaveLength(1);
      expect(pieces.filter(p => p === 'k'), `${position.id} black king`).toHaveLength(1);
    });
  });

  it('uses reference nodes for transpositions', () => {
    const sample = expectValidGallerySample(contract.slug, contract);
    const refs = Object.values(sample.nodes).filter((n: any) => n.referenceId && n.type === 'position');
    expect(refs.length).toBeGreaterThanOrEqual(1);
  });

  it('supports fewer worksheets', () => {
    const sample = loadGallerySample(contract.slug, { worksheetCount: 4, studyLogCount: 2 });
    expect(validateGallerySample(sample, { ...contract, pageCount: [44, 66] })).toEqual([]);
  });
});
```

- [ ] **Step 2: Run to verify failure** — `chessOpeningRepertoire.test.ts`. Expected: FAIL.

- [ ] **Step 3: Implement templates**

Chess-book identity: slate `#2b3542`, brass `#a08248`, cool ivory `#edf0f4`; rule-framed diagrams, serif-feel file/rank labels. Template names: `Atlas Cover`, `How To Study`, `Practice Hub`, `Repertoire Hub`, `Chapter Opener`, `Position Page`, `Line Worksheet`, `Study Log Sheet`. The board: one static SVG checkerboard (8×8 alternating light/dark squares sized ~40pt) plus **64 small text elements** overlaid, each bound to its square name (`{{a1}}`…`{{h8}}`), file letters a–h and rank numbers 1–8 along the edges. Pieces are letters: uppercase White (`K Q R B N P`), lowercase black; empty squares bind `''`. Below the board: bound move list (`{{move_list}}`), up to three candidate-move unfilled chips (`{{candidate_1_label}}`–`{{candidate_3_label}}`, `child_index` 0–2), annotation lines, and a small eval box. `worksheet`: the same 64-cell board with all cells `''` (writable), blank move list and annotation space. `chapter`: chapter title, plan summary, first-position chip (`child_index` 0). `repertoire`: chapter rows (`child_index`).

- [ ] **Step 4: Implement hierarchy and README**

`DEFAULT_CONFIG = { worksheetCount: 8, studyLogCount: 4 }` (ranges 4–16, 2–8). Author four chapters — Italian Game and Queen's Gambit under the White hub, Sicilian Defence and French Defence under the Black hub — with 9–10 positions each (≥36 total), each position's `data` carrying the 64 square fields, `move_list` in SAN (`1. e4 e5 2. Nf3 Nc6 3. Bc4`), and candidate labels. Every position's children: real child positions for each candidate move, or a **reference node** to an existing position for a transposition (at least one genuine transposition, e.g. a Queen's Gambit move-order arriving at the same structure). Board states must follow legally from the move list — the reviewer replays each line. Example branch: one fully annotated worked position (EXAMPLE chrome). Blank workspace: `CONFIG.worksheetCount` worksheets + `CONFIG.studyLogCount` study logs. README listing (`# Opening Atlas`), legend (uppercase = White), config, inventory, nav map, `## Publishing`: tags `chess, openings, repertoire, strategy, study, games`, six preview tabs.

- [ ] **Steps 5–8: Test, collection append, render, commit** — as Task 2: append `'11-chess-opening-repertoire'`; render slug `chess-opening-repertoire`; `pdf_spot.cjs` a mid-line position page (candidate annotations land on the child/transposition pages); commit `feat: add Opening Atlas chess repertoire flagship`.

---

### Task 5: Roots & Branches (12-family-history-workbook)

**Files:**
- Create: `gallery-samples/12-family-history-workbook/{templates.js,hierarchy.js,README.md}`
- Create: `tests/unit/gallerySamples/familyHistoryWorkbook.test.ts`
- Modify: `tests/unit/gallerySamples/collection.test.ts` (append slug)

**Interfaces:**
- Consumes: harness.
- Produces: tappable 4-generation pedigree chart over person pages with kin cross-links.

- [ ] **Step 1: Write failing contract test**

```ts
const contract: GallerySampleContract = {
  slug: '12-family-history-workbook',
  expectedTemplateIds: ['cover', 'start', 'workspace', 'chart', 'person', 'group_sheet', 'prompts', 'photo_log', 'research_log', 'sources'],
  pageCount: [42, 60],
  palette: ['#53455c', '#9c8354', '#f1eae0'],
  requiredStableNodeIds: ['root', 'start_here', 'example_workspace', 'blank_workspace'],
};

describe('12-family-history-workbook', () => {
  it('generates Roots & Branches', () => {
    expectValidGallerySample(contract.slug, contract);
  });

  it('links all fifteen pedigree boxes to distinct person pages with kin links', () => {
    const sample = expectValidGallerySample(contract.slug, contract);
    const chart = sample.nodes.pedigree_chart;
    expect(chart.children).toHaveLength(15);
    const personIds = new Set(chart.children);
    expect(personIds.size).toBe(15);
    chart.children.forEach((id: string) => {
      const person = sample.nodes[id];
      expect(person.type).toBe('person');
      person.children.forEach((childId: string) => {
        const kin = sample.nodes[childId];
        expect(kin.referenceId, `${id} kin ${childId}`).toBeTruthy();
        expect(sample.nodes[kin.referenceId].type).toBe('person');
      });
    });
  });

  it('supports a smaller workbook', () => {
    const sample = loadGallerySample(contract.slug, { sparePersonCount: 4, promptPageCount: 2 });
    expect(validateGallerySample(sample, { ...contract, pageCount: [32, 50] })).toEqual([]);
  });
});
```

- [ ] **Step 2: Run to verify failure** — `familyHistoryWorkbook.test.ts`. Expected: FAIL.

- [ ] **Step 3: Implement templates**

Heirloom-ledger identity: plum-gray `#53455c`, faded gold `#9c8354`, parchment `#f1eae0`; engraved-certificate double frames, ornamental branch SVG. Template names: `Workbook Cover`, `How To Begin`, `Tree Hub`, `Pedigree Chart`, `Person Page`, `Family Group Sheet`, `Story Prompts`, `Photo Ledger`, `Research Ledger`, `Source Index`. `chart`: 15 name boxes laid out as a 4-generation pedigree (1 self, 2 parents, 4 grandparents, 8 great-grandparents), each an unfilled chip bound `{{box_1_label}}`…`{{box_15_label}}` with `child_index` 0–14, connected by thin line SVG. `person`: vitals rows (born / married / died / places), a five-row timeline, kin chips (bound `{{kin_1_label}}`…`{{kin_6_label}}`, `child_index` 0–5, `''` when absent), and an always-labelled `Chart` chip (`specific_node → pedigree_chart`). `group_sheet`: couple header + eight-child table with explicit borders. `prompts`: interview questions with writing space; ledgers/sources: labeled row tables.

- [ ] **Step 4: Implement hierarchy and README**

`DEFAULT_CONFIG = { sparePersonCount: 8, promptPageCount: 6 }` (ranges 4–16, 2–12). Stable id `pedigree_chart`; its 15 children are blank person nodes (box labels "Self", "Father", "Mother", "Grandfather (paternal)"…), each person's children = reference nodes to their chart-relative kin (father, mother; self also spouse-slot and the chart) with matching `kin_N_label` data, unused slots `''`. Example branch: 3 person pages filled for a clearly fictional family (the Hartwell-Reyes family, invented dates pre-1950, EXAMPLE chrome). Blank workspace: `CONFIG.sparePersonCount` spare persons (reachable from a spare-person index rows on the hub), 4 group sheets, `CONFIG.promptPageCount` prompt pages, photo ledger ×4, research ledger ×4, sources ×2. README listing (`# Roots & Branches`), config, inventory, nav map, `## Publishing`: tags `genealogy, family, history, ancestry, tree, heritage`, six preview tabs.

- [ ] **Steps 5–8: Test, collection append, render, commit** — as Task 2: append `'12-family-history-workbook'`; render slug `family-history-workbook`; `pdf_spot.cjs` the chart page (box annotations land on person pages); commit `feat: add Roots & Branches family history flagship`.

---

### Task 6: Lexicon Lab (13-language-learning-lab)

**Files:**
- Create: `gallery-samples/13-language-learning-lab/{templates.js,hierarchy.js,README.md}`
- Create: `tests/unit/gallerySamples/languageLearningLab.test.ts`
- Modify: `tests/unit/gallerySamples/collection.test.ts` (append slug)

**Interfaces:**
- Consumes: harness.
- Produces: language-agnostic flashcard decks with pre-linked reveal navigation.

- [ ] **Step 1: Write failing contract test**

```ts
const contract: GallerySampleContract = {
  slug: '13-language-learning-lab',
  expectedTemplateIds: ['cover', 'start', 'workspace', 'deck', 'card_front', 'card_back', 'grammar', 'drill', 'journal', 'progress'],
  pageCount: [120, 155],
  palette: ['#2f5d5a', '#b3703f', '#eef0ea'],
  requiredStableNodeIds: ['root', 'start_here', 'example_workspace', 'blank_workspace'],
};

describe('13-language-learning-lab', () => {
  it('generates Lexicon Lab', () => {
    expectValidGallerySample(contract.slug, contract);
  });

  it('pairs every card front with its back', () => {
    const sample = expectValidGallerySample(contract.slug, contract);
    const fronts = Object.values(sample.nodes).filter((n: any) => n.type === 'card_front' && !n.referenceId);
    expect(fronts.length).toBeGreaterThanOrEqual(56);
    fronts.forEach((front: any) => {
      const back = front.children.map((id: string) => sample.nodes[id]).find((c: any) => c?.type === 'card_back' && !c.referenceId);
      expect(back, `${front.id} back`).toBeTruthy();
    });
  });

  it('supports the minimum lab', () => {
    const sample = loadGallerySample(contract.slug, { deckCount: 2, cardsPerDeck: 8, journalPageCount: 4 });
    expect(validateGallerySample(sample, { ...contract, pageCount: [55, 85] })).toEqual([]);
  });
});
```

- [ ] **Step 2: Run to verify failure** — `languageLearningLab.test.ts`. Expected: FAIL.

- [ ] **Step 3: Implement templates**

Lab-notebook identity: teal `#2f5d5a`, amber tag `#b3703f`, mist `#eef0ea`; specimen-card frames, fine grid rules, flask/tag SVG. Template names: `Lab Cover`, `Study Guide`, `Lab Hub`, `Deck Hub`, `Card Front`, `Card Back`, `Grammar Sheet`, `Drill Sheet`, `Conversation Log`, `Progress Board`. `card_front`: the word huge and centered (bound `{{word}}`, writable when blank), pronunciation line, unfilled `Reveal »` chip (`child_index` 0). `card_back`: bound `{{meaning}}`, `{{example_sentence}}`, note lines, `Next card »` unfilled chip (`child_index` 0 — the back node's own child is a reference to the next card front; `''` label and no child on the deck's last card) + always-labelled `Deck` chip (`ancestor` 2). `deck`: card-row grid (explicit borders) + review-schedule strip (Day 1/3/7/14/30 checkboxes). `drill`: pattern table; `grammar`: rule + examples table; `journal`: dated lines; `progress`: deck × schedule matrix.

- [ ] **Step 4: Implement hierarchy and README**

`DEFAULT_CONFIG = { deckCount: 4, cardsPerDeck: 12, journalPageCount: 8 }` (ranges 2–6, 8–16, 4–16). Blank decks: each deck node's children = `cardsPerDeck` card_front nodes; each front's only child = its card_back; each back's only child = a reference to the next front (omitted on the deck's last card); all word/meaning fields `''`. Example branch: one demo deck of 8 filled Spanish everyday-word cards (hola, gracias, agua, casa, comer, libro, tiempo, amigo — accurate meanings and example sentences, EXAMPLE chrome). Also 6 grammar sheets, 4 drill sheets, `CONFIG.journalPageCount` journal pages, 1 progress board. README listing (`# Lexicon Lab`, explicitly language-agnostic), config, inventory, nav map, `## Publishing`: tags `language, vocabulary, flashcards, study, learning, grammar`, six preview tabs.

- [ ] **Steps 5–8: Test, collection append, render, commit** — as Task 2: append `'13-language-learning-lab'`; render slug `language-learning-lab`; `pdf_spot.cjs` a card front (Reveal lands on its back); commit `feat: add Lexicon Lab language flagship`.

---

### Task 7: Offer Track (14-job-search-hq)

**Files:**
- Create: `gallery-samples/14-job-search-hq/{templates.js,hierarchy.js,README.md}`
- Create: `tests/unit/gallerySamples/jobSearchHq.test.ts`
- Modify: `tests/unit/gallerySamples/collection.test.ts` (append slug)

**Interfaces:**
- Consumes: harness.
- Produces: pipeline dashboard over company dossiers with prep bank and offer comparison.

- [ ] **Step 1: Write failing contract test**

```ts
const contract: GallerySampleContract = {
  slug: '14-job-search-hq',
  expectedTemplateIds: ['cover', 'start', 'workspace', 'pipeline', 'dossier', 'star_story', 'question_bank', 'ask_bank', 'contacts', 'comparison', 'weekly_review'],
  pageCount: [32, 48],
  palette: ['#23364c', '#7d9ab5', '#f0f2f5'],
  requiredStableNodeIds: ['root', 'start_here', 'example_workspace', 'blank_workspace'],
};

describe('14-job-search-hq', () => {
  it('generates Offer Track', () => {
    expectValidGallerySample(contract.slug, contract);
  });

  it('routes every dossier through the pipeline and prep bank', () => {
    const sample = expectValidGallerySample(contract.slug, contract);
    const pipeline = sample.nodes.pipeline_board;
    const dossiers = Object.values(sample.nodes).filter((n: any) => n.type === 'dossier' && !n.referenceId);
    expect(dossiers.length).toBeGreaterThanOrEqual(10);
    const pipelineDestinations = pipeline.children.map((id: string) => sample.nodes[id])
      .map((c: any) => c.referenceId ?? c.id);
    dossiers.filter((d: any) => !isExampleBranch(sample, d)).forEach((d: any) => {
      expect(pipelineDestinations, `${d.id} on pipeline`).toContain(d.id);
    });
  });

  it('supports a lean search', () => {
    const sample = loadGallerySample(contract.slug, { dossierCount: 4, reviewWeeks: 4 });
    expect(validateGallerySample(sample, { ...contract, pageCount: [22, 36] })).toEqual([]);
  });
});
```

With `isExampleBranch` defined like Task 3's `isBlankBranch` but checking for ancestor `example_workspace`.

- [ ] **Step 2: Run to verify failure** — `jobSearchHq.test.ts`. Expected: FAIL.

- [ ] **Step 3: Implement templates**

Corporate-minimal identity: navy `#23364c`, steel `#7d9ab5`, paper `#f0f2f5`; strong tabular chrome, stage chips. Template names: `Tracker Cover`, `Field Guide`, `Search Hub`, `Pipeline Board`, `Company Dossier`, `Star Story Sheet`, `Question Bank`, `Ask Bank`, `Contact Ledger`, `Offer Comparison`, `Weekly Review Sheet`. `pipeline`: five labelled stage bands (Wishlist / Applied / Interviewing / Offer / Closed), dossier chips (bound `{{slot_N_label}}`, `child_index`, `''` for empty slots) distributed across bands with a writable stage-marker column. `dossier`: role/company header, source + salary rows, five-step status timeline (checkbox chain), next-action box, contact rows, always-labelled chips to `question_bank`/`ask_bank` hubs (`specific_node` to stable ids `prep_questions`, `prep_asks`). `comparison`: four offer columns × rows (base, bonus, equity, benefits, growth, gut) with explicit borders. `weekly_review`: wins / follow-ups / next week.

- [ ] **Step 4: Implement hierarchy and README**

`DEFAULT_CONFIG = { dossierCount: 10, reviewWeeks: 8 }` (ranges 4–16, 4–16). Stable ids `pipeline_board`, `prep_questions`, `prep_asks`. Pipeline children = reference nodes to every blank dossier (so the board enumerates them); blank dossiers live under the hub. Prep bank: 6 STAR sheets, question bank ×2, ask bank ×1; contacts ×4; comparison ×1; `CONFIG.reviewWeeks` weekly reviews chained with sibling prev/next (`''` at the ends). Example branch: one dossier filled for the fictional "Meridian Data Co." plus one worked STAR story (EXAMPLE chrome). README listing (`# Offer Track`), config, inventory, nav map, `## Publishing`: tags `job-search, career, interviews, planner, tracker, work`, six preview tabs.

- [ ] **Steps 5–8: Test, collection append, render, commit** — as Task 2: append `'14-job-search-hq'`; render slug `job-search-hq`; `pdf_spot.cjs` the pipeline page (slot annotations land on dossiers); commit `feat: add Offer Track job search flagship`.

---

### Task 8: The Grower's Year (15-garden-almanac)

**Files:**
- Create: `gallery-samples/15-garden-almanac/{templates.js,hierarchy.js,README.md}`
- Create: `tests/unit/gallerySamples/gardenAlmanac.test.ts`
- Modify: `tests/unit/gallerySamples/collection.test.ts` (append slug)

**Interfaces:**
- Consumes: harness.
- Produces: month-to-plant-card linked garden almanac with accurate horticulture.

- [ ] **Step 1: Write failing contract test**

```ts
const contract: GallerySampleContract = {
  slug: '15-garden-almanac',
  expectedTemplateIds: ['cover', 'start', 'workspace', 'bed_map', 'month', 'plant_card', 'plant_index', 'harvest_log', 'pest_log', 'year_review'],
  pageCount: [30, 50],
  palette: ['#3d5c45', '#97622f', '#f0eee0'],
  requiredStableNodeIds: ['root', 'start_here', 'example_workspace', 'blank_workspace'],
};

describe('15-garden-almanac', () => {
  it('generates The Grower\'s Year', () => {
    expectValidGallerySample(contract.slug, contract);
  });

  it('links month rows to plant cards and indexes every card', () => {
    const sample = expectValidGallerySample(contract.slug, contract);
    const months = Object.values(sample.nodes).filter((n: any) => n.type === 'month' && !n.referenceId);
    expect(months.filter((m: any) => !isExampleBranch(sample, m))).toHaveLength(12);
    const cards = Object.values(sample.nodes).filter((n: any) => n.type === 'plant_card' && !n.referenceId && !isExampleBranch(sample, n));
    expect(cards).toHaveLength(16);
    months.forEach((month: any) => {
      month.children.forEach((childId: string) => {
        const ref = sample.nodes[childId];
        expect(ref.referenceId, `${month.id} row ${childId}`).toBeTruthy();
        expect(sample.nodes[ref.referenceId].type).toBe('plant_card');
      });
    });
    const index = sample.nodes.plant_index;
    const indexed = index.children.map((id: string) => sample.nodes[id]).map((c: any) => c.referenceId ?? c.id);
    cards.forEach((card: any) => expect(indexed, `${card.id} indexed`).toContain(card.id));
  });

  it('supports a compact garden', () => {
    const sample = loadGallerySample(contract.slug, { bedCount: 2, harvestLogCount: 2 });
    expect(validateGallerySample(sample, { ...contract, pageCount: [26, 46] })).toEqual([]);
  });
});
```

(Reuse the `isExampleBranch` helper shape from Task 7.)

- [ ] **Step 2: Run to verify failure** — `gardenAlmanac.test.ts`. Expected: FAIL.

- [ ] **Step 3: Implement templates**

Botanical-almanac identity: leaf `#3d5c45`, terracotta `#97622f`, cream `#f0eee0`; engraved month headers, leaf/seed SVG motifs. Template names: `Almanac Cover`, `Growing Guide`, `Garden Hub`, `Bed Map`, `Month Spread`, `Plant Card`, `Plant Index`, `Harvest Ledger`, `Pest Ledger`, `Year Review Sheet`. `month`: month masthead, task lines, and eight sow/plant/harvest rows — each an unfilled chip pair (bound `{{row_N_label}}` + action tag `{{row_N_kind}}`, `child_index` 0–7, `''` for unused rows). `plant_card`: name + variety line, spec table (sow depth, spacing, sun, days to maturity, companions — explicit borders), notes lines, always-labelled `Index` chip (`specific_node → plant_index`). `bed_map`: labeled plot grid (dots pattern). `plant_index`: A–Z card rows (`child_index`).

- [ ] **Step 4: Implement hierarchy and README**

`DEFAULT_CONFIG = { bedCount: 4, harvestLogCount: 4 }` (ranges 2–8, 2–12). Author 16 plant cards with accurate, evergreen, northern-temperate horticulture (tomato, basil, carrot, lettuce, garlic, potato, courgette, runner bean, beetroot, kale, onion, pea, radish, spinach, strawberry, rosemary) — the Start Here page states the northern-temperate framing. Each of the 12 month nodes gets reference children to the cards genuinely relevant that month (garlic sown autumn, tomatoes started under cover in early spring, etc. — reviewer checks). `plant_index` children = references to all 16 cards. Example branch: March filled (tasks + rows) plus 2 filled-notes plant cards (EXAMPLE chrome — example copies, not the shared cards). Blank workspace: beds, harvest/pest ledgers, year review. README listing (`# The Grower's Year`), config, inventory, nav map, `## Publishing`: tags `garden, planting, almanac, vegetables, planner, seasonal`, six preview tabs.

- [ ] **Steps 5–8: Test, collection append, render, commit** — as Task 2: append `'15-garden-almanac'`; render slug `garden-almanac`; `pdf_spot.cjs` a month page (row annotations land on plant cards); commit `feat: add The Grower's Year garden flagship`.

---

### Task 9: The Reading Room (16-reading-journal)

**Files:**
- Create: `gallery-samples/16-reading-journal/{templates.js,hierarchy.js,README.md}`
- Create: `tests/unit/gallerySamples/readingJournal.test.ts`
- Modify: `tests/unit/gallerySamples/collection.test.ts` (append slug)

**Interfaces:**
- Consumes: harness.
- Produces: tappable bookshelf over book pages with quote vault and annual wrap-up.

- [ ] **Step 1: Write failing contract test**

```ts
const contract: GallerySampleContract = {
  slug: '16-reading-journal',
  expectedTemplateIds: ['cover', 'start', 'workspace', 'shelf', 'book', 'quote_page', 'series', 'tbr', 'wrap_up'],
  pageCount: [46, 66],
  palette: ['#533b33', '#37564e', '#f3ecdf'],
  requiredStableNodeIds: ['root', 'start_here', 'example_workspace', 'blank_workspace'],
};

describe('16-reading-journal', () => {
  it('generates The Reading Room', () => {
    expectValidGallerySample(contract.slug, contract);
  });

  it('shelves every book with working spine links', () => {
    const sample = expectValidGallerySample(contract.slug, contract);
    const shelves = Object.values(sample.nodes).filter((n: any) => n.type === 'shelf' && !n.referenceId);
    const books = Object.values(sample.nodes).filter((n: any) => n.type === 'book' && !n.referenceId && !isExampleBranch(sample, n));
    expect(books).toHaveLength(24);
    const shelved = shelves.flatMap((s: any) => s.children.map((id: string) => sample.nodes[id]))
      .map((c: any) => c.referenceId ?? c.id);
    books.forEach((b: any) => expect(shelved, `${b.id} shelved`).toContain(b.id));
  });

  it('supports a smaller library', () => {
    const sample = loadGallerySample(contract.slug, { bookCount: 12, quotePageCount: 8 });
    expect(validateGallerySample(sample, { ...contract, pageCount: [26, 46] })).toEqual([]);
  });
});
```

- [ ] **Step 2: Run to verify failure** — `readingJournal.test.ts`. Expected: FAIL.

- [ ] **Step 3: Implement templates**

Ex-libris identity: leather `#533b33`, lamp green `#37564e`, page `#f3ecdf`; bookplate frames, spine-grid shelf SVG. Template names: `Room Cover`, `Reader Guide`, `Library Hub`, `Bookshelf`, `Book Page`, `Quote Leaf`, `Series Ledger`, `TBR List`, `Wrap Up Sheet`. `shelf`: twelve spine chips per shelf page (tall narrow unfilled chips, bound `{{spine_1_label}}`…`{{spine_12_label}}`, `child_index` 0–11, `''` beyond the book count) over a shelf-board SVG. `book`: title/author header, started/finished dates, five rating dots (circles), format chips, review lines, favorite-quote slot, `Shelf` chip (`parent`). `quote_page`: two framed quote blocks with source lines. `wrap_up`: month-by-month totals grid (explicit borders), top-five rows, DNF list.

- [ ] **Step 4: Implement hierarchy and README**

`DEFAULT_CONFIG = { bookCount: 24, quotePageCount: 16 }` (ranges 12–36, 8–24). Two shelf pages of 12, each shelf's children = its 12 blank book nodes (spine labels "Slot 1"… until written — bind titles so a renamed node updates its spine). Example branch: one book page filled for a public-domain classic (*Jane Eyre*, real author/era, invented reading dates) + one quote leaf (EXAMPLE chrome). Blank workspace: quote vault, 4 series ledgers, 2 TBR lists, 2 wrap-up sheets. README listing (`# The Reading Room`), config, inventory, nav map, `## Publishing`: tags `reading, books, journal, library, quotes, tracker`, six preview tabs.

- [ ] **Steps 5–8: Test, collection append, render, commit** — as Task 2: append `'16-reading-journal'`; render slug `reading-journal`; `pdf_spot.cjs` a shelf page (spine annotations land on book pages); commit `feat: add The Reading Room reading journal flagship`.

---

### Task 10: The House Book (17-home-owners-manual)

**Files:**
- Create: `gallery-samples/17-home-owners-manual/{templates.js,hierarchy.js,README.md}`
- Create: `tests/unit/gallerySamples/homeOwnersManual.test.ts`
- Modify: `tests/unit/gallerySamples/collection.test.ts` (append slug)

**Interfaces:**
- Consumes: harness.
- Produces: rooms/systems dashboard, appliance cards, seasonal maintenance chain.

- [ ] **Step 1: Write failing contract test**

```ts
const contract: GallerySampleContract = {
  slug: '17-home-owners-manual',
  expectedTemplateIds: ['cover', 'start', 'workspace', 'dashboard', 'room', 'system', 'appliance', 'seasonal', 'repair_log', 'contacts'],
  pageCount: [36, 54],
  palette: ['#2e4a66', '#8a9aa8', '#eef3f7'],
  requiredStableNodeIds: ['root', 'start_here', 'example_workspace', 'blank_workspace'],
};

describe('17-home-owners-manual', () => {
  it('generates The House Book', () => {
    expectValidGallerySample(contract.slug, contract);
  });

  it('links every appliance from exactly one room and chains the seasons', () => {
    const sample = expectValidGallerySample(contract.slug, contract);
    const rooms = Object.values(sample.nodes).filter((n: any) => n.type === 'room' && !n.referenceId && !isExampleBranch(sample, n));
    const appliances = Object.values(sample.nodes).filter((n: any) => n.type === 'appliance' && !n.referenceId && !isExampleBranch(sample, n));
    expect(rooms).toHaveLength(8);
    expect(appliances).toHaveLength(12);
    appliances.forEach((a: any) => {
      expect(sample.nodes[a.parentId]?.type, `${a.id} parent room`).toBe('room');
    });
    const seasons = Object.values(sample.nodes).filter((n: any) => n.type === 'seasonal' && !n.referenceId);
    expect(seasons).toHaveLength(4);
  });

  it('supports a small home', () => {
    const sample = loadGallerySample(contract.slug, { roomCount: 4, applianceCount: 6 });
    expect(validateGallerySample(sample, { ...contract, pageCount: [24, 42] })).toEqual([]);
  });
});
```

- [ ] **Step 2: Run to verify failure** — `homeOwnersManual.test.ts`. Expected: FAIL.

- [ ] **Step 3: Implement templates**

Blueprint identity: blueprint blue `#2e4a66`, graphite mist `#8a9aa8`, drafting paper `#eef3f7`; stencil headers, dashed rules, isometric house SVG. Template names: `Manual Cover`, `Owner Guide`, `House Hub`, `Home Dashboard`, `Room Page`, `System Page`, `Appliance Card`, `Season Checklist`, `Repair Ledger`, `Contractor List`. `dashboard`: rooms band + systems band of unfilled chips (`child_index`, bound labels). `room`: paint/finish rows, measurements box, fixture lines, four appliance chips (bound labels, `child_index` 0–3, `''` unused — appliances are the room's real children). `system`: shutoff-location callout box, spec rows (filter size, breaker map lines), inspection checkboxes. `appliance`: make/model/serial/purchased/warranty table (explicit borders), manual-location line, service-history rows, always-labelled `Room` chip (`parent`). `seasonal`: checklist with season masthead and `Next season »` sibling chip (bound label, `''` on winter).

- [ ] **Step 4: Implement hierarchy and README**

`DEFAULT_CONFIG = { roomCount: 8, applianceCount: 6 * 2 }` — write it literally as `{ roomCount: 8, applianceCount: 12 }` (ranges 4–12, 6–20). Dashboard children = references to rooms and systems. Each appliance node is a real child of exactly one room (distribute the 12 across the 8 rooms, at most 4 per room — the test enforces the parent type), so page order reads room, its appliances, next room. Five systems fixed (HVAC, Plumbing, Electrical, Roof & Exterior, Safety). Four seasonal checklists as siblings in order spring, summer, autumn, winter. Example branch: one filled room + one filled appliance card (fictional "Kestrel KD-40 dishwasher", EXAMPLE chrome). Blank workspace: repair ledger ×6, contractor list ×2. README listing (`# The House Book`), config, inventory, nav map, `## Publishing`: tags `home, house, maintenance, appliances, manual, organization`, six preview tabs.

- [ ] **Steps 5–8: Test, collection append, render, commit** — as Task 2: append `'17-home-owners-manual'`; render slug `home-owners-manual`; `pdf_spot.cjs` the dashboard (chips land on rooms/systems); commit `feat: add The House Book home manual flagship`.

---

### Task 11: The Woodshed (18-music-practice-studio)

**Files:**
- Create: `gallery-samples/18-music-practice-studio/{templates.js,hierarchy.js,README.md}`
- Create: `tests/unit/gallerySamples/musicPracticeStudio.test.ts`
- Modify: `tests/unit/gallerySamples/collection.test.ts` (append slug)

**Interfaces:**
- Consumes: harness.
- Produces: repertoire-to-session linked practice studio with manuscript tools.

- [ ] **Step 1: Write failing contract test**

```ts
const contract: GallerySampleContract = {
  slug: '18-music-practice-studio',
  expectedTemplateIds: ['cover', 'start', 'workspace', 'rack', 'piece', 'session', 'staff_paper', 'chord_sheet', 'technique', 'gig', 'streak'],
  pageCount: [50, 72],
  palette: ['#21262b', '#ad8433', '#f1ede2'],
  requiredStableNodeIds: ['root', 'start_here', 'example_workspace', 'blank_workspace'],
};

describe('18-music-practice-studio', () => {
  it('generates The Woodshed', () => {
    expectValidGallerySample(contract.slug, contract);
  });

  it('racks every piece and chains the session logs', () => {
    const sample = expectValidGallerySample(contract.slug, contract);
    const rack = sample.nodes.repertoire_rack;
    const pieces = Object.values(sample.nodes).filter((n: any) => n.type === 'piece' && !n.referenceId && !isExampleBranch(sample, n));
    expect(pieces).toHaveLength(12);
    const racked = rack.children.map((id: string) => sample.nodes[id]).map((c: any) => c.referenceId ?? c.id);
    pieces.forEach((p: any) => expect(racked, `${p.id} racked`).toContain(p.id));
    const sessions = Object.values(sample.nodes).filter((n: any) => n.type === 'session' && !n.referenceId && !isExampleBranch(sample, n));
    expect(sessions).toHaveLength(24);
  });

  it('supports a lighter studio', () => {
    const sample = loadGallerySample(contract.slug, { pieceCount: 6, sessionCount: 12 });
    expect(validateGallerySample(sample, { ...contract, pageCount: [32, 54] })).toEqual([]);
  });
});
```

- [ ] **Step 2: Run to verify failure** — `musicPracticeStudio.test.ts`. Expected: FAIL.

- [ ] **Step 3: Implement templates**

Jazz-poster identity: club black `#21262b`, brass `#ad8433`, warm paper `#f1ede2`; big display type, halftone-dot SVG. Template names: `Shed Cover`, `Player Guide`, `Studio Hub`, `Repertoire Rack`, `Piece Page`, `Session Log`, `Staff Paper`, `Chord Sheet`, `Technique Ladder`, `Gig Planner`, `Streak Board`. `piece`: title/composer header, key + tempo boxes, section map rows, trouble-spots table (explicit borders), practice-count tally row. `session`: date/goal header, metronome ladder (eight bpm step boxes), focus checkboxes, what-broke / what-clicked lines, `Next session »` / `« Previous` unfilled sibling chips (bound labels, `''` at ends). `staff_paper`: ten 5-line staves built from tight `lines-h` pattern groups. `chord_sheet`: sixteen chord-box SVG grids (4 fret × 4 string frames) with name lines. `streak`: month dot grid.

- [ ] **Step 4: Implement hierarchy and README**

`DEFAULT_CONFIG = { pieceCount: 12, sessionCount: 24 }` (ranges 6–18, 12–48). Stable id `repertoire_rack`; rack children = references to all pieces. Pieces and sessions under the hub; sessions chained as siblings. Instrument-agnostic throughout (no guitar-only or piano-only wording; chord sheets say "fretted instruments" on their caption). Example branch: one filled piece ("Autumn Leaves", real jazz standard, factual key Gm/composer Kosma) + one filled session (EXAMPLE chrome). Blank workspace: staff paper ×6, chord sheets ×4, technique ladders ×2, gig planners ×4, streak board ×1. README listing (`# The Woodshed`), config, inventory, nav map, `## Publishing`: tags `music, practice, instrument, repertoire, planner, journal`, six preview tabs.

- [ ] **Steps 5–8: Test, collection append, render, commit** — as Task 2: append `'18-music-practice-studio'`; render slug `music-practice-studio`; `pdf_spot.cjs` the rack (chips land on pieces); commit `feat: add The Woodshed music practice flagship`.

---

### Task 12: The Observatory (19-astronomy-observation-log)

**Files:**
- Create: `gallery-samples/19-astronomy-observation-log/{templates.js,hierarchy.js,README.md}`
- Create: `tests/unit/gallerySamples/astronomyObservationLog.test.ts`
- Modify: `tests/unit/gallerySamples/collection.test.ts` (append slug)

**Interfaces:**
- Consumes: harness.
- Produces: monthly sky pages linked to an accurate target catalog feeding sketch-circle session logs.

- [ ] **Step 1: Write failing contract test**

```ts
const contract: GallerySampleContract = {
  slug: '19-astronomy-observation-log',
  expectedTemplateIds: ['cover', 'start', 'workspace', 'month_sky', 'target', 'session', 'equipment', 'life_list', 'glossary'],
  pageCount: [40, 64],
  palette: ['#1d2530', '#6e7f96', '#e9edf3'],
  requiredStableNodeIds: ['root', 'start_here', 'example_workspace', 'blank_workspace'],
};

describe('19-astronomy-observation-log', () => {
  it('generates The Observatory', () => {
    expectValidGallerySample(contract.slug, contract);
  });

  it('points every monthly highlight at a catalog target and life-lists the catalog', () => {
    const sample = expectValidGallerySample(contract.slug, contract);
    const months = Object.values(sample.nodes).filter((n: any) => n.type === 'month_sky' && !n.referenceId);
    expect(months).toHaveLength(12);
    const targets = Object.values(sample.nodes).filter((n: any) => n.type === 'target' && !n.referenceId && !isExampleBranch(sample, n));
    expect(targets).toHaveLength(20);
    months.forEach((month: any) => {
      expect(month.children.length).toBeGreaterThanOrEqual(3);
      month.children.forEach((childId: string) => {
        const ref = sample.nodes[childId];
        expect(ref.referenceId, `${month.id} highlight ${childId}`).toBeTruthy();
        expect(sample.nodes[ref.referenceId].type).toBe('target');
      });
    });
    const lifeList = sample.nodes.life_list;
    const listed = lifeList.children.map((id: string) => sample.nodes[id]).map((c: any) => c.referenceId ?? c.id);
    targets.forEach((t: any) => expect(listed, `${t.id} life-listed`).toContain(t.id));
  });

  it('supports fewer sessions', () => {
    const sample = loadGallerySample(contract.slug, { sessionCount: 8 });
    expect(validateGallerySample(sample, { ...contract, pageCount: [30, 52] })).toEqual([]);
  });
});
```

- [ ] **Step 2: Run to verify failure** — `astronomyObservationLog.test.ts`. Expected: FAIL.

- [ ] **Step 3: Implement templates**

Deep-sky identity: night `#1d2530`, starlight `#6e7f96`, pale sky `#e9edf3`; inverted dark-fill header blocks, sparse star-field dot SVG, thin constellation-line motif. Template names: `Dome Cover`, `Observer Guide`, `Observatory Hub`, `Month Sky`, `Target Card`, `Observation Sheet`, `Equipment Page`, `Life List`, `Glossary Page`. `month_sky`: month masthead, five highlight rows (unfilled chips bound `{{highlight_N_label}}`, `child_index` 0–4, `''` unused), moon-notes lines. `target`: designation + common name header, spec table (type, constellation, magnitude, difficulty — explicit borders), finder notes, first-observed box, `Life list` chip (`specific_node → life_list`). `session`: date/conditions/seeing header, large SVG eyepiece circle (~300pt) with a sparse interior dot pattern for sketching, notes lines, sibling prev/next chips (`''` at ends). `life_list`: catalog checklist rows (`child_index`, observed checkbox per row).

- [ ] **Step 4: Implement hierarchy and README**

`DEFAULT_CONFIG = { sessionCount: 20 }` (range 8–40). Author 20 accurate targets: M31, M42, M45, M13, M8, M20, M27, M57, M81, M44, M51, M104, the double cluster, Albireo, plus Saturn, Jupiter, Venus, Mars, the Moon, and the Sun-in-eclipse-safety card — types, constellations, magnitudes, and month placements astronomically correct for northern mid-latitudes (Start Here states the framing; reviewer verifies each: Orion Nebula = winter, M13 = summer, etc.). Stable id `life_list` with reference children to all 20. Twelve `month_sky` nodes with 3–5 highlight references each. Example branch: one worked observation sheet (fictional M42 session, plausible winter date/conditions) + one filled target-card copy (EXAMPLE chrome). Blank workspace: `CONFIG.sessionCount` observation sheets, equipment page, glossary ×2. README listing (`# The Observatory`), config, inventory, nav map, `## Publishing`: tags `astronomy, stargazing, observation, telescope, log, science`, six preview tabs.

- [ ] **Steps 5–8: Test, collection append, render, commit** — as Task 2: append `'19-astronomy-observation-log'`; render slug `astronomy-observation-log`; `pdf_spot.cjs` a month page (highlights land on target cards); commit `feat: add The Observatory astronomy flagship`.

---

### Task 13: The Quest Ledger (20-habit-quest-rpg)

**Files:**
- Create: `gallery-samples/20-habit-quest-rpg/{templates.js,hierarchy.js,README.md}`
- Create: `tests/unit/gallerySamples/habitQuestRpg.test.ts`
- Modify: `tests/unit/gallerySamples/collection.test.ts` (append slug)

**Interfaces:**
- Consumes: harness.
- Produces: gamified habit RPG — character sheet, skill trees, daily quests, boss battles.

- [ ] **Step 1: Write failing contract test**

```ts
const contract: GallerySampleContract = {
  slug: '20-habit-quest-rpg',
  expectedTemplateIds: ['cover', 'start', 'workspace', 'character', 'skill_tree', 'quest_board', 'daily', 'boss', 'xp_ledger', 'level_log', 'trophy'],
  pageCount: [46, 68],
  palette: ['#5a2f2b', '#9c7c2e', '#f3ecda'],
  requiredStableNodeIds: ['root', 'start_here', 'example_workspace', 'blank_workspace'],
};

describe('20-habit-quest-rpg', () => {
  it('generates The Quest Ledger', () => {
    expectValidGallerySample(contract.slug, contract);
  });

  it('wires character sheet to trees and ledger, bosses back to the board', () => {
    const sample = expectValidGallerySample(contract.slug, contract);
    const character = sample.nodes.character_sheet;
    const characterDestinations = character.children.map((id: string) => sample.nodes[id]).map((c: any) => c.referenceId ?? c.id);
    const trees = Object.values(sample.nodes).filter((n: any) => n.type === 'skill_tree' && !n.referenceId);
    expect(trees).toHaveLength(4);
    trees.forEach((t: any) => expect(characterDestinations, `${t.id} on character`).toContain(t.id));
    expect(characterDestinations.map((id: string) => sample.nodes[id].type)).toContain('xp_ledger');
    const bosses = Object.values(sample.nodes).filter((n: any) => n.type === 'boss' && !n.referenceId && !isExampleBranch(sample, n));
    expect(bosses).toHaveLength(12);
  });

  it('supports a fortnight starter ledger', () => {
    const sample = loadGallerySample(contract.slug, { dailyCount: 14, bossCount: 4 });
    expect(validateGallerySample(sample, { ...contract, pageCount: [26, 46] })).toEqual([]);
  });
});
```

- [ ] **Step 2: Run to verify failure** — `habitQuestRpg.test.ts`. Expected: FAIL.

- [ ] **Step 3: Implement templates**

Illuminated-manuscript identity: rubric `#5a2f2b`, gold `#9c7c2e`, vellum `#f3ecda`; banner SVGs, XP diamond motifs, drop-cap page numerals. Template names: `Ledger Cover`, `Rulebook`, `Guild Hub`, `Character Sheet`, `Skill Tree`, `Quest Board`, `Daily Quest`, `Boss Battle`, `XP Ledger`, `Level Log`, `Trophy Hall`. `character`: name banner, class line, level boxes 1–10, stat rows, chips to the four trees + ledger (bound labels, `child_index` 0–4). `skill_tree`: three tiers of unlock boxes joined by thin connectors, each box a name line + XP-cost diamond + check circle. `daily`: date banner, three daily-quest rows (name, XP diamond, done circle), one side-quest row, XP-earned tally box, sibling prev/next chips (`''` at ends). `boss`: boss-name banner, the-big-goal line, four phase rows (milestone + check), victory-condition box, loot box, always-labelled `Quest board` chip (`specific_node → quest_board`). `quest_board`: active-quest rows (`child_index`, bound labels, `''` unused).

- [ ] **Step 4: Implement hierarchy and README**

`DEFAULT_CONFIG = { dailyCount: 28, bossCount: 12 }` (ranges 14–56, 4–16). Stable ids `character_sheet`, `quest_board`. Character children = references to the four trees (Health, Mind, Craft, Social) + XP ledger. Quest board children = references to the bosses. Rulebook (the `start` template's content) states XP values (daily quest 10 XP, side quest 5, boss phase 25, boss defeat 100) and the level table (level N at N×100 XP). Example branch: one filled daily + one filled boss ("The Marathon", clearly personal-goal fiction, EXAMPLE chrome). Blank workspace: dailies, bosses, XP ledger ×2, level log, trophy hall. README listing (`# The Quest Ledger`), config, inventory, nav map, `## Publishing`: tags `habits, gamified, rpg, quests, motivation, tracker`, six preview tabs.

- [ ] **Steps 5–8: Test, collection append, render, commit** — as Task 2: append `'20-habit-quest-rpg'`; render slug `habit-quest-rpg`; `pdf_spot.cjs` the character sheet (chips land on trees + ledger); commit `feat: add The Quest Ledger habit RPG flagship`.

---

### Task 14: Collection verification and README

**Files:**
- Modify: `gallery-samples/README.md`
- Verify: everything from Tasks 1–13

**Interfaces:**
- Consumes: all twelve product directories, harness, render runner.
- Produces: twenty-product collection proven green, built, rendered, and documented.

- [ ] **Step 1: Confirm collection completeness**

`EXPECTED_SLUGS` in `collection.test.ts` must now list all twenty slugs (01–20) in lexical order. Run: `npm test -- --run tests/unit/gallerySamples` — every suite PASS, including the distinct-chrome-geometry test across all twenty.

- [ ] **Step 2: Update the collection README**

Extend `gallery-samples/README.md`'s product list to twenty entries (9. The Branching Road … 20. The Quest Ledger, using each README's product name). Keep the shared-conventions section accurate: note that The Branching Road and Quiz Night carry their EXAMPLE chrome on their authoring/hosting kits, per the design spec.

- [ ] **Step 3: Full suite and build**

Run:

```bash
npm test -- --run && npm run build
```

Expected: all tests PASS; Vite build exits 0.

- [ ] **Step 4: Full render sweep**

With the dev server up: `node scratch/render_expansion.mjs` (no argument — all twelve render). Confirm each product's `samples/` holds six PNGs + the PDF. Open each cover PNG and one interior PNG per product and check: palette matches the contract, no overlapping chrome, no clipped grids, nav chips legible.

- [ ] **Step 5: PDF link audit**

For each product run `node scratch/pdf_spot.cjs <samples pdf> page 1` (cover CTA) plus the product's signature page from its task's Step 7, and confirm destinations match the hierarchy. Record any failure, fix in the owning product, re-run its product test and re-render before proceeding.

- [ ] **Step 6: Diff review**

```bash
git status --short && git diff --stat main...HEAD
```

Confirm only: `scratch/render_expansion.mjs`, twelve product directories (scripts, READMEs, samples), twelve product test files, `collection.test.ts`, `gallery-samples/README.md`, and the spec/plan docs. No app/server source changed.

- [ ] **Step 7: Commit**

```bash
git add gallery-samples/README.md
git commit -m "docs: list all twenty gallery flagships"
```

---

## After the plan

Whole-branch review, then merge to `main`, per the house method (superpowers:finishing-a-development-branch). Publishing to doctect.app is manual, by the user, from each product README's `## Publishing` section — description text is the README's top half, tags and the six preview pages are listed per product.
