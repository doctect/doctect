# Dev Onboarding Playground Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A self-contained, committed `onboarding/index.html` — a tmux-styled interactive playground (intro, tours, annotated code map, quizzes/games) that onboards a new developer to this repo, assembled by a build script from authored content + live repo data.

**Architecture:** Authored ESM source in `onboarding/src/` (runtime modules + data-only content modules). `onboarding/build.mjs` scans the repo, extracts anchored code excerpts, bundles the real `shared/diff.js` into `window.DoctectDiff`, strips module syntax off the runtime modules, and concatenates everything into one committed static HTML file that works over `file://` offline. Vitest guards integrity (paths exist, anchors resolve, data shapes valid, diff-bundle parity).

**Tech Stack:** Plain ES2022 JavaScript, no frameworks, no new dependencies. Node ≥ 20 for the build. Vitest (existing config: jsdom env, `tests/setup.ts`) for tests.

**Spec:** `docs/superpowers/specs/2026-08-07-dev-onboarding-playground-design.md`.
One deliberate deviation from the spec: tests live at `tests/unit/onboarding/` (house layout — every unit test in this repo lives under `tests/unit/`), not `onboarding/tests/`. Fixtures at `tests/unit/onboarding/fixtures/`.

## Global Constraints

- **No new dependencies.** `package.json` is not touched by any task.
- **The page must open via `file://` with no network**: no ES modules in the shipped page, no external fonts/CDNs, everything inlined.
- **Dark-only terminal skin**; every animation is disabled under `@media (prefers-reduced-motion: reduce)`.
- **Content modules are data-only**: JSON-serializable exports (no functions, no `Date`, no `undefined` members). Enforced by test.
- **Authoring rule for all `onboarding/src/**/*.mjs`:** `import`/`export` statements single-line only, never `export { a, b }` lists, never `export default` — the build's `stripModuleSyntax` depends on it (enforced by test in Task 2).
- **Regen is manual:** `node onboarding/build.mjs` rewrites `onboarding/index.html`; the committed file is a build artifact that must be regenerated and committed whenever a task changes anything it embeds.
- Commit style: `feat(onboarding): …` / `test(onboarding): …`; commit at the end of every task (and mid-task where steps say so).
- The app, server, and existing tests are never modified by this plan.

## File map (who owns what)

```
onboarding/
  README.md                     # Task 12 — what this is, regen, guard policy
  build.mjs                     # Tasks 1,2,3 — scan, vitals, strip, bundle, excerpts, assemble, CLI
  index.html                    # build output, committed from Task 3 on, regenerated Tasks 4–12
  src/
    shell.html                  # Task 3 — skeleton with <!--SLOT:*--> placeholders
    style.css                   # Task 3 (chrome) — extended in Tasks 4–11 as sections land
    app.js                      # Task 3 — bootstrap: router, status bar, keyboard, boot, help
    app-logic.mjs               # Task 3 — pure helpers (hash, format, tree, profile, ranks)
    render/
      introWin.mjs              # Task 4
      toursWin.mjs              # Task 5
      codeWin.mjs               # Tasks 6,7 — tree + detail + deep dives (tree reused by Task 11)
      playgroundWin.mjs         # Tasks 8,9,10,11 — hub + four activities
    content/
      validate.mjs              # Task 4 — content validators (build-time + tests, not shipped)
      intro.mjs                 # Task 4
      tours.mjs                 # Task 5
      code-map.mjs              # Tasks 6,7 — ANNOTATIONS, DEEP_DIVES, ANCHORS
      playground.mjs            # Tasks 8,9,10,11 — QUIZ_LEVELS, BUG_HUNT, MERGE_SCENARIOS, WDIL
tests/unit/onboarding/
  scan.test.js                  # Task 1
  bundle.test.js                # Task 2
  chrome.test.js                # Task 3
  content.test.js               # Task 4 — grows in Tasks 5–11 (integrity + shapes)
  fixtures/diffScenarios.js     # Task 2 — parity fixtures (reused by Task 10 scenarios test)
```

## Shared contracts (used by every task)

**TreeNode** `{name, path, kind:'dir'|'file', size, lines, children?}` — `path` repo-relative with `/` separators, `lines` is `null` for binary files, `children` sorted directories-first then alphabetical. Root node has `path: ''`.

**Vitals** `{generatedAt, gitSha, testFileCount, migrations:{count,last,ids}, routes:[{file, endpoints:[{method,path}]}], schemaVersion, deps:{runtime,dev}, areas:[{dir,files,lines}], specs:[string]}`.

**Anchor** `{id, file, start, lines}` or `{id, file, start, end}` (`end` exclusive: excerpt stops on the line before the line containing `end`). `start`/`end` are literal unique substrings. **Excerpt** `{id, file, startLine, code}`.

**Embedded globals in the page:** `window.DOCTECT = {data, content}` where `data = {tree, vitals, excerpts}` and `content = {intro, tours, codeMap, playground}`; `window.DoctectDiff = {stableStringify, computeChangeSet, threeWayDiff, applyChangeSet}`.

**Render contract:** every `render/*.mjs` exports `renderX(el, ctx)`; full re-render on navigation. `ctx = {data, content, profile, save, navigate, route, diff}` — `profile` is the mutable profile object, `save()` persists it, `navigate(hash)` sets `location.hash`, `route` is the parsed hash `{win, parts}`, `diff` is `window.DoctectDiff`.

**Profile (localStorage key `doctect-onboarding`):**
```js
{ v: 1, bootSeen: false,
  quiz: {},   // levelIdx -> {answers: {qIdx: choiceIdx}, best: number}
  bugs: {},   // bugId -> 'found' | 'revealed'
  wdil: {} }  // wdilId -> {tries: number, done: boolean, failed: boolean}
```

---

### Task 1: Repo scanner + vitals collector

**Files:**
- Create: `onboarding/build.mjs`
- Test: `tests/unit/onboarding/scan.test.js`

**Interfaces:**
- Consumes: nothing (first task).
- Produces: `SCAN_EXCLUDES: string[]`, `scanTree(rootDir): TreeNode`, `collectVitals(rootDir, tree): Vitals` — exported from `onboarding/build.mjs`. Later tasks import these exact names.

- [ ] **Step 1: Write the failing tests**

```js
// tests/unit/onboarding/scan.test.js
import { describe, it, expect } from 'vitest';
import path from 'path';
import { fileURLToPath } from 'url';
import { SCAN_EXCLUDES, scanTree, collectVitals } from '../../../onboarding/build.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

describe('scanTree', () => {
    const tree = scanTree(ROOT);

    it('returns a root dir node with children', () => {
        expect(tree.kind).toBe('dir');
        expect(tree.path).toBe('');
        expect(tree.children.length).toBeGreaterThan(5);
    });

    it('excludes junk and includes the load-bearing dirs', () => {
        const names = tree.children.map(c => c.name);
        for (const dir of ['components', 'server', 'services', 'shared', 'pages', 'tests']) {
            expect(names).toContain(dir);
        }
        for (const junk of ['node_modules', 'dist', 'scratch', 'playwright-report', '.git']) {
            expect(names).not.toContain(junk);
        }
    });

    it('excludes nested exact paths (built page, analytics db)', () => {
        const onboarding = tree.children.find(c => c.name === 'onboarding');
        if (onboarding) {
            expect(onboarding.children.map(c => c.name)).not.toContain('index.html');
        }
        const server = tree.children.find(c => c.name === 'server');
        expect(server.children.map(c => c.name)).not.toContain('analytics.db');
    });

    it('records size and line counts for text files, null lines for binaries', () => {
        const shared = tree.children.find(c => c.name === 'shared');
        const diff = shared.children.find(c => c.name === 'diff.js');
        expect(diff.size).toBeGreaterThan(1000);
        expect(diff.lines).toBeGreaterThan(100);
        const pub = tree.children.find(c => c.name === 'public');
        const findBinary = (node) => {
            if (node.kind === 'file') return /\.(png|webp|ico|woff2?|mp4)$/.test(node.name) ? node : null;
            for (const c of node.children || []) { const hit = findBinary(c); if (hit) return hit; }
            return null;
        };
        const bin = findBinary(pub);
        if (bin) expect(bin.lines).toBeNull();
    });

    it('sorts children dirs-first then alphabetical', () => {
        const kinds = tree.children.map(c => c.kind);
        const firstFile = kinds.indexOf('file');
        if (firstFile !== -1) expect(kinds.slice(firstFile)).not.toContain('dir');
    });
});

describe('collectVitals', () => {
    const tree = scanTree(ROOT);
    const vitals = collectVitals(ROOT, tree);

    it('counts unit test files', () => {
        expect(vitals.testFileCount).toBeGreaterThan(150);
    });

    it('reads the migration ledger', () => {
        expect(vitals.migrations.count).toBeGreaterThanOrEqual(16);
        expect(vitals.migrations.ids[0]).toBe('001_auth_tables');
    });

    it('reads route endpoints from server/routes/*.js', () => {
        const projects = vitals.routes.find(r => r.file === 'server/routes/projects.js');
        expect(projects.endpoints.some(e => e.method === 'POST' && e.path === '/api/projects/:id/publish')).toBe(true);
    });

    it('reads schema version and dep counts', () => {
        expect(vitals.schemaVersion).toBeGreaterThanOrEqual(11);
        expect(vitals.deps.runtime).toBeGreaterThan(10);
    });

    it('lists spec filenames and per-area rollups', () => {
        expect(vitals.specs).toContain('2026-08-07-dev-onboarding-playground-design.md');
        const serverArea = vitals.areas.find(a => a.dir === 'server');
        expect(serverArea.lines).toBeGreaterThan(1000);
    });
});
```

- [ ] **Step 2: Run tests, verify they fail**

Run: `npx vitest run tests/unit/onboarding/scan.test.js`
Expected: FAIL — cannot resolve `onboarding/build.mjs`.

- [ ] **Step 3: Implement scanner + vitals in `onboarding/build.mjs`**

```js
// onboarding/build.mjs
// Assembles onboarding/index.html from authored src/ + live repo data.
// Every step is exported pure so tests exercise them without writing files.
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath, pathToFileURL } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(HERE, '..');

// Basenames excluded anywhere; paths (with '/') excluded at that exact repo-relative path.
export const SCAN_EXCLUDES = [
    'node_modules', 'dist', '.git', '.claude', 'scratch', 'playwright-report', 'archives',
    'tutorial-videos', '.superpowers', 'package-lock.json', 'server.log',
    'server/analytics.db', 'onboarding/index.html', '.env',
];

const BINARY_EXT = /\.(png|jpe?g|webp|gif|ico|pdf|zip|woff2?|ttf|otf|mp4|webm|db|sqlite3?)$/i;

const isExcluded = (relPath, name) =>
    SCAN_EXCLUDES.includes(name) || SCAN_EXCLUDES.includes(relPath);

export const scanTree = (rootDir, relPath = '') => {
    const abs = path.join(rootDir, relPath);
    const name = relPath === '' ? path.basename(rootDir) : path.basename(relPath);
    const stat = fs.statSync(abs);
    if (stat.isDirectory()) {
        const children = fs.readdirSync(abs)
            .filter(entry => !isExcluded(relPath ? `${relPath}/${entry}` : entry, entry))
            .map(entry => scanTree(rootDir, relPath ? `${relPath}/${entry}` : entry))
            .sort((a, b) => (a.kind === b.kind ? a.name.localeCompare(b.name) : a.kind === 'dir' ? -1 : 1));
        return { name, path: relPath, kind: 'dir', size: children.reduce((s, c) => s + c.size, 0),
                 lines: null, children };
    }
    const lines = BINARY_EXT.test(name) ? null
        : fs.readFileSync(abs, 'utf8').split('\n').length;
    return { name, path: relPath, kind: 'file', size: stat.size, lines };
};

const walkFiles = (node, out = []) => {
    if (node.kind === 'file') out.push(node);
    else for (const c of node.children) walkFiles(c, out);
    return out;
};

export const flattenTreePaths = (tree) => walkFiles(tree).map(f => f.path);

export const collectVitals = (rootDir, tree) => {
    const read = (rel) => fs.readFileSync(path.join(rootDir, rel), 'utf8');
    const files = walkFiles(tree);

    const testFileCount = files.filter(f => /\.test\.[cm]?[jt]sx?$/.test(f.name)).length;

    const migrationSrc = read('server/migrations/index.js');
    const ids = [...migrationSrc.matchAll(/id:\s*'(\d{3}_[a-z0-9_]+)'/g)].map(m => m[1]);

    const routes = files
        .filter(f => f.path.startsWith('server/routes/'))
        .map(f => ({
            file: f.path,
            endpoints: [...read(f.path).matchAll(/router\.(get|post|patch|put|delete)\(\s*['"]([^'"]+)/g)]
                .map(m => ({ method: m[1].toUpperCase(), path: m[2] })),
        }));

    const schemaVersion = Number(read('services/migration.ts').match(/CURRENT_SCHEMA_VERSION = (\d+)/)[1]);
    const pkg = JSON.parse(read('package.json'));

    const areas = tree.children
        .filter(c => c.kind === 'dir')
        .map(c => ({ dir: c.name, files: walkFiles(c).length,
                     lines: walkFiles(c).reduce((s, f) => s + (f.lines || 0), 0) }))
        .sort((a, b) => b.lines - a.lines);

    const specs = fs.readdirSync(path.join(rootDir, 'docs/superpowers/specs')).filter(f => f.endsWith('.md')).sort();

    let gitSha = 'unknown';
    try { gitSha = execSync('git rev-parse --short HEAD', { cwd: rootDir }).toString().trim(); } catch { /* fine */ }

    return {
        generatedAt: new Date().toISOString(), gitSha, testFileCount,
        migrations: { count: ids.length, last: ids[ids.length - 1], ids },
        routes, schemaVersion,
        deps: { runtime: Object.keys(pkg.dependencies).length, dev: Object.keys(pkg.devDependencies).length },
        areas, specs,
    };
};
```

- [ ] **Step 4: Run tests, verify they pass**

Run: `npx vitest run tests/unit/onboarding/scan.test.js`
Expected: PASS (all).

- [ ] **Step 5: Run the full unit suite to prove nothing else broke**

Run: `npx vitest run`
Expected: green (existing count + new tests).

- [ ] **Step 6: Commit**

```bash
git add onboarding/build.mjs tests/unit/onboarding/scan.test.js
git commit -m "feat(onboarding): repo scanner and vitals collector for the dev playground build"
```

---

### Task 2: Module-syntax stripper, diff-engine bundle + parity, excerpt extractor

**Files:**
- Modify: `onboarding/build.mjs` (append new exports)
- Test: `tests/unit/onboarding/bundle.test.js`
- Create: `tests/unit/onboarding/fixtures/diffScenarios.js`

**Interfaces:**
- Consumes: `REPO_ROOT` from Task 1.
- Produces: `stripModuleSyntax(source): string`, `bundleDiffEngine(rootDir): string`, `extractExcerpts(rootDir, anchors): Excerpt[]`, `class AnchorError extends Error {constructor(id, reason)}` — from `onboarding/build.mjs`. Fixture module exports `DIFF_SCENARIOS` (array of `{name, base, fork, upstream}` DiffStates) — Task 10's Merge Lab presets reuse the same states.

**DiffState reminder** (shape `shared/diff.js` traverses): `{nodes: object, rootId: string, variants: {[variantId]: {name, templates: {[templateId]: object}}}, generator?: {formatVersion:1, templateScript, hierarchyScript, generatedAt}}`.

- [ ] **Step 1: Write the fixtures**

```js
// tests/unit/onboarding/fixtures/diffScenarios.js
// Small DiffStates exercising the real shared/diff.js engine. Reused by the
// Merge Lab presets (content/playground.mjs) — keep names in sync with it.
const base = () => ({
    nodes: { root: { id: 'root', name: 'Planner', children: ['week'] },
             week: { id: 'week', name: 'Week 1', children: [] } },
    rootId: 'root',
    variants: {
        weekly: { name: 'Weekly', templates: {
            day:   { id: 'day', elements: [{ type: 'text', text: 'Day', x: 10, y: 10 }] },
            notes: { id: 'notes', elements: [{ type: 'rect', x: 0, y: 0, w: 100, h: 40 }] },
        } },
    },
});

const withTemplate = (state, vid, tid, template) => {
    const next = JSON.parse(JSON.stringify(state));
    next.variants[vid].templates[tid] = template;
    return next;
};
const withoutTemplate = (state, vid, tid) => {
    const next = JSON.parse(JSON.stringify(state));
    delete next.variants[vid].templates[tid];
    return next;
};
const gen = (marker) => ({ formatVersion: 1, templateScript: `// ${marker}`,
    hierarchyScript: '// h', generatedAt: '2026-08-07T00:00:00.000Z' });

export const DIFF_SCENARIOS = [
    {
        name: 'clean-merge',
        base: base(),
        fork: withTemplate(base(), 'weekly', 'day',
            { id: 'day', elements: [{ type: 'text', text: 'Day (fork)', x: 10, y: 10 }] }),
        upstream: (() => { const s = base(); s.variants.weekly.name = 'Weekly v2'; return s; })(),
    },
    {
        name: 'same-template-conflict',
        base: base(),
        fork: withTemplate(base(), 'weekly', 'day',
            { id: 'day', elements: [{ type: 'text', text: 'Fork edit', x: 1, y: 1 }] }),
        upstream: withTemplate(base(), 'weekly', 'day',
            { id: 'day', elements: [{ type: 'text', text: 'Upstream edit', x: 2, y: 2 }] }),
    },
    {
        name: 'remove-vs-modify',
        base: base(),
        fork: withoutTemplate(base(), 'weekly', 'notes'),
        upstream: withTemplate(base(), 'weekly', 'notes',
            { id: 'notes', elements: [{ type: 'rect', x: 5, y: 5, w: 90, h: 30 }] }),
    },
    {
        name: 'variant-added-both-sides',
        base: base(),
        fork: (() => { const s = base(); s.variants.daily = { name: 'Daily', templates: {
            morning: { id: 'morning', elements: [] } } }; return s; })(),
        upstream: (() => { const s = base(); s.variants.daily = { name: 'Daily', templates: {
            evening: { id: 'evening', elements: [] } } }; return s; })(),
    },
    {
        name: 'generator-conflict',
        base: (() => { const s = base(); s.generator = gen('base'); return s; })(),
        fork: (() => { const s = base(); s.generator = gen('fork'); return s; })(),
        upstream: (() => { const s = base(); s.generator = gen('upstream'); return s; })(),
    },
];
```

- [ ] **Step 2: Write the failing tests**

```js
// tests/unit/onboarding/bundle.test.js
import { describe, it, expect } from 'vitest';
import vm from 'node:vm';
import { REPO_ROOT, stripModuleSyntax, bundleDiffEngine, extractExcerpts, AnchorError }
    from '../../../onboarding/build.mjs';
import * as realDiff from '../../../shared/diff.js';
import { DIFF_SCENARIOS } from './fixtures/diffScenarios.js';

describe('stripModuleSyntax', () => {
    it('drops single-line imports and unwraps export declarations', () => {
        const src = `import fs from 'fs';\nimport { a, b } from './x.js';\n` +
            `export const one = 1;\nexport function two() { return 2; }\nconst keep = 3;\n`;
        const out = stripModuleSyntax(src);
        expect(out).not.toContain('import ');
        expect(out).toContain('const one = 1;');
        expect(out).toContain('function two()');
        expect(out).toContain('const keep = 3;');
        expect(out).not.toContain('export ');
    });
});

describe('bundleDiffEngine parity', () => {
    it('the IIFE bundle behaves identically to the real ESM module', () => {
        const bundle = bundleDiffEngine(REPO_ROOT);
        const sandbox = { window: {} };
        vm.createContext(sandbox);
        vm.runInContext(bundle, sandbox);
        const bundled = sandbox.window.DoctectDiff;
        expect(Object.keys(bundled).sort()).toEqual(
            ['applyChangeSet', 'computeChangeSet', 'stableStringify', 'threeWayDiff']);
        for (const s of DIFF_SCENARIOS) {
            const real = realDiff.threeWayDiff(s.base, s.fork, s.upstream);
            const alt = bundled.threeWayDiff(s.base, s.fork, s.upstream);
            expect(alt).toEqual(real);
            expect(bundled.computeChangeSet(s.base, s.fork)).toEqual(realDiff.computeChangeSet(s.base, s.fork));
            if (real.conflicts.length === 0) {
                expect(bundled.applyChangeSet(s.base, s.fork, s.upstream))
                    .toEqual(realDiff.applyChangeSet(s.base, s.fork, s.upstream));
            }
        }
    });

    it('the scenarios actually cover both outcomes', () => {
        const conflictCounts = DIFF_SCENARIOS.map(s => realDiff.threeWayDiff(s.base, s.fork, s.upstream).conflicts.length);
        expect(conflictCounts.filter(n => n === 0).length).toBeGreaterThanOrEqual(1);
        expect(conflictCounts.filter(n => n > 0).length).toBeGreaterThanOrEqual(3);
    });
});

describe('extractExcerpts', () => {
    it('extracts by start + line count', () => {
        const [ex] = extractExcerpts(REPO_ROOT, [
            { id: 'diff-threeway', file: 'shared/diff.js', start: 'export const threeWayDiff', lines: 5 }]);
        expect(ex.code.split('\n')).toHaveLength(5);
        expect(ex.code).toContain('threeWayDiff');
        expect(ex.startLine).toBeGreaterThan(50);
    });

    it('extracts by start + exclusive end substring', () => {
        const [ex] = extractExcerpts(REPO_ROOT, [
            { id: 'diff-changeset', file: 'shared/diff.js',
              start: 'export const computeChangeSet', end: 'const touchedTemplates' }]);
        expect(ex.code).toContain('computeChangeSet');
        expect(ex.code).not.toContain('touchedTemplates');
    });

    it('throws AnchorError naming the anchor when start is missing or ambiguous', () => {
        expect(() => extractExcerpts(REPO_ROOT, [
            { id: 'nope', file: 'shared/diff.js', start: 'NOT PRESENT ANYWHERE', lines: 3 }]))
            .toThrowError(/nope/);
        expect(() => extractExcerpts(REPO_ROOT, [
            { id: 'ambig', file: 'shared/diff.js', start: 'const', lines: 3 }]))
            .toThrowError(AnchorError);
    });
});
```

- [ ] **Step 3: Run tests, verify they fail**

Run: `npx vitest run tests/unit/onboarding/bundle.test.js`
Expected: FAIL — `stripModuleSyntax` not exported.

- [ ] **Step 4: Implement in `onboarding/build.mjs`** (append)

```js
export class AnchorError extends Error {
    constructor(id, reason) { super(`Anchor "${id}": ${reason}`); this.id = id; }
}

// Authoring rule (Global Constraints): imports single-line, exports are
// `export const|function|class` declarations only. That is all this handles.
export const stripModuleSyntax = (source) => source
    .replace(/^import[^\n]*;[ \t]*$/gm, '')
    .replace(/^export (const|function|class|let) /gm, '$1 ');

export const bundleDiffEngine = (rootDir) => {
    const meta = fs.readFileSync(path.join(rootDir, 'shared/generatorMetadata.js'), 'utf8');
    const diff = fs.readFileSync(path.join(rootDir, 'shared/diff.js'), 'utf8');
    return `window.DoctectDiff = (() => {\n${stripModuleSyntax(meta)}\n${stripModuleSyntax(diff)}\n` +
        `return { stableStringify, computeChangeSet, threeWayDiff, applyChangeSet };\n})();\n`;
};

const countOccurrences = (haystack, needle) => haystack.split(needle).length - 1;

export const extractExcerpts = (rootDir, anchors) => anchors.map(anchor => {
    const abs = path.join(rootDir, anchor.file);
    if (!fs.existsSync(abs)) throw new AnchorError(anchor.id, `file not found: ${anchor.file}`);
    const source = fs.readFileSync(abs, 'utf8');
    const n = countOccurrences(source, anchor.start);
    if (n === 0) throw new AnchorError(anchor.id, `start not found in ${anchor.file}`);
    if (n > 1) throw new AnchorError(anchor.id, `start matches ${n} times in ${anchor.file} — not unique`);
    const lines = source.split('\n');
    const startLine = lines.findIndex(l => l.includes(anchor.start));
    let endLine;
    if (anchor.lines) {
        endLine = startLine + anchor.lines;
    } else {
        const rel = lines.slice(startLine + 1).findIndex(l => l.includes(anchor.end));
        if (rel === -1) throw new AnchorError(anchor.id, `end not found after start in ${anchor.file}`);
        endLine = startLine + 1 + rel;
    }
    return { id: anchor.id, file: anchor.file, startLine: startLine + 1,
             code: lines.slice(startLine, endLine).join('\n') };
});
```

- [ ] **Step 5: Run tests, verify pass; run full suite**

Run: `npx vitest run tests/unit/onboarding/` then `npx vitest run`
Expected: PASS, suite green.

- [ ] **Step 6: Commit**

```bash
git add onboarding/build.mjs tests/unit/onboarding/bundle.test.js tests/unit/onboarding/fixtures/diffScenarios.js
git commit -m "feat(onboarding): module stripper, DoctectDiff bundle with parity guard, anchor excerpt extractor"
```

---

### Task 3: Page chrome — shell, stylesheet, pure logic, runtime bootstrap, assembly, first committed page

Creates the tmux skin: four windows, status bar with clock, hash router, number-key
switching, `?` help overlay, skippable boot sequence. Content windows render stub
text until Tasks 4–11 fill them. Also creates all four content modules and all four
render modules as **minimal valid stubs** so assembly and later tests have stable
import targets from here on.

**Files:**
- Modify: `onboarding/build.mjs` (append `buildRuntimeBundle`, `assemblePage`, `buildData`, `buildContent`, `main`)
- Create: `onboarding/src/shell.html`, `onboarding/src/style.css`, `onboarding/src/app-logic.mjs`, `onboarding/src/app.js`
- Create (stubs, filled in later tasks): `onboarding/src/content/intro.mjs`, `content/tours.mjs`, `content/code-map.mjs`, `content/playground.mjs`, `render/introWin.mjs`, `render/toursWin.mjs`, `render/codeWin.mjs`, `render/playgroundWin.mjs`
- Create: `onboarding/index.html` (build output, committed)
- Test: `tests/unit/onboarding/chrome.test.js`

**Interfaces:**
- Consumes: Task 1–2 exports.
- Produces:
  - `app-logic.mjs`: `parseHash(hash)`, `buildHash(win, parts)`, `formatBytes(n)`, `filterTree(node, query)`, `findNode(tree, path)`, `flattenDirs(tree)`, `nearestAnnotated(path, annotations)`, `RANKS`, `rankFor(points, max)`, `scoreProfile(profile, playground)`, `levelUnlocked(profile, levelIndex)`, `defaultProfile()`, `loadProfile()`, `saveProfile(profile)`, `WINDOWS`.
  - `build.mjs`: `RUNTIME_MODULES` (ordered list), `buildRuntimeBundle(rootDir)`, `assemblePage({style, runtime, dataJson, contentJson, diffBundle, footerHtml})`, `buildData(rootDir)`, `buildContent()`, `main()`.
  - Render stubs: `renderIntro(el, ctx)`, `renderTours(el, ctx)`, `renderCode(el, ctx)`, `renderPlayground(el, ctx)`.
  - Content stubs: `export const INTRO = {}` / `TOURS = []` / `CODE_MAP = {annotations: [], deepDives: [], anchors: []}` / `PLAYGROUND = {quizLevels: [], bugHunt: [], mergeScenarios: [], wdil: []}` — later tasks replace bodies, never the export names.
- Page slots in `shell.html` (exact strings): `<!--SLOT:STYLE-->`, `<!--SLOT:DATA-->`, `<!--SLOT:DIFF-->`, `<!--SLOT:RUNTIME-->`, `<!--SLOT:FOOTER-->`.

- [ ] **Step 1: Write the failing tests**

```js
// tests/unit/onboarding/chrome.test.js
import { describe, it, expect, beforeEach } from 'vitest';
import { parseHash, buildHash, formatBytes, filterTree, findNode, nearestAnnotated,
         rankFor, scoreProfile, levelUnlocked, defaultProfile, loadProfile, saveProfile,
         WINDOWS } from '../../../onboarding/src/app-logic.mjs';
import { REPO_ROOT, buildRuntimeBundle, assemblePage, buildData, buildContent }
    from '../../../onboarding/build.mjs';

describe('router helpers', () => {
    it('parses window + parts, defaults to intro', () => {
        expect(parseHash('#/tours/publish/3')).toEqual({ win: 'tours', parts: ['publish', '3'] });
        expect(parseHash('')).toEqual({ win: 'intro', parts: [] });
        expect(parseHash('#/nope')).toEqual({ win: 'intro', parts: [] });
        expect(buildHash('code', ['server', 'app.js'])).toBe('#/code/server/app.js');
    });
    it('WINDOWS lists the four windows in status-bar order', () => {
        expect(WINDOWS.map(w => w.id)).toEqual(['intro', 'tours', 'code', 'playground']);
    });
});

describe('tree helpers', () => {
    const tree = { name: 'root', path: '', kind: 'dir', size: 3, lines: null, children: [
        { name: 'server', path: 'server', kind: 'dir', size: 2, lines: null, children: [
            { name: 'app.js', path: 'server/app.js', kind: 'file', size: 1, lines: 10 },
            { name: 'db.js', path: 'server/db.js', kind: 'file', size: 1, lines: 10 } ] },
        { name: 'shared', path: 'shared', kind: 'dir', size: 1, lines: null, children: [
            { name: 'diff.js', path: 'shared/diff.js', kind: 'file', size: 1, lines: 10 } ] } ] };

    it('filterTree prunes to matches and their ancestors', () => {
        const out = filterTree(tree, 'diff');
        expect(out.children.map(c => c.name)).toEqual(['shared']);
        expect(filterTree(tree, 'zzz')).toBeNull();
        expect(filterTree(tree, '').children).toHaveLength(2);
    });
    it('findNode resolves exact paths', () => {
        expect(findNode(tree, 'server/app.js').name).toBe('app.js');
        expect(findNode(tree, 'missing/x.js')).toBeNull();
    });
    it('nearestAnnotated falls back to the closest annotated ancestor', () => {
        const anns = [{ path: 'server', note: 'server dir' }, { path: 'server/app.js', note: 'factory' }];
        expect(nearestAnnotated('server/app.js', anns).note).toBe('factory');
        expect(nearestAnnotated('server/db.js', anns).note).toBe('server dir');
        expect(nearestAnnotated('shared/diff.js', anns)).toBeNull();
    });
});

describe('profile + ranks', () => {
    beforeEach(() => localStorage.clear());
    const playground = { quizLevels: [{ questions: new Array(8).fill(0) }, { questions: new Array(8).fill(0) }],
                         bugHunt: [{ id: 'b1' }], wdil: [{ id: 'w1' }] };
    it('scores quiz best + bugs found + wdil clean solves', () => {
        const p = defaultProfile();
        p.quiz[0] = { answers: {}, best: 6 };
        p.bugs.b1 = 'found';
        p.wdil.w1 = { tries: 1, done: true, failed: false };
        expect(scoreProfile(p, playground)).toEqual({ points: 8, max: 18 });
    });
    it('rankFor walks thresholds', () => {
        expect(rankFor(0, 57)).toBe('visitor');
        expect(rankFor(29, 57)).toBe('contributor');
        expect(rankFor(57, 57)).toBe('maintainer');
    });
    it('level 0 open, later levels need best>=6 below', () => {
        const p = defaultProfile();
        expect(levelUnlocked(p, 0)).toBe(true);
        expect(levelUnlocked(p, 1)).toBe(false);
        p.quiz[0] = { answers: {}, best: 6 };
        expect(levelUnlocked(p, 1)).toBe(true);
    });
    it('profile round-trips localStorage and survives garbage', () => {
        const p = defaultProfile(); p.bootSeen = true; saveProfile(p);
        expect(loadProfile().bootSeen).toBe(true);
        localStorage.setItem('doctect-onboarding', '{corrupt');
        expect(loadProfile().v).toBe(1);
    });
    it('formatBytes', () => {
        expect(formatBytes(512)).toBe('512 B');
        expect(formatBytes(2048)).toBe('2.0 KB');
        expect(formatBytes(3 * 1024 * 1024)).toBe('3.0 MB');
    });
});

describe('assembly', () => {
    it('fills every slot and leaves none behind', () => {
        const html = assemblePage({ style: '.x{}', runtime: 'var y=1;', dataJson: '{"d":1}',
            contentJson: '{"c":1}', diffBundle: 'window.DoctectDiff={};', footerHtml: 'sha abc' });
        expect(html).toContain('.x{}');
        expect(html).toContain('window.DOCTECT');
        expect(html).toContain('sha abc');
        expect(html).not.toContain('<!--SLOT:');
    });
    it('buildRuntimeBundle concatenates stripped modules with no module syntax left', () => {
        const bundle = buildRuntimeBundle(REPO_ROOT);
        expect(bundle).not.toMatch(/^import /m);
        expect(bundle).not.toMatch(/^export /m);
        expect(bundle).toContain('parseHash');
    });
    it('buildData and buildContent produce JSON-serializable payloads', async () => {
        const data = buildData(REPO_ROOT);
        expect(data.tree.kind).toBe('dir');
        expect(Array.isArray(data.excerpts)).toBe(true);
        const content = await buildContent();
        expect(JSON.parse(JSON.stringify(content))).toEqual(content);
    });
});
```

- [ ] **Step 2: Run tests, verify they fail**

Run: `npx vitest run tests/unit/onboarding/chrome.test.js`
Expected: FAIL — `app-logic.mjs` missing.

- [ ] **Step 3: Create `onboarding/src/app-logic.mjs`**

```js
// Pure helpers for the onboarding playground. No DOM access here — everything
// in this file is unit-tested; DOM glue lives in app.js.
export const WINDOWS = [
    { id: 'intro', label: 'intro' },
    { id: 'tours', label: 'tours' },
    { id: 'code', label: 'code' },
    { id: 'playground', label: 'playground' },
];

export const parseHash = (hash) => {
    const parts = (hash || '').replace(/^#\/?/, '').split('/').filter(Boolean);
    const win = WINDOWS.some(w => w.id === parts[0]) ? parts[0] : 'intro';
    return { win, parts: win === parts[0] ? parts.slice(1) : [] };
};

export const buildHash = (win, parts = []) => '#/' + [win, ...parts].join('/');

export const formatBytes = (n) => n < 1024 ? `${n} B`
    : n < 1024 * 1024 ? `${(n / 1024).toFixed(1)} KB`
    : `${(n / (1024 * 1024)).toFixed(1)} MB`;

export const filterTree = (node, query) => {
    const q = (query || '').toLowerCase();
    if (!q) return node;
    if (node.kind === 'file') {
        return node.path.toLowerCase().includes(q) ? node : null;
    }
    const children = (node.children || []).map(c => filterTree(c, q)).filter(Boolean);
    if (children.length === 0 && !node.path.toLowerCase().includes(q)) return null;
    return { ...node, children: children.length ? children : node.children };
};

export const findNode = (tree, path) => {
    if (tree.path === path) return tree;
    for (const c of tree.children || []) {
        if (path === c.path || path.startsWith(c.path + '/')) return findNode(c, path);
    }
    return null;
};

export const flattenDirs = (tree, out = []) => {
    if (tree.kind === 'dir') { out.push(tree.path); (tree.children || []).forEach(c => flattenDirs(c, out)); }
    return out;
};

export const nearestAnnotated = (path, annotations) => {
    let probe = path;
    while (probe) {
        const hit = annotations.find(a => a.path === probe);
        if (hit) return hit;
        probe = probe.includes('/') ? probe.slice(0, probe.lastIndexOf('/')) : '';
    }
    return null;
};

export const RANKS = [
    ['visitor', 0], ['intern', 0.2], ['contributor', 0.45], ['reviewer', 0.7], ['maintainer', 0.9],
];

export const rankFor = (points, max) => {
    const frac = max > 0 ? points / max : 0;
    let rank = RANKS[0][0];
    for (const [name, floor] of RANKS) if (frac >= floor) rank = name;
    return rank;
};

export const scoreProfile = (profile, playground) => {
    let points = 0, max = 0;
    playground.quizLevels.forEach((level, i) => {
        max += level.questions.length;
        points += profile.quiz[i]?.best || 0;
    });
    max += playground.bugHunt.length;
    points += playground.bugHunt.filter(b => profile.bugs[b.id] === 'found').length;
    max += playground.wdil.length;
    points += playground.wdil.filter(w => profile.wdil[w.id]?.done && !profile.wdil[w.id]?.failed).length;
    return { points, max };
};

export const levelUnlocked = (profile, levelIndex) =>
    levelIndex === 0 || (profile.quiz[levelIndex - 1]?.best || 0) >= 6;

export const defaultProfile = () => ({ v: 1, bootSeen: false, quiz: {}, bugs: {}, wdil: {} });

const STORE_KEY = 'doctect-onboarding';

export const loadProfile = () => {
    try {
        const raw = localStorage.getItem(STORE_KEY);
        const parsed = raw ? JSON.parse(raw) : null;
        if (parsed && parsed.v === 1) return { ...defaultProfile(), ...parsed };
    } catch { /* fresh profile below */ }
    return defaultProfile();
};

export const saveProfile = (profile) => {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(profile)); } catch { /* full/blocked: ignore */ }
};
```

- [ ] **Step 4: Create shell, stylesheet, stubs, bootstrap**

`onboarding/src/shell.html`:

```html
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>doctect · dev onboarding</title>
<style><!--SLOT:STYLE--></style>
</head>
<body>
<div id="boot" hidden><pre id="boot-lines"></pre><div class="boot-hint">press any key to skip</div></div>
<div id="help" hidden></div>
<main id="root" aria-live="polite"></main>
<footer id="statusbar"></footer>
<div id="buildinfo"><!--SLOT:FOOTER--></div>
<script><!--SLOT:DATA--></script>
<script><!--SLOT:DIFF--></script>
<script><!--SLOT:RUNTIME--></script>
</body>
</html>
```

`onboarding/src/style.css` — the full tmux skin. Palette: background `#0c0f0d`, pane background `#101512`, foreground `#c8d3c5`, dim `#7d8a7a`, accent green `#7ce38b`, accent amber `#e3c67c`, accent red `#e37c7c`, selection `#1d2a20`, border `#2a352c`. Key rules (write the file exactly like this, then extend per-window classes in later tasks):

```css
* { box-sizing: border-box; margin: 0; padding: 0; }
html, body { height: 100%; }
body {
    background: #0c0f0d; color: #c8d3c5;
    font: 14px/1.5 "SFMono-Regular", ui-monospace, "Cascadia Mono", Menlo, Consolas, monospace;
    display: flex; flex-direction: column; overflow: hidden;
}
#root { flex: 1; overflow: hidden; display: flex; gap: 8px; padding: 8px; }
a { color: #7ce38b; text-decoration: none; }
a:hover { text-decoration: underline; }
button { font: inherit; color: inherit; background: #1d2a20; border: 1px solid #2a352c;
         padding: 2px 10px; cursor: pointer; }
button:hover { border-color: #7ce38b; }
input, textarea, select { font: inherit; color: inherit; background: #0c0f0d;
    border: 1px solid #2a352c; padding: 3px 6px; }
input:focus, textarea:focus { outline: 1px solid #7ce38b; }

/* tmux pane: titled bordered box */
.pane { border: 1px solid #2a352c; background: #101512; display: flex; flex-direction: column;
        min-width: 0; min-height: 0; }
.pane > .pane-title { color: #7d8a7a; font-size: 12px; padding: 3px 8px;
    border-bottom: 1px solid #2a352c; background: #0e1310; }
.pane > .pane-title::before { content: "┌ "; color: #2a352c; }
.pane > .pane-body { flex: 1; overflow-y: auto; padding: 12px; min-height: 0; }

/* status bar */
#statusbar { display: flex; align-items: center; gap: 6px; background: #1d2a20;
    color: #c8d3c5; padding: 2px 8px; font-size: 13px; flex-wrap: wrap; }
#statusbar .session { color: #7ce38b; font-weight: bold; }
#statusbar .wtab { cursor: pointer; padding: 0 6px; color: #7d8a7a; }
#statusbar .wtab.active { background: #7ce38b; color: #0c0f0d; }
#statusbar .spacer { flex: 1; }
#statusbar .clock, #statusbar .meta { color: #7d8a7a; font-size: 12px; }
#buildinfo { display: none; }

/* boot overlay */
#boot { position: fixed; inset: 0; background: #0c0f0d; z-index: 60;
    display: flex; flex-direction: column; justify-content: center; padding: 15vh 12vw; }
#boot-lines { color: #7ce38b; white-space: pre-wrap; }
.boot-hint { color: #7d8a7a; margin-top: 2em; font-size: 12px; }

/* help overlay */
#help { position: fixed; inset: 10vh 20vw; background: #101512; border: 1px solid #7ce38b;
    z-index: 50; padding: 20px; overflow-y: auto; }
#help h2 { color: #7ce38b; font-size: 14px; margin-bottom: 12px; }
#help table { border-collapse: collapse; }
#help td { padding: 3px 14px 3px 0; }
#help td.key { color: #e3c67c; }

kbd { background: #1d2a20; border: 1px solid #2a352c; padding: 0 5px; border-radius: 3px;
      color: #e3c67c; font-size: 12px; }
.dim { color: #7d8a7a; }
.accent { color: #7ce38b; }
.amber { color: #e3c67c; }
.red { color: #e37c7c; }
code, pre.code { background: #0e1310; border: 1px solid #2a352c; }
pre.code { padding: 10px; overflow-x: auto; font-size: 13px; line-height: 1.45; }
pre.code .tok-k { color: #7ce38b; } pre.code .tok-s { color: #e3c67c; }
pre.code .tok-c { color: #7d8a7a; font-style: italic; }

.stub { color: #7d8a7a; padding: 24px; }

@media (max-width: 900px) { #root { flex-direction: column; overflow-y: auto; }
    .pane { min-height: 200px; } }
@media (prefers-reduced-motion: reduce) { * { animation: none !important; transition: none !important; } }
```

The four content stubs (exact bodies; later tasks replace the object/array literals only):

```js
// onboarding/src/content/intro.mjs
export const INTRO = { about: [], run: [], houseMethod: { text: [], stages: [], catches: [] }, roundLabels: {} };
```
```js
// onboarding/src/content/tours.mjs
export const TOURS = [];
```
```js
// onboarding/src/content/code-map.mjs
export const CODE_MAP = { annotations: [], deepDives: [], anchors: [] };
```
```js
// onboarding/src/content/playground.mjs
export const PLAYGROUND = { quizLevels: [], bugHunt: [], mergeScenarios: [], wdil: [] };
```

The four render stubs (same file shape; later tasks replace the body):

```js
// onboarding/src/render/introWin.mjs   (same pattern for toursWin/codeWin/playgroundWin,
// function names renderTours / renderCode / renderPlayground, titles to match)
export function renderIntro(el, ctx) {
    el.innerHTML = '<section class="pane" style="flex:1"><div class="pane-title">intro</div>' +
        '<div class="pane-body"><p class="stub">coming soon — filled by a later task</p></div></section>';
}
```

`onboarding/src/app.js` — DOM bootstrap (not unit-tested; verified in the final browser drive):

```js
// DOM glue. Pure logic lives in app-logic.mjs; render fns in render/*.mjs.
// After stripModuleSyntax + concatenation everything shares one IIFE scope.
(function initOnboarding() {
    const { data, content } = window.DOCTECT;
    let profile = loadProfile();

    const ctx = () => ({
        data, content, profile,
        save: () => saveProfile(profile),
        navigate: (hash) => { location.hash = hash; },
        route: parseHash(location.hash),
        diff: window.DoctectDiff,
    });

    const root = document.getElementById('root');
    const statusbar = document.getElementById('statusbar');
    const renderers = { intro: renderIntro, tours: renderTours, code: renderCode, playground: renderPlayground };

    const renderStatusbar = (active) => {
        statusbar.innerHTML = '';
        const session = document.createElement('span');
        session.className = 'session'; session.textContent = '[doctect]';
        statusbar.appendChild(session);
        WINDOWS.forEach((w, i) => {
            const tab = document.createElement('span');
            tab.className = 'wtab' + (w.id === active ? ' active' : '');
            tab.textContent = `${i + 1}:${w.label}${w.id === active ? '*' : ''}`;
            tab.onclick = () => { location.hash = buildHash(w.id); };
            statusbar.appendChild(tab);
        });
        const spacer = document.createElement('span'); spacer.className = 'spacer';
        const meta = document.createElement('span'); meta.className = 'meta';
        meta.textContent = `${data.vitals.gitSha} · ? for keys`;
        const clock = document.createElement('span'); clock.className = 'clock';
        clock.id = 'clock';
        statusbar.append(spacer, meta, clock);
    };

    const tickClock = () => {
        const el = document.getElementById('clock');
        if (el) el.textContent = new Date().toTimeString().slice(0, 5);
    };
    setInterval(tickClock, 10_000);

    const renderRoute = () => {
        const route = parseHash(location.hash);
        renderStatusbar(route.win);
        tickClock();
        root.innerHTML = '';
        renderers[route.win](root, ctx());
    };

    const help = document.getElementById('help');
    const toggleHelp = (force) => {
        const show = force !== undefined ? force : help.hidden;
        help.hidden = !show;
        if (show) help.innerHTML = '<h2>doctect onboarding — keys</h2><table>' +
            '<tr><td class="key">1–4</td><td>switch window</td></tr>' +
            '<tr><td class="key">?</td><td>toggle this help</td></tr>' +
            '<tr><td class="key">/</td><td>focus search (code window)</td></tr>' +
            '<tr><td class="key">Esc</td><td>close overlays</td></tr></table>';
    };

    document.addEventListener('keydown', (e) => {
        const inField = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName || '');
        if (e.key === 'Escape') { toggleHelp(false); return; }
        if (inField) return;
        if (e.key >= '1' && e.key <= '4') location.hash = buildHash(WINDOWS[Number(e.key) - 1].id);
        else if (e.key === '?') toggleHelp();
        else if (e.key === '/') {
            const search = document.querySelector('[data-search]');
            if (search) { e.preventDefault(); search.focus(); }
        }
    });

    const boot = document.getElementById('boot');
    const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const finishBoot = () => {
        boot.hidden = true;
        if (!profile.bootSeen) { profile.bootSeen = true; saveProfile(profile); }
    };
    if (!profile.bootSeen && !reducedMotion) {
        boot.hidden = false;
        const lines = [
            'connecting to doctect …',
            `· ${data.vitals.testFileCount} unit-test files · ${data.vitals.migrations.count} migrations · schema v${data.vitals.schemaVersion}`,
            '· gallery, forks, merge requests, layers, generator, docs',
            'attach: [doctect] session ready',
        ];
        const pre = document.getElementById('boot-lines');
        let li = 0, ci = 0;
        const timer = setInterval(() => {
            if (li >= lines.length) { clearInterval(timer); setTimeout(finishBoot, 500); return; }
            ci++;
            if (ci >= lines[li].length) { li++; ci = 0; }
            pre.textContent = lines.slice(0, li).join('\n') + (li < lines.length ? '\n' + lines[li].slice(0, ci) : '');
        }, 12);
        boot.addEventListener('click', () => { clearInterval(timer); finishBoot(); }, { once: true });
        document.addEventListener('keydown', function skip() {
            clearInterval(timer); finishBoot(); document.removeEventListener('keydown', skip);
        }, { once: true });
    } else if (!profile.bootSeen) {
        finishBoot();
    }

    window.addEventListener('hashchange', renderRoute);
    renderRoute();
})();
```

- [ ] **Step 5: Append assembly + CLI to `onboarding/build.mjs`**

```js
export const RUNTIME_MODULES = [
    'src/app-logic.mjs',
    'src/render/introWin.mjs', 'src/render/toursWin.mjs',
    'src/render/codeWin.mjs', 'src/render/playgroundWin.mjs',
    'src/app.js',
];

export const buildRuntimeBundle = (rootDir) => RUNTIME_MODULES
    .map(rel => stripModuleSyntax(fs.readFileSync(path.join(rootDir, 'onboarding', rel), 'utf8')))
    .join('\n');

export const assemblePage = ({ style, runtime, dataJson, contentJson, diffBundle, footerHtml }) => {
    const shell = fs.readFileSync(path.join(HERE, 'src/shell.html'), 'utf8');
    return shell
        .replace('<!--SLOT:STYLE-->', () => style)
        .replace('<!--SLOT:DATA-->', () => `window.DOCTECT = {data: ${dataJson}, content: ${contentJson}};`)
        .replace('<!--SLOT:DIFF-->', () => diffBundle)
        .replace('<!--SLOT:RUNTIME-->', () => `(() => {\n${runtime}\n})();`)
        .replace('<!--SLOT:FOOTER-->', () => footerHtml);
};

export const buildContent = async () => {
    const { INTRO } = await import('./src/content/intro.mjs');
    const { TOURS } = await import('./src/content/tours.mjs');
    const { CODE_MAP } = await import('./src/content/code-map.mjs');
    const { PLAYGROUND } = await import('./src/content/playground.mjs');
    return { intro: INTRO, tours: TOURS, codeMap: CODE_MAP, playground: PLAYGROUND };
};

export const buildData = (rootDir, anchors = []) => {
    const tree = scanTree(rootDir);
    return { tree, vitals: collectVitals(rootDir, tree), excerpts: extractExcerpts(rootDir, anchors) };
};

export const main = async () => {
    const content = await buildContent();
    const data = buildData(REPO_ROOT, content.codeMap.anchors);
    const html = assemblePage({
        style: fs.readFileSync(path.join(HERE, 'src/style.css'), 'utf8'),
        runtime: buildRuntimeBundle(REPO_ROOT),
        // <-escape so no code excerpt or story containing "</script" (or any
        // tag) can terminate the inline <script> block. Valid JSON, parses identically.
        dataJson: JSON.stringify(data).replace(/</g, '\\u003c'),
        contentJson: JSON.stringify(content).replace(/</g, '\\u003c'),
        diffBundle: bundleDiffEngine(REPO_ROOT),
        footerHtml: `generated ${data.vitals.generatedAt} @ ${data.vitals.gitSha}`,
    });
    fs.writeFileSync(path.join(HERE, 'index.html'), html);
    console.log(`onboarding/index.html written (${(html.length / 1024).toFixed(0)} KB, @${data.vitals.gitSha})`);
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    await main();
}
```

Note: `buildContent` is async (dynamic imports) — callers always `await` it.

- [ ] **Step 6: Run tests, verify pass**

Run: `npx vitest run tests/unit/onboarding/`
Expected: PASS.

- [ ] **Step 7: Build the page, open it, commit**

Run: `node onboarding/build.mjs` then `ls -la onboarding/index.html`.
Sanity: `grep -c "SLOT:" onboarding/index.html` must print `0`.

```bash
git add onboarding/ tests/unit/onboarding/chrome.test.js
git commit -m "feat(onboarding): tmux chrome — windows, status bar, router, boot, help overlay; first assembled page"
```

---

### Task 4: Content validators + INTRO window (content + render)

**Files:**
- Create: `onboarding/src/content/validate.mjs`
- Modify: `onboarding/src/content/intro.mjs` (replace stub body), `onboarding/src/render/introWin.mjs` (replace stub body), `onboarding/build.mjs` (`main()` validates before assembling), `onboarding/src/style.css` (append intro styles)
- Test: `tests/unit/onboarding/content.test.js`
- Regenerate + commit: `onboarding/index.html`

**Interfaces:**
- Consumes: Tasks 1–3 exports; `CODE_MAP.anchors` (empty until Task 7 — validators must accept that).
- Produces: `validateContent(content, refs): string[]` where `refs = {filePaths: Set, dirPaths: Set, specFiles: Set}`, plus `buildRefs(rootDir): refs` exported from `build.mjs`. Later content tasks rely on `validateContent` catching their mistakes; their tests only add per-module counts.

- [ ] **Step 1: Write the failing tests**

```js
// tests/unit/onboarding/content.test.js
import { describe, it, expect } from 'vitest';
import { REPO_ROOT, buildRefs, buildContent } from '../../../onboarding/build.mjs';
import { validateContent } from '../../../onboarding/src/content/validate.mjs';
import { INTRO } from '../../../onboarding/src/content/intro.mjs';

const refs = buildRefs(REPO_ROOT);

describe('content integrity', () => {
    it('every content module is JSON-serializable and passes validation', async () => {
        const content = await buildContent();
        expect(JSON.parse(JSON.stringify(content))).toEqual(content);
        expect(validateContent(content, refs)).toEqual([]);
    });

    it('validators actually catch rot', () => {
        const broken = {
            intro: { ...INTRO, roundLabels: { 'not-a-real-spec.md': 'x' } },
            tours: [{ id: 't', title: 'T', blurb: 'b', diagram: ['{{a:A}}'],
                      steps: [{ text: 's', files: ['no/such/file.js'], highlight: ['a'] }] }],
            codeMap: { annotations: [{ path: 'also/missing.ts', note: 'n' }], deepDives: [], anchors: [] },
            playground: { quizLevels: [{ title: 'L', questions: [
                { q: 'q?', options: ['a', 'b', 'c'], answer: 9, why: 'w' }] }],
                bugHunt: [], mergeScenarios: [], wdil: [] },
        };
        const errors = validateContent(broken, refs);
        expect(errors.some(e => e.includes('not-a-real-spec.md'))).toBe(true);
        expect(errors.some(e => e.includes('no/such/file.js'))).toBe(true);
        expect(errors.some(e => e.includes('also/missing.ts'))).toBe(true);
        expect(errors.some(e => e.includes('4 options'))).toBe(true);
        expect(errors.some(e => e.includes('answer'))).toBe(true);
    });
});

describe('INTRO content', () => {
    it('is substantively filled', () => {
        expect(INTRO.about.length).toBeGreaterThanOrEqual(3);
        expect(INTRO.run.length).toBeGreaterThanOrEqual(5);
        expect(INTRO.houseMethod.stages.length).toBeGreaterThanOrEqual(6);
        expect(INTRO.houseMethod.catches.length).toBeGreaterThanOrEqual(3);
        expect(Object.keys(INTRO.roundLabels).length).toBeGreaterThanOrEqual(12);
    });
});
```

- [ ] **Step 2: Run tests, verify they fail**

Run: `npx vitest run tests/unit/onboarding/content.test.js`
Expected: FAIL — `buildRefs`/`validate.mjs` missing.

- [ ] **Step 3: Implement `validate.mjs` + `buildRefs`**

```js
// onboarding/src/content/validate.mjs
// Build-time + test-time guards. Not shipped into the page.
const push = (errors, cond, msg) => { if (cond) errors.push(msg); };

export const validateContent = (content, refs) => {
    const errors = [];
    const fileOk = (p) => refs.filePaths.has(p);
    const pathOk = (p) => refs.filePaths.has(p) || refs.dirPaths.has(p);
    const anchorIds = new Set((content.codeMap.anchors || []).map(a => a.id));

    // intro
    for (const [spec] of Object.entries(content.intro.roundLabels || {})) {
        push(errors, !refs.specFiles.has(spec), `intro.roundLabels: unknown spec "${spec}"`);
    }
    (content.intro.run || []).forEach((r, i) =>
        push(errors, !r.cmd || !r.note, `intro.run[${i}]: needs cmd + note`));

    // tours
    const tourIds = new Set();
    for (const tour of content.tours) {
        push(errors, tourIds.has(tour.id), `tours: duplicate id "${tour.id}"`);
        tourIds.add(tour.id);
        push(errors, !tour.title || !tour.blurb || !Array.isArray(tour.diagram),
            `tour ${tour.id}: title/blurb/diagram required`);
        const diagramText = (tour.diagram || []).join('\n');
        (tour.steps || []).forEach((step, i) => {
            push(errors, !step.text, `tour ${tour.id} step ${i}: empty text`);
            (step.files || []).forEach(f =>
                push(errors, !fileOk(f), `tour ${tour.id} step ${i}: missing file ${f}`));
            (step.highlight || []).forEach(h =>
                push(errors, !diagramText.includes(`{{${h}:`), `tour ${tour.id} step ${i}: highlight "${h}" not in diagram`));
            push(errors, step.anchorId && !anchorIds.has(step.anchorId),
                `tour ${tour.id} step ${i}: unknown anchor ${step.anchorId}`);
        });
        push(errors, (tour.steps || []).length < 4, `tour ${tour.id}: fewer than 4 steps`);
    }

    // code map
    for (const ann of content.codeMap.annotations) {
        push(errors, !pathOk(ann.path), `codeMap annotation: missing path ${ann.path}`);
        push(errors, !ann.note, `codeMap annotation ${ann.path}: empty note`);
    }
    for (const dive of content.codeMap.deepDives) {
        (dive.sections || []).forEach((s, i) => {
            push(errors, !s.text, `deep dive ${dive.id} section ${i}: empty text`);
            push(errors, s.anchorId && !anchorIds.has(s.anchorId),
                `deep dive ${dive.id} section ${i}: unknown anchor ${s.anchorId}`);
        });
    }
    for (const anchor of content.codeMap.anchors) {
        push(errors, !fileOk(anchor.file), `anchor ${anchor.id}: missing file ${anchor.file}`);
        push(errors, !anchor.start || (!anchor.lines && !anchor.end),
            `anchor ${anchor.id}: needs start and lines-or-end`);
    }

    // playground
    content.playground.quizLevels.forEach((level, li) => {
        (level.questions || []).forEach((q, qi) => {
            push(errors, (q.options || []).length !== 4, `quiz L${li} Q${qi}: needs 4 options`);
            push(errors, !(Number.isInteger(q.answer) && q.answer >= 0 && q.answer <= 3),
                `quiz L${li} Q${qi}: answer out of range`);
            push(errors, !q.why, `quiz L${li} Q${qi}: empty why`);
        });
    });
    const bugIds = new Set();
    for (const bug of content.playground.bugHunt) {
        push(errors, bugIds.has(bug.id), `bugHunt: duplicate id ${bug.id}`);
        bugIds.add(bug.id);
        const lineCount = (bug.code || '').split('\n').length;
        push(errors, !(Number.isInteger(bug.guiltyLine) && bug.guiltyLine >= 0 && bug.guiltyLine < lineCount),
            `bugHunt ${bug.id}: guiltyLine out of range`);
        push(errors, !bug.story, `bugHunt ${bug.id}: empty story`);
        push(errors, !fileOk(bug.fixedRef), `bugHunt ${bug.id}: missing fixedRef ${bug.fixedRef}`);
    }
    for (const s of content.playground.mergeScenarios) {
        push(errors, !s.name || !s.base || !s.fork || !s.upstream, `mergeScenario: incomplete ${s.name || '?'}`);
    }
    for (const w of content.playground.wdil) {
        push(errors, !w.prompt || !w.hint, `wdil ${w.id}: prompt+hint required`);
        push(errors, !(w.answers || []).length, `wdil ${w.id}: no answers`);
        (w.answers || []).forEach(a => push(errors, !fileOk(a), `wdil ${w.id}: missing answer path ${a}`));
    }
    return errors;
};
```

Append to `onboarding/build.mjs` (and wire into `main()` right after `buildContent()`):

```js
export const buildRefs = (rootDir) => {
    const tree = scanTree(rootDir);
    const filePaths = new Set();
    const dirPaths = new Set();
    const walk = (n) => {
        if (n.kind === 'file') filePaths.add(n.path);
        else { if (n.path) dirPaths.add(n.path); (n.children || []).forEach(walk); }
    };
    walk(tree);
    return { filePaths, dirPaths,
             specFiles: new Set(fs.readdirSync(path.join(rootDir, 'docs/superpowers/specs'))) };
};
```

In `main()`, after `const content = await buildContent();` insert:

```js
    const { validateContent } = await import('./src/content/validate.mjs');
    const errors = validateContent(content, buildRefs(REPO_ROOT));
    if (errors.length) {
        console.error('Content validation failed:\n' + errors.map(e => `  - ${e}`).join('\n'));
        process.exit(1);
    }
```

- [ ] **Step 4: Author `content/intro.mjs`** (replace stub body with exactly this)

```js
// onboarding/src/content/intro.mjs
// Authored content for the INTRO window. Data only — no functions.
export const INTRO = {
    about: [
        'PDF Architect is a local-first editor for structured PDF products — planners, journals, trackers, gamebooks — aimed at e-ink tablets (the flagship page size is the reMarkable Paper Pro’s 509×679 pt). A document is a hierarchy of nodes; each node renders through a template; templates carry elements (text, rectangles, lines, SVG artwork, dynamic grids, smart links); variants are alternate template sets over the same hierarchy — one document, many looks.',
        'Everything works without an account: projects live in browser localStorage and PDF export runs client-side through jsPDF. An account adds cloud saves (immutable, gzip’d full-snapshot commits), publishing to a public gallery, GitHub-style forking, and merge requests judged by a structured three-way diff — the same engine the server enforces at merge time.',
        'It is one repo with no monorepo tooling: the React 19 + Vite client sits at the root (components/, pages/, services/, hooks/), the Express 5 server in server/ (SQLite in dev, Postgres in prod, versioned run-once migrations), and shared/ holds plain-ESM code imported by both sides — most importantly the diff engine.',
        'Two production ideas dominate the codebase: nothing public ever tracks your private working head (publishing pins an explicit published commit), and nothing that came from someone else ever executes or renders unsanitized (the generator sandbox, DOMPurify at the single SVG render site).',
    ],
    run: [
        { cmd: 'npm run dev', note: 'Vite client :3000 + Express API :3001, concurrently' },
        { cmd: 'npm test', note: 'vitest unit suite (jsdom) — the ~1,850-test wall every round leans on' },
        { cmd: 'npm run test:e2e', note: 'Playwright end-to-end, Chromium + Firefox, boots its own server' },
        { cmd: 'node docs-capture/run.js <track>', note: 'regenerate the in-app docs screenshots from a live scripted app' },
        { cmd: 'node onboarding/build.mjs', note: 'regenerate this page from the current repo' },
        { cmd: 'npm run build', note: 'production client build into dist/, served by the Express fallback route' },
    ],
    houseMethod: {
        text: [
            'Every feature round runs the same pipeline: a brainstorm settles the design decisions, a spec records them (docs/superpowers/specs/), a plan breaks the work into bite-sized tasks (docs/superpowers/plans/), and each task is implemented test-first by a fresh worker who sees only that task’s brief — then independently reviewed before the next task starts. After all tasks land, one more review reads the whole branch as a single system.',
            'The whole-branch review exists because some bugs are structurally invisible to a per-task view. The proof is in the catches on the right — each was found only when someone looked at everything at once.',
        ],
        stages: ['brainstorm', 'spec', 'plan', 'implement (TDD, fresh worker per task)', 'independent per-task review', 'whole-branch review'],
        catches: [
            'A pre-existing unsanitized SVG path became stored cross-user XSS the moment publishing and forking existed — found by the first whole-branch review, fixed with DOMPurify at the one render site, verified with a live exploit before and after.',
            'The entire 108-file docs corpus was being statically imported into the main bundle and parsed on every route — a landing-page regression no docs task could see; fixed by lazy-loading the docs chunk.',
            'Profile pages silently lost every thumbnail: one task omitted the field, another added the defensive default that hid the crash, and no task owned the visual outcome. Caught whole-branch, fixed at the endpoint.',
        ],
    },
    roundLabels: {
        '2026-07-04-username-identity-design.md': 'Public username identity',
        '2026-07-04-login-redirect-and-gallery-pdf-download-design.md': 'Sign-in redirect + gallery zip download',
        '2026-07-05-gallery-detail-modal-design.md': 'Gallery projects as overlay modals',
        '2026-07-05-gallery-version-history-design.md': 'Public version history',
        '2026-07-06-gallery-v2-ratings-reviews-filters-design.md': 'Ratings, reviews, tag browsing',
        '2026-07-08-layers-panel-design.md': 'Named layers + stacked selection',
        '2026-07-09-password-policy-design.md': 'Password policy',
        '2026-07-09-email-verification-design.md': 'Email verification (and the dotenv seals)',
        '2026-07-13-generator-source-persistence-design.md': 'Generator source persistence + sandbox',
        '2026-07-16-account-moderation-design.md': 'Account moderation (audit triggers)',
        '2026-07-16-owner-moderator-authority-design.md': 'Owner above the moderators',
        '2026-07-18-text-overflow-rendering-design.md': 'Text overflow: one layout engine',
        '2026-07-19-signup-cap-waitlist-design.md': 'Signup cap + waitlist',
        '2026-07-19-docs-overhaul-design.md': 'The /docs documentation product',
        '2026-07-25-gallery-listing-editing-design.md': 'Editing a published listing',
        '2026-08-04-gallery-discoverability-design.md': 'Gallery discoverability redesign',
        '2026-08-06-gallery-all-projects-directory-design.md': 'All-projects directory',
        '2026-08-07-dev-onboarding-playground-design.md': 'This playground',
    },
};
```

- [ ] **Step 5: Implement `render/introWin.mjs`** (replace stub body)

```js
// onboarding/src/render/introWin.mjs
function pane(title, extraClass = '') {
    const section = document.createElement('section');
    section.className = `pane ${extraClass}`;
    section.innerHTML = `<div class="pane-title">${title}</div><div class="pane-body"></div>`;
    return { section, body: section.querySelector('.pane-body') };
}

export function renderIntro(el, ctx) {
    const { vitals } = ctx.data;
    const intro = ctx.content.intro;

    const about = pane('doctect · what this is', 'intro-about');
    about.body.innerHTML =
        intro.about.map(p => `<p>${p}</p>`).join('') +
        '<h3 class="accent">run it</h3><table class="cmds">' +
        intro.run.map(r => `<tr><td><code>${r.cmd}</code></td><td class="dim">${r.note}</td></tr>`).join('') +
        '</table>';

    const col = document.createElement('div');
    col.className = 'intro-col';

    const vit = pane('vitals · generated from this checkout');
    vit.body.innerHTML =
        `<table class="vitals">` +
        `<tr><td>unit-test files</td><td class="accent">${vitals.testFileCount}</td></tr>` +
        `<tr><td>migrations</td><td class="accent">${vitals.migrations.count}</td>` +
        `<td class="dim">latest ${vitals.migrations.last}</td></tr>` +
        `<tr><td>client schema</td><td class="accent">v${vitals.schemaVersion}</td></tr>` +
        `<tr><td>API endpoints</td><td class="accent">${vitals.routes.reduce((s, r) => s + r.endpoints.length, 0)}</td>` +
        `<td class="dim">${vitals.routes.length} route files</td></tr>` +
        `<tr><td>dependencies</td><td class="accent">${vitals.deps.runtime}</td>` +
        `<td class="dim">+${vitals.deps.dev} dev</td></tr></table>` +
        `<h3 class="accent">lines by area</h3><table class="vitals">` +
        vitals.areas.slice(0, 9).map(a =>
            `<tr><td>${a.dir}/</td><td class="dim">${a.files} files</td><td class="accent">${a.lines.toLocaleString()}</td></tr>`
        ).join('') + '</table>';

    const method = pane('the house method');
    method.body.innerHTML =
        intro.houseMethod.text.map(p => `<p>${p}</p>`).join('') +
        `<p class="accent">${intro.houseMethod.stages.join(' → ')}</p>` +
        '<h3 class="amber">catches only a whole-branch review makes</h3><ul>' +
        intro.houseMethod.catches.map(c => `<li>${c}</li>`).join('') + '</ul>' +
        '<h3 class="accent">rounds shipped</h3><ul class="timeline">' +
        [...vitals.specs].reverse().map(spec => {
            const label = intro.roundLabels[spec] ||
                spec.replace(/^\d{4}-\d{2}-\d{2}-/, '').replace(/-design\.md$/, '').replace(/-/g, ' ');
            return `<li><span class="dim">${spec.slice(0, 10)}</span> ${label}</li>`;
        }).join('') + '</ul>';

    col.append(vit.section, method.section);
    el.append(about.section, col);
}
```

Append to `style.css`:

```css
/* intro window */
.intro-about { flex: 1.2; }
.intro-col { flex: 1; display: flex; flex-direction: column; gap: 8px; min-width: 0; }
.intro-col .pane { flex: 1; }
.pane-body p { margin-bottom: 0.8em; }
.pane-body h3 { margin: 1em 0 0.5em; font-size: 13px; }
.pane-body ul { margin-left: 1.2em; }
.pane-body li { margin-bottom: 0.5em; }
table.cmds td, table.vitals td { padding: 2px 10px 2px 0; vertical-align: top; }
ul.timeline { list-style: none; margin-left: 0; }
ul.timeline li { margin-bottom: 2px; }
```

- [ ] **Step 6: Run tests, verify pass; full suite**

Run: `npx vitest run tests/unit/onboarding/` then `npx vitest run`
Expected: PASS; suite green.

- [ ] **Step 7: Rebuild page, spot-check, commit**

Run: `node onboarding/build.mjs`
Spot-check: `grep -c "house method" onboarding/index.html` ≥ 1.

```bash
git add onboarding/ tests/unit/onboarding/content.test.js
git commit -m "feat(onboarding): content validators and the INTRO window (about, vitals, house method, timeline)"
```

---

### Task 5: TOURS window — six data-flow stories with highlighting diagrams

**Files:**
- Modify: `onboarding/src/content/tours.mjs` (replace stub body), `onboarding/src/render/toursWin.mjs` (replace stub body), `onboarding/src/style.css` (append), `tests/unit/onboarding/content.test.js` (append block)
- Regenerate + commit: `onboarding/index.html`

**Interfaces:**
- Consumes: `validateContent` (Task 4), router contract `#/tours/<tourId>/<stepIdx>`.
- Produces: `TOURS: [{id, title, blurb, diagram: string[], steps: [{text, files: string[], highlight: string[]}]}]`. Diagram tokens `{{id:label}}` become `<span class="diag" data-d="id">label</span>`; a step's `highlight` lists the token ids to light up. Task 6's code window must accept `#/code/<path>` navigation from the files strip.

- [ ] **Step 1: Append the failing test block to `content.test.js`**

```js
import { TOURS } from '../../../onboarding/src/content/tours.mjs';

describe('TOURS content', () => {
    it('ships the six spec tours', () => {
        expect(TOURS.map(t => t.id)).toEqual(
            ['local-first', 'cloud-save', 'publish', 'fork-merge', 'pdf-export', 'signup']);
        for (const tour of TOURS) {
            expect(tour.steps.length).toBeGreaterThanOrEqual(5);
            expect(tour.diagram.length).toBeGreaterThanOrEqual(4);
            expect(tour.steps.every(s => s.files.length >= 1)).toBe(true);
        }
    });
});
```

Run: `npx vitest run tests/unit/onboarding/content.test.js` — expected FAIL (stub is empty).

- [ ] **Step 2: Author `content/tours.mjs`** (replace stub body with exactly this)

```js
// onboarding/src/content/tours.mjs
// Six guided data-flow stories. Diagram tokens: {{id:label}} — steps light them
// up via their `highlight` lists. `files` are repo paths (existence is tested).
export const TOURS = [
    {
        id: 'local-first',
        title: 'Local-first: a project’s life in the browser',
        blurb: 'No account, no server — the whole editor runs against one JSON document in localStorage.',
        diagram: [
            '{{ui:EditorPage}} ──edits──▶ {{state:AppState (schema v11)}}',
            '      │                          │         │',
            '      ▼                          ▼         ▼',
            '{{canvas:DOM canvas}}      {{ls:localStorage}}  {{gen:generator scripts}}',
            '      │                          │',
            '      ▼                          ▼',
            '{{pdf:jsPDF export}}       {{mig:migrate vN → v11 on load}}',
        ],
        steps: [
            { text: 'Everything the editor knows is one JSON document: AppState. Nodes form the page hierarchy, variants hold template sets, templates hold elements, layers tag elements without restructuring them, and an optional generator block carries the scripts that produced the document.',
              files: ['types.ts'], highlight: ['state'] },
            { text: 'The canvas is not a <canvas> — it is absolutely-positioned DOM. That choice is why thumbnails need the PDF pipeline (you cannot screenshot a DOM canvas), and why editor chrome uses an isolation:isolate wrapper so user z-indexes can never paint over selection boxes.',
              files: ['components/ProjectEditor.tsx', 'components/canvas/CanvasElement.tsx'], highlight: ['ui', 'canvas'] },
            { text: 'Projects persist to localStorage on every change. Cloud is opt-in and explicit — there is no silent auto-sync, by design decision from the very first gallery brainstorm.',
              files: ['services/loadProjectState.ts'], highlight: ['ls'] },
            { text: 'On load, documents migrate v1 → v11 one version at a time. Two silent traps live here: presets and generator imports stamp CURRENT_SCHEMA_VERSION, so both paths must apply new-version tagging themselves (the layers round hit exactly this).',
              files: ['services/migration.ts', 'services/presets.ts'], highlight: ['mig'] },
            { text: 'PDF export runs entirely client-side through jsPDF — and shares its text layout decisions with the canvas through one engine, so what you see is what prints (that parity was a whole round of work).',
              files: ['services/pdfService.ts', 'services/textLayout.ts'], highlight: ['pdf'] },
            { text: 'The Hierarchy Generator describes a whole product as two JavaScript programs. Since schema v9 they persist inside AppState — and because opening someone else’s project must never execute their code, preview runs in a sandboxed iframe + disposable worker, never in the app realm.',
              files: ['components/HierarchyGeneratorModal.tsx', 'services/generatorSandbox.ts'], highlight: ['gen'] },
        ],
    },
    {
        id: 'cloud-save',
        title: 'Save to cloud: commits and the If-Match dance',
        blurb: 'Every save is an immutable full snapshot; heads advance by compare-and-swap.',
        diagram: [
            '{{menu:CloudMenu}} ─▶ {{api:cloudApi.ts}} ─▶ {{route:POST /api/projects/:id/commits}}',
            '                                              │ If-Match: <head tag>',
            '                                              ▼',
            '{{val:validateAppState}} ─▶ {{codec:stateCodec gzip}} ─▶ {{cas:CAS head advance}}',
            '                                              │ stale? ──▶ {{409:409 conflict}}',
        ],
        steps: [
            { text: 'The Cloud menu is a three-way branch: signed out, signed in without a username, signed in with one. The username gate exists because every commit carries a public handle — and it is deliberately absent from routes that only reduce exposure (unpublish, delete), so legacy accounts can always clean up.',
              files: ['components/cloud/CloudMenu.tsx'], highlight: ['menu'] },
            { text: 'Every server call the cloud features make goes through one typed wrapper: services/cloudApi.ts. When you add an endpoint, it gets a function here — no fetch calls scattered through components.',
              files: ['services/cloudApi.ts'], highlight: ['api'] },
            { text: 'A commit is a full snapshot, not a diff — that decision (made before any code) is why version history, restore, fork, and merge are all simple reads of one row.',
              files: ['server/routes/projects.js'], highlight: ['route'] },
            { text: 'Before anything is stored, validateAppState checks shape, a 5 MB size cap, and node/element count caps. Every write path funnels through it — saves, publishes, merges.',
              files: ['server/validateAppState.js'], highlight: ['val'] },
            { text: 'Snapshots are gzip’d by stateCodec on write and inflated on read. Commits carry an app-generated millisecond timestamp because SQLite’s CURRENT_TIMESTAMP has whole-second resolution — two saves in one second used to make “newest first” a coin flip.',
              files: ['server/stateCodec.js'], highlight: ['codec'] },
            { text: 'Saves carry a strong If-Match head tag; the server advances the head by transactional compare-and-swap. A stale save gets a stable 409 and leaves no orphan commit. CORS had to explicitly admit the If-Match header for any of this to work cross-origin.',
              files: ['server/routes/projects.js', 'server/projectLocks.js'], highlight: ['cas', '409'] },
        ],
    },
    {
        id: 'publish',
        title: 'Publish: the pinned snapshot',
        blurb: 'Public means the version you published — never your live working head.',
        diagram: [
            '{{wizard:PublishModal}} ─▶ {{thumbs:thumbnails: jsPDF → pdfjs → WebP}}',
            '        │',
            '        ▼',
            '{{pub:POST …/publish}} ─ validate → lock → write ─▶ {{pin:published_commit_id}}',
            '        │                                             ▲',
            '{{edit:PATCH …/publication}} ── metadata only, never moves ┘',
            '{{gal:gallery readers}} ──── only ever see the pin',
        ],
        steps: [
            { text: 'The publish wizard collects a description, tags, and up to six preview pages, and renders the previews live before you commit to anything. Preview selection re-renders from the published commit — never from your working state — so the shop window can never advertise a page the download doesn’t contain.',
              files: ['components/cloud/PublishModal.tsx', 'components/cloud/PreviewPagePicker.tsx'], highlight: ['wizard'] },
            { text: 'Thumbnails exist because the DOM canvas can’t be screenshotted: render to an in-memory PDF (jsPDF), rasterize with pdfjs-dist, downscale to WebP. The server re-validates every image by magic bytes and caps them at 300 KB.',
              files: ['services/thumbnailService.ts'], highlight: ['thumbs'] },
            { text: 'Publishing validates, locks, and writes inside one transaction (withTransaction pins a Postgres client and serializes SQLite under BEGIN IMMEDIATE).',
              files: ['server/routes/projects.js', 'server/projectLocks.js'], highlight: ['pub'] },
            { text: 'The load-bearing column: published_commit_id. Ordinary saves and merges advance only the private head; public content changes only on explicit republish. This model exists because a whole-branch review caught gallery readers being served the live head — a disclosure hazard once generator source became public.',
              files: ['server/migrations/index.js'], highlight: ['pin'] },
            { text: 'Listing metadata (name, description, tags) is pinned at publish time too — privately renaming a project stopped silently renaming its gallery card. A later round added PATCH /api/projects/:id/publication: edit the listing without republishing, guarded by a composite If-Match token (published_commit_id AND published_at, because republishing an unchanged commit is legal).',
              files: ['server/routes/projects.js', 'components/cloud/EditListingModal.tsx'], highlight: ['edit'] },
            { text: 'Everything a gallery reader touches — detail, download, open-in-editor, fork — resolves the published commit. “Recently updated” sorts by published_at, which metadata edits deliberately never move: keeping a listing tidy must not be free promotion.',
              files: ['server/routes/gallery.js'], highlight: ['gal'] },
        ],
    },
    {
        id: 'fork-merge',
        title: 'Fork → merge request: the three-way diff at work',
        blurb: 'The same 189-line plain-JS engine renders the diff in the client and enforces it on the server.',
        diagram: [
            '{{up:upstream (public)}} ──fork──▶ {{fork:private fork + lineage}}',
            '     │  base = common ancestor         │ edits, saves',
            '     ▼                                 ▼',
            '{{mr:merge request}} ◀──propose── {{head:fork head commit}}',
            '     │ diff recomputed LIVE on every view',
            '     ▼',
            '{{tw:threeWayDiff}} ─ conflicts? ─▶ {{merge:merge under lock}} / {{block:refuse}}',
        ],
        steps: [
            { text: 'Forking a public project — including your own — copies the published commit into a brand-new private project, recording exactly which project and commit it came from. Forks never appear in the gallery.',
              files: ['server/routes/projects.js'], highlight: ['up', 'fork'] },
            { text: 'A merge request proposes the fork’s head back upstream. The review page shows a structured change list — templates and variants, not text lines — plus a rendered before/after preview.',
              files: ['server/routes/mergeRequests.js', 'pages/MergeRequestPage.tsx'], highlight: ['mr', 'head'] },
            { text: 'The diff is recomputed live every time the request is viewed — never a stale snapshot — so a request that becomes conflicted after the fact (upstream changed the same thing) is caught before anyone clicks merge.',
              files: ['server/routes/mergeRequests.js'], highlight: ['mr'] },
            { text: 'threeWayDiff compares the fork’s changes and upstream’s changes against their common ancestor. Genuine conflicts: same template edited differently, removed-on-one-side-modified-on-the-other, both sides changing the node hierarchy differently, and the generator — treated as one atomic value, never line-merged.',
              files: ['shared/diff.js'], highlight: ['tw'] },
            { text: 'Merging re-verifies no conflict immediately before writing, inside the same lock that pins the target head, refuses already-merged/closed requests, and runs the merged result back through validateAppState. The Merge button’s visibility comes from the server’s own isTargetOwner — the client once guessed “whoever isn’t the author” and broke on self-forks.',
              files: ['server/routes/mergeRequests.js', 'server/validateAppState.js'], highlight: ['merge', 'block'] },
            { text: 'A schema mismatch between fork and upstream deliberately blocks the diff until the fork re-saves on the current version — the engine ignored layers, overflow, and padding schema changes entirely because it diffs whole templates.',
              files: ['shared/diff.js', 'services/migration.ts'], highlight: ['tw'] },
        ],
    },
    {
        id: 'pdf-export',
        title: 'Export: one text engine, two renderers',
        blurb: 'Canvas and PDF used to each do their own text layout. Neither respected the box.',
        diagram: [
            '{{req:element + box}} ─▶ {{engine:textLayout.ts (pure)}}',
            '                          │ segmentation · wrap · ellipsis · shrink',
            '            ┌─────────────┴─────────────┐',
            '            ▼                           ▼',
            '{{cadapt:canvas adapter}}         {{padapt:jsPDF adapter}}',
            '            ▼                           ▼',
            '{{dom:DOM canvas}}                {{doc:exported PDF}}  + {{svg:svg2pdf normalization}}',
        ],
        steps: [
            { text: 'services/textLayout.ts is renderer-independent: segmentation, greedy wrap, ellipsis, shrink-to-fit, block sizing — with text measurement injected, so the same decisions run everywhere. Four overflow modes (clip, ellipsis, shrink, visible) plus an independent wrap toggle.',
              files: ['services/textLayout.ts', 'services/textOverflow.ts'], highlight: ['engine'] },
            { text: 'Two thin adapters: one over an offscreen canvas context, one over jsPDF width metrics. A parity suite feeds both identical fake metrics and asserts identical lines, truncation, and clip flags.',
              files: ['services/canvasTextLayout.ts', 'services/pdfTextLayout.ts'], highlight: ['cadapt', 'padapt'] },
            { text: 'Quiet correctness lives here: the ellipsis search was a binary search over grapheme counts — which assumes measured width is monotonic in count; it isn’t guaranteed to be, so it became a linear scan. Greedy wrap was O(n²) re-measuring whole candidate lines and was rewritten single-pass, with tests asserting bounded measure-call counts.',
              files: ['services/textLayout.ts', 'services/graphemes.ts'], highlight: ['engine'] },
            { text: 'Text padding: one 87-line geometry function, resolveTextContentBox, shrinks the box before the engine ever sees it. Canvas, the inline overlay editor, and PDF all consume the same content box.',
              files: ['services/textPadding.ts'], highlight: ['req'] },
            { text: 'SVG export is a tree-transform pipeline before svg2pdf sees anything: hsl()/8-digit-hex normalized to rgb + opacity attributes (svg2pdf silently drops what it can’t parse), element opacity baked into the SVG’s own opacity scopes (svg2pdf replaces outer alpha rather than multiplying), grayscale as a desaturation pass with the full CSS named-color table.',
              files: ['services/svgColorNormalize.ts'], highlight: ['svg'] },
            { text: 'Link annotations became a helper called from every element branch after svg and line elements silently skipped them — the shared doc.link() block sat below a continue. Byte-level tests read the annotations back out of the produced PDF.',
              files: ['services/pdfService.ts'], highlight: ['doc'] },
        ],
    },
    {
        id: 'signup',
        title: 'A signup’s journey',
        blurb: 'better-auth with app-owned choke points: cap, verification, username, admin-path denial.',
        diagram: [
            '{{form:signup form / Google OAuth}} ─▶ {{auth:better-auth /api/auth/*}}',
            '                                        │ databaseHooks.user.create.before',
            '                                        ▼',
            '{{cap:signup cap check}} ─ full? ─▶ {{wait:waitlist panel}}',
            '     │ open',
            '     ▼',
            '{{verify:email verification}} ─▶ {{welcome:/welcome username gate}} ─▶ {{gated:content-creating routes}}',
        ],
        steps: [
            { text: 'better-auth mounts at /api/auth before express.json — its handler consumes its own bodies. Everything app-specific hangs off hooks, not forked library code.',
              files: ['server/auth.js', 'server/app.js'], highlight: ['auth'] },
            { text: 'The signup cap lives in databaseHooks.user.create.before — the single choke point both email signup and first-time Google OAuth pass through; returning OAuth users never create a row, so they never hit it. Path-based middleware was rejected for exactly that OAuth blind spot.',
              files: ['server/auth.js', 'server/signupCap.js'], highlight: ['cap'] },
            { text: 'Only verified accounts count toward the cap, and the counter fails open by design: a broken count query must not lock the front door. The waitlist endpoint treats duplicates as idempotent success so it never reveals membership.',
              files: ['server/signupCap.js'], highlight: ['cap', 'wait'] },
            { text: 'Email delivery is one fail-safe module: Resend’s HTTP API when a key is configured, console logging when not — and a missing key never weakens sign-in blocking. The dotenv seals (present-but-empty, never delete) guard every test/tooling surface from sending real mail.',
              files: ['server/email.js'], highlight: ['verify'] },
            { text: 'Accounts can exist with username = null (OAuth, legacy). /welcome blocks content creation until one is set; requireUsername guards exactly the five routes that create or attach public content — and deliberately not unpublish/delete/merge-close, so a legacy account can always clean up its own data.',
              files: ['pages/WelcomePage.tsx', 'server/middleware/guards.js'], highlight: ['welcome', 'gated'] },
            { text: 'hooks.before also denies /admin/* inside better-auth — where it sees the normalized path. Express-level blocking was bypassable with percent-encoded dot-segments that normalized back to /admin/* inside the library; red tests proved unban and role promotion answered 200 to a non-admin before the fix.',
              files: ['server/auth.js'], highlight: ['auth'] },
        ],
    },
];
```

- [ ] **Step 3: Implement `render/toursWin.mjs`** (replace stub body)

```js
// onboarding/src/render/toursWin.mjs
function tourPane(title, cls) {
    const s = document.createElement('section');
    s.className = 'pane ' + cls;
    s.innerHTML = `<div class="pane-title">${title}</div><div class="pane-body"></div>`;
    return { s, body: s.querySelector('.pane-body') };
}

function renderDiagram(lines, highlight) {
    const html = lines.map(l => l.replace(/\{\{([a-z0-9-]+):([^}]*)\}\}/g, (_, id, label) =>
        `<span class="diag${highlight.includes(id) ? ' lit' : ''}" data-d="${id}">${label}</span>`))
        .join('\n');
    return `<pre class="diagram">${html}</pre>`;
}

export function renderTours(el, ctx) {
    const tours = ctx.content.tours;
    const [tourId, stepStr] = ctx.route.parts;
    const tour = tours.find(t => t.id === tourId) || tours[0];
    const stepIdx = Math.min(Math.max(Number(stepStr) || 0, 0), tour.steps.length - 1);
    const step = tour.steps[stepIdx];

    const list = tourPane('tours', 'tours-list');
    list.body.innerHTML =
        '<ul class="tour-index">' + tours.map(t =>
            `<li class="${t.id === tour.id ? 'active' : ''}"><a href="#/tours/${t.id}/0">${t.title}</a></li>`
        ).join('') + '</ul>' +
        `<p class="dim">${tour.blurb}</p>` +
        '<ol class="tour-steps">' + tour.steps.map((s, i) =>
            `<li class="${i === stepIdx ? 'active' : ''}"><a href="#/tours/${tour.id}/${i}">` +
            `${s.text.slice(0, 64)}…</a></li>`).join('') + '</ol>';

    const stage = tourPane(tour.title, 'tours-stage');
    stage.body.innerHTML =
        renderDiagram(tour.diagram, step.highlight) +
        `<p class="tour-text">${step.text}</p>` +
        '<div class="files-strip">files: ' + step.files.map(f =>
            `<a href="#/code/${f}"><code>${f}</code></a>`).join(' · ') + '</div>' +
        `<div class="tour-nav">` +
        (stepIdx > 0 ? `<a href="#/tours/${tour.id}/${stepIdx - 1}">◀ prev</a>` : '<span></span>') +
        `<span class="dim">${stepIdx + 1}/${tour.steps.length}</span>` +
        (stepIdx < tour.steps.length - 1 ? `<a href="#/tours/${tour.id}/${stepIdx + 1}">next ▶</a>` : '<span></span>') +
        '</div>';

    el.append(list.s, stage.s);
}
```

Append to `style.css`:

```css
/* tours window */
.tours-list { flex: 1; max-width: 420px; }
.tours-stage { flex: 2; }
ul.tour-index { list-style: none; margin: 0 0 1em 0; }
ul.tour-index li.active a { color: #e3c67c; }
ol.tour-steps { margin-left: 1.4em; }
ol.tour-steps li.active a { color: #e3c67c; }
pre.diagram { background: #0e1310; border: 1px solid #2a352c; padding: 14px; overflow-x: auto;
    line-height: 1.6; margin-bottom: 1em; }
.diag { color: #7d8a7a; border: 1px solid #2a352c; padding: 0 4px; }
.diag.lit { color: #0c0f0d; background: #7ce38b; border-color: #7ce38b; }
.tour-text { max-width: 72ch; }
.files-strip { margin-top: 1em; color: #7d8a7a; }
.tour-nav { display: flex; justify-content: space-between; margin-top: 1.4em; }
```

- [ ] **Step 4: Run tests, verify pass; rebuild; commit**

Run: `npx vitest run tests/unit/onboarding/ && node onboarding/build.mjs`
Expected: PASS; page rebuilt (validator would fail the build on any bad path/highlight).

```bash
git add onboarding/ tests/unit/onboarding/content.test.js
git commit -m "feat(onboarding): six guided tours with highlighting diagrams and code cross-links"
```

---

### Task 6: CODE window — annotated file tree + detail pane

**Files:**
- Modify: `onboarding/src/content/code-map.mjs` (fill `annotations`; `deepDives`/`anchors` stay `[]` for Task 7), `onboarding/src/render/codeWin.mjs` (replace stub body), `onboarding/src/style.css` (append), `tests/unit/onboarding/content.test.js` (append block)
- Regenerate + commit: `onboarding/index.html`

**Interfaces:**
- Consumes: `filterTree`, `findNode`, `nearestAnnotated`, `formatBytes` (Task 3); route `#/code/<path…>`.
- Produces: `CODE_MAP.annotations: [{path, note, detail?}]`; `renderCode` renders a `<nav class="tree">` whose file links use `#/code/<path>` and an `<input data-search>` (the `/` key target). Task 7 extends this same render with deep dives; Task 11 reuses the tree markup builder — export `treeHtml(node, selectedPath, openPaths)` from `codeWin.mjs` for it.

- [ ] **Step 1: Append the failing test block to `content.test.js`**

```js
import { CODE_MAP } from '../../../onboarding/src/content/code-map.mjs';

describe('CODE_MAP annotations', () => {
    it('covers the load-bearing surface', () => {
        expect(CODE_MAP.annotations.length).toBeGreaterThanOrEqual(40);
        const annotated = new Set(CODE_MAP.annotations.map(a => a.path));
        for (const must of ['components', 'pages', 'services', 'server', 'shared', 'tests',
            'server/routes/projects.js', 'shared/diff.js', 'services/textLayout.ts',
            'server/auth.js', 'components/canvas/CanvasElement.tsx', 'types.ts']) {
            expect(annotated.has(must), `missing annotation for ${must}`).toBe(true);
        }
    });
});
```

Run: `npx vitest run tests/unit/onboarding/content.test.js` — expected FAIL.

- [ ] **Step 2: Author the annotations** (replace `code-map.mjs` stub body; `deepDives: []`, `anchors: []` remain)

```js
// onboarding/src/content/code-map.mjs
export const CODE_MAP = {
    annotations: [
        // directories
        { path: 'components', note: 'React UI — editor shell, canvas, panels, modals; feature subdirs (cloud, gallery, canvas, properties, sidebar, docs, moderation).' },
        { path: 'pages', note: 'Route-level components. EditorPage is the product; everything else orbits it.' },
        { path: 'services', note: 'Client logic kept DOM-light: PDF export, text layout, schema migrations, typed API wrapper, generator sandbox.' },
        { path: 'server', note: 'Express 5 API. app.js is the createApp() factory; index.js just boots it. SQLite in dev, Postgres in prod.' },
        { path: 'server/routes', note: 'All endpoints in five files (+2 moderation-era files). Rounds add endpoints to existing files — a new route file is rare and deliberate.' },
        { path: 'server/migrations', note: 'The migration ledger (index.js). NEVER edit an applied migration — append a new one. Two migrations are database triggers.' },
        { path: 'server/middleware', note: 'checkOrigin (CSRF), rate limits, requireAdmin/requireOwner (live config membership on every request), requireUsername.' },
        { path: 'shared', note: 'Plain ESM imported by BOTH client and server — the three-way diff engine and generator provenance rules.' },
        { path: 'hooks', note: 'Two React hooks: useCurrentUser (session) and useGalleryDetail (shared by gallery page + modal).' },
        { path: 'lib', note: 'Docs content loading/validation/search + the better-auth browser client.' },
        { path: 'tests', note: 'Component vitest suites flat in tests/unit, server suites in tests/unit/server, Playwright e2e in tests/e2e, shared helpers (incl. the gallery-sample harness) in tests/helpers.' },
        { path: 'docs-content', note: 'The in-app /docs product: 25 tutorials + 83 reference entries as markdown, validated at load — a bad link fails the unit suite.' },
        { path: 'docs-capture', note: 'Committed Playwright pipeline that regenerates all 64 docs screenshots deterministically (node docs-capture/run.js <track>).' },
        { path: 'tutorial', note: 'The video-tutorial production pipeline: storyboards, Chirp narration, paced recording, ffmpeg assembly.' },
        { path: 'gallery-samples', note: '20 flagship sample products as generator scripts, validated by a committed harness (structure, links, bounds, example chrome).' },
        { path: 'docs/superpowers', note: 'Specs and plans for every round — the paper trail of the house method. Read a spec before touching its feature.' },
        { path: 'public', note: 'Static assets, including the long-form project walkthrough this playground is distilled from.' },
        { path: 'scripts', note: 'Utility scripts (lighthouse audit runner).' },
        { path: 'onboarding', note: 'This playground: authored src/ + build.mjs assembling the committed index.html you are reading.' },
        // client files
        { path: 'App.tsx', note: 'All routes, statically imported (one main chunk by design; only /docs and the listing editor are lazy). The gallery modal’s background-location split lives here.' },
        { path: 'index.tsx', note: 'Client entry — mounts App under the router.' },
        { path: 'types.ts', note: 'AppState and every document type. Start reading the codebase here.' },
        { path: 'components/ProjectEditor.tsx', note: 'Editor shell: toolbar, canvas, right-hand panels, selection model, undo checkpoints.' },
        { path: 'components/Canvas.tsx', note: 'The DOM canvas (not <canvas>): pages, marquee, drag. Hit-testing delegates to services/hitTest.ts.' },
        { path: 'components/canvas/CanvasElement.tsx', note: 'Single element renderer — including THE DOMPurify.sanitize call, the one place foreign SVG ever reaches the DOM.' },
        { path: 'components/HierarchyGeneratorModal.tsx', note: 'Generator modal: two script editors, sandboxed Preview, atomic Apply, Saved Generator badge.' },
        { path: 'components/LayersPanel.tsx', note: 'Layers: hide/lock/color/rename/drag-reorder; hidden = excluded from canvas, PDF and thumbnails via one shared filter.' },
        { path: 'components/cloud/CloudMenu.tsx', note: 'Save/history/publish menu; the signed-out / no-username / ready 3-way branch; forked-from indicator.' },
        { path: 'components/cloud/PublishModal.tsx', note: 'Publish wizard. Compares rendered previews against picked pages and refuses partial sets.' },
        { path: 'components/cloud/EditListingModal.tsx', note: 'Edit a published listing without republishing; carries the composite If-Match token.' },
        { path: 'components/gallery/ProjectCard.tsx', note: 'The shared card with rollover previews — gallery, profile, and directory all render this one component.' },
        { path: 'pages/EditorPage.tsx', note: 'Route wrapper that anchors the pdf.js-heavy chunk (EditorPage → CloudMenu → PublishModal → thumbnailService).' },
        { path: 'pages/GalleryPage.tsx', note: 'Three modes in one page: sections view, URL-param filtered grid, ?view=all sortable directory.' },
        { path: 'pages/MergeRequestPage.tsx', note: 'MR review: structured change list, conflict warnings, before/after preview; owner state comes from the server’s isTargetOwner.' },
        // server files
        { path: 'server/app.js', note: 'createApp() factory. Middleware order is load-bearing: helmet → cors → host allow-list → auth (before express.json!) → origin check → rate limit → routes → SPA fallback.' },
        { path: 'server/index.js', note: 'Boot: run migrations, then listen. Production refuses to boot with OWNER_EMAILS empty.' },
        { path: 'server/auth.js', note: 'better-auth config. The hooks are the choke points: signup cap, password policy, admin-path denial (normalized-path bypass fix).' },
        { path: 'server/db.js', note: 'query() working identically on Postgres and SQLite. Replaced a DROP TABLE CASCADE dev bootstrap — the first thing the gallery work fixed.' },
        { path: 'server/migrations.js', note: 'Run-once migration runner: advisory-locked, transactional, with a test that injects mid-migration failure and watches rollback.' },
        { path: 'server/migrations/index.js', note: 'All 16+ migrations inline, pg + sqlite variants. 012/013 are BEFORE INSERT triggers refusing sessions for suspended users.' },
        { path: 'server/routes/projects.js', note: 'The big file: CRUD, commits, publish, publication PATCH, fork. The CAS save and published-commit pinning idioms live here.' },
        { path: 'server/routes/gallery.js', note: 'Public reads, reviews, tags, reports. The LIKE … ESCAPE wildcard fix is here.' },
        { path: 'server/routes/mergeRequests.js', note: 'MR lifecycle: live diff recompute per view, merge re-verified under the target-head lock.' },
        { path: 'server/middleware/guards.js', note: 'requireUsername guards exactly the five content-creating routes; requireAdmin/requireOwner check live config membership, never trusting a stored role.' },
        { path: 'server/validateAppState.js', note: 'Structural gate for every stored AppState: shape, 5 MB cap, node/element caps.' },
        { path: 'server/stateCodec.js', note: 'gzip encode/decode for full-snapshot commits.' },
        { path: 'server/projectLocks.js', note: 'withTransaction + lockProjectRows — the write-path integrity layer every later round leans on.' },
        { path: 'server/email.js', note: 'Resend-or-console fail-safe email. A missing key never weakens sign-in blocking. First of the dotenv seals.' },
        { path: 'server/signupCap.js', note: 'Verified-only cap counting, fails open; SIGNUP_CAP trimmed first because Number(" ") === 0 once meant “closed”.' },
        { path: 'server/ownerAuthority.js', note: 'OWNER_EMAILS reconciliation — the only root of trust for the owner role; no HTTP path grants it.' },
        { path: 'server/platformAudit.js', note: 'Append-only audit writes; an audit-insert failure rolls back the action it was recording.' },
        // services + shared
        { path: 'services/cloudApi.ts', note: 'One typed wrapper for every server endpoint. New endpoint ⇒ new function here.' },
        { path: 'services/migration.ts', note: 'CURRENT_SCHEMA_VERSION and the v1→v11 chain. Presets and generator imports must stamp versions explicitly.' },
        { path: 'services/textLayout.ts', note: 'The renderer-independent text engine: segmentation, wrap, ellipsis, shrink — measurement injected.' },
        { path: 'services/pdfService.ts', note: 'jsPDF export: Unicode font embedding, link annotations from every branch, svg2pdf, grayscale.' },
        { path: 'services/thumbnailService.ts', note: 'jsPDF → pdfjs-dist → WebP preview pipeline (pdfjs pinned after npm latest shipped broken).' },
        { path: 'services/generatorSandbox.ts', note: 'The generator trust boundary: sandboxed iframe, disposable worker, captured intrinsics, 10 s timeout.' },
        { path: 'shared/diff.js', note: 'The three-way diff/merge engine — 189 lines, no dependencies, imported by client and server. This playground bundles the real thing (Merge Lab).' },
        { path: 'shared/generatorMetadata.js', note: 'Generator provenance shape + size caps, shared by validator, diff, and client.' },
        // meta
        { path: 'deploy.sh', note: 'Fail-closed deploy script — with its own unit tests, after review found it plowing on past failed builds.' },
        { path: 'SCHEMA_CHANGELOG.md', note: 'Schema history through v10 (v11 shipped without its entry — a documented, honest residual).' },
        { path: 'playwright.config.cjs', note: 'e2e config; carries one of the dotenv seals (present-but-empty RESEND_API_KEY).' },
        { path: 'vite.config.ts', note: 'Vite + vitest config: jsdom env, worktree/scratch excludes explained in comments.' },
        { path: 'tests/helpers/gallerySampleHarness.ts', note: 'Executes both generator scripts of every sample product exactly the way the modal does, then validates structure, links, bounds.' },
    ],
    deepDives: [],
    anchors: [],
};
```

- [ ] **Step 3: Implement `render/codeWin.mjs`** (replace stub body)

```js
// onboarding/src/render/codeWin.mjs
// The import is stripped in the shipped bundle (shared IIFE scope) but is
// REQUIRED for vitest, which imports this module as real ESM.
import { formatBytes, filterTree, findNode, flattenDirs, nearestAnnotated } from '../app-logic.mjs';

export function treeHtml(node, selectedPath, openPaths) {
    if (node.kind === 'file') {
        const sel = node.path === selectedPath ? ' selected' : '';
        return `<li><a class="tree-file${sel}" href="#/code/${node.path}">${node.name}` +
               `<span class="dim"> ${formatBytes(node.size)}</span></a></li>`;
    }
    const open = openPaths.has(node.path) || node.path === '' ? ' open' : '';
    const inner = (node.children || []).map(c => treeHtml(c, selectedPath, openPaths)).join('');
    if (node.path === '') return `<ul class="tree-root">${inner}</ul>`;
    return `<li><details${open}><summary>${node.name}/</summary><ul>${inner}</ul></details></li>`;
}

function ancestorsOf(path) {
    const out = new Set();
    let p = path;
    while (p.includes('/')) { p = p.slice(0, p.lastIndexOf('/')); out.add(p); }
    if (path) out.add(path.split('/')[0]);
    return out;
}

function detailHtml(ctx, selectedPath) {
    const { tree } = ctx.data;
    const anns = ctx.content.codeMap.annotations;
    if (!selectedPath) {
        return '<h3 class="accent">the repository</h3>' +
            '<p>Pick a file or directory. Curated entries carry commentary; everything else shows ' +
            'generated facts plus its nearest annotated ancestor.</p>' +
            '<table class="vitals">' + ctx.data.vitals.areas.map(a =>
                `<tr><td><a href="#/code/${a.dir}">${a.dir}/</a></td>` +
                `<td class="dim">${a.files} files · ${a.lines.toLocaleString()} lines</td></tr>`).join('') +
            '</table>';
    }
    const node = findNode(tree, selectedPath);
    if (!node) return `<p class="red">gone from the tree: ${selectedPath} — regenerate the page?</p>`;
    const exact = anns.find(a => a.path === selectedPath);
    const nearest = exact || nearestAnnotated(selectedPath, anns);
    let html = `<h3 class="accent">${selectedPath}${node.kind === 'dir' ? '/' : ''}</h3>` +
        `<p class="dim">${node.kind === 'file'
            ? `${formatBytes(node.size)}${node.lines ? ` · ${node.lines} lines` : ''}`
            : `${(node.children || []).length} entries · ${formatBytes(node.size)}`}</p>`;
    if (exact) html += `<p>${exact.note}</p>` + (exact.detail ? `<p>${exact.detail}</p>` : '');
    else if (nearest) html += `<p class="dim">nearest commentary — <code>${nearest.path}</code>:</p><p>${nearest.note}</p>`;
    return html;
}

export function renderCode(el, ctx) {
    const selectedPath = ctx.route.parts.join('/');
    const openPaths = ancestorsOf(selectedPath);

    const nav = document.createElement('section');
    nav.className = 'pane code-tree';
    nav.innerHTML = `<div class="pane-title">files</div><div class="pane-body">` +
        `<input data-search type="search" placeholder="/ filter…">` +
        `<nav class="tree"></nav></div>`;
    const treeBox = nav.querySelector('.tree');
    const drawTree = (query) => {
        const filtered = query ? filterTree(ctx.data.tree, query) : ctx.data.tree;
        treeBox.innerHTML = filtered
            ? treeHtml(filtered, selectedPath, query ? new Set(flattenDirs(filtered)) : openPaths)
            : '<p class="dim">no matches</p>';
    };
    drawTree('');
    nav.querySelector('[data-search]').addEventListener('input', (e) => drawTree(e.target.value.trim()));

    const detail = document.createElement('section');
    detail.className = 'pane code-detail';
    detail.innerHTML = `<div class="pane-title">commentary</div>` +
        `<div class="pane-body">${detailHtml(ctx, selectedPath)}</div>`;

    el.append(nav, detail);
}
```

Append to `style.css`:

```css
/* code window */
.code-tree { flex: 1; max-width: 460px; }
.code-detail { flex: 1.6; }
.tree ul { list-style: none; margin-left: 1em; }
.tree > ul { margin-left: 0; margin-top: 8px; }
.tree summary { cursor: pointer; color: #c8d3c5; }
.tree summary:hover { color: #7ce38b; }
.tree a.tree-file { color: #7d8a7a; }
.tree a.tree-file:hover { color: #7ce38b; text-decoration: none; }
.tree a.tree-file.selected { color: #0c0f0d; background: #7ce38b; padding: 0 4px; }
.code-tree input { width: 100%; }
```

- [ ] **Step 4: Run tests, rebuild, commit**

Run: `npx vitest run tests/unit/onboarding/ && node onboarding/build.mjs`
Expected: PASS (any typo’d annotation path fails `content integrity`).

```bash
git add onboarding/ tests/unit/onboarding/content.test.js
git commit -m "feat(onboarding): annotated file tree and commentary pane (60 curated entries)"
```

---

### Task 7: Deep dives — anchored excerpts, minimal highlighter, dive player

**Files:**
- Modify: `onboarding/src/content/code-map.mjs` (fill `deepDives` + `anchors`), `onboarding/src/render/codeWin.mjs` (add dive list + dive view + `highlightCode`), `onboarding/src/style.css` (append), `tests/unit/onboarding/content.test.js` (append block)
- Regenerate + commit: `onboarding/index.html`

**Interfaces:**
- Consumes: `extractExcerpts` (Task 2 — the build already passes `CODE_MAP.anchors` through, Task 3 wired it); route extension `#/code/dive/<diveId>/<sectionIdx>` (note: `dive` is a reserved first part — a repo path can never be `dive/...` because the scanner has no such top-level dir; guard anyway by checking `parts[0] === 'dive'`).
- Produces: `CODE_MAP.deepDives: [{id, title, tagline, sections: [{text, anchorId?}]}]`, `CODE_MAP.anchors` (all verified-unique start strings), `highlightCode(code): string` exported from `codeWin.mjs`.

- [ ] **Step 1: Append the failing test block to `content.test.js`**

```js
import { REPO_ROOT as ROOT2, extractExcerpts } from '../../../onboarding/build.mjs';

describe('deep dives + anchors', () => {
    it('ships the eight spec dives and every anchor resolves', () => {
        expect(CODE_MAP.deepDives.map(d => d.id)).toEqual(
            ['diff-engine', 'text-layout', 'generator-sandbox', 'migrations',
             'publication-pinning', 'validate-appstate', 'dotenv-seals', 'auth-stack']);
        const excerpts = extractExcerpts(ROOT2, CODE_MAP.anchors); // throws AnchorError on rot
        expect(excerpts.length).toBe(CODE_MAP.anchors.length);
        for (const dive of CODE_MAP.deepDives) {
            expect(dive.sections.length).toBeGreaterThanOrEqual(2);
            expect(dive.sections.some(s => s.anchorId)).toBe(true);
        }
    });
});
```

Run — expected FAIL (empty arrays).

- [ ] **Step 2: Author anchors + dives** (fill in `code-map.mjs`; start strings below were verified unique against the current tree — if one has drifted by execution time, the test names the anchor and the fix is to re-point `start` at the same declaration)

```js
    anchors: [
        { id: 'diff-changeset', file: 'shared/diff.js', start: 'export const computeChangeSet', end: 'const touchedTemplates' },
        { id: 'diff-threeway', file: 'shared/diff.js', start: 'export const threeWayDiff', lines: 30 },
        { id: 'diff-apply', file: 'shared/diff.js', start: 'export const applyChangeSet', lines: 28 },
        { id: 'textlayout-engine', file: 'services/textLayout.ts', start: 'export function createTextLayoutEngine(', lines: 30 },
        { id: 'sandbox-parse', file: 'services/generatorSandbox.ts', start: 'const parseMessage = (message: unknown, requestToken: string)', lines: 21 },
        { id: 'migration-trigger', file: 'server/migrations/index.js', start: "id: '012_session_suspension_guard',", lines: 30 },
        { id: 'publish-route', file: 'server/routes/projects.js', start: "router.post('/api/projects/:id/publish'", lines: 26 },
        { id: 'validate-appstate', file: 'server/validateAppState.js', start: 'export const validateAppState = (state)', lines: 24 },
        { id: 'email-seal', file: 'server/email.js', start: '// Fail-safe: no RESEND_API_KEY', lines: 14 },
        { id: 'auth-hooks', file: 'server/auth.js', start: 'databaseHooks: {', lines: 30 },
        { id: 'spa-fallback', file: 'server/app.js', start: '// Must pass a relative filename', lines: 8 },
    ],
    deepDives: [
        { id: 'diff-engine', title: 'shared/diff.js — the whole merge system in 189 lines',
          tagline: 'Diffs whole templates, so schema rounds ride along for free.',
          sections: [
            { text: 'computeChangeSet answers “what changed between two states” at the granularity of variants and templates — never text lines. stableStringify (sorted keys) is the entire equality story: two objects are equal iff their canonical strings match. Note nodesChanged is a single boolean: the node hierarchy is compared wholesale.', anchorId: 'diff-changeset' },
            { text: 'threeWayDiff computes both sides’ change sets against the common ancestor, then looks for genuine overlap: the same template modified differently, removed-vs-modified, both sides rewriting the hierarchy differently, and the generator — one atomic value, never line-merged. Everything else coexists.', anchorId: 'diff-threeway' },
            { text: 'applyChangeSet replays the fork’s changes on top of the CURRENT upstream state (not the ancestor) — preserving whatever upstream changed independently. The server re-runs conflict detection immediately before writing; the client only ever renders.', anchorId: 'diff-apply' },
            { text: 'Because it diffs whole templates, the layers round (v8), generator provenance (v9), overflow (v10) and padding (v11) all needed ZERO diff changes. A schema mismatch between fork and upstream deliberately blocks the diff instead.' },
          ] },
        { id: 'text-layout', title: 'services/textLayout.ts — one engine, two renderers',
          tagline: 'Canvas and PDF cannot drift: they consume the same decisions.',
          sections: [
            { text: 'The engine owns segmentation, greedy wrap, ellipsis, shrink-to-fit and block sizing, with measurement injected as a function — so a canvas context and jsPDF metrics produce byte-identical layout decisions, and tests can inject fake metrics.', anchorId: 'textlayout-engine' },
            { text: 'War stories encoded in its fix commits: the ellipsis search binary-searched grapheme counts, assuming width is monotonic in count (it isn’t guaranteed) — now a linear scan honoring the minimum-removal contract. Greedy wrap re-measured whole candidate lines per grapheme (O(n²)) — now single-pass with tests bounding measure-call counts.' },
            { text: 'Grapheme safety comes from Intl.Segmenter with a bundled fallback (services/graphemes.ts); padding arrives pre-resolved (resolveTextContentBox shrinks the box before the engine sees it), so the engine never learns padding exists.' },
          ] },
        { id: 'generator-sandbox', title: 'The generator sandbox — running strangers’ code',
          tagline: 'Opening a project never executes anything. Previewing executes it in a cage.',
          sections: [
            { text: 'Since schema v9 a project can carry its generator source. That changed the trust model: the old Run button evaluated scripts with new Function in the app realm; Preview → Apply replaced it. Preview spawns a sandboxed iframe (no allow-same-origin, connect-src none) which spawns a disposable Worker, talks over a closure-private MessagePort, and dies on a 10-second timeout.' },
            { text: 'parseMessage is the trust boundary on the way back: every message must carry the request token, and native intrinsics were captured before evaluated source ran — so a script can’t forge results or hide oversized output behind a patched byte-length getter.', anchorId: 'sandbox-parse' },
            { text: 'The hardening commits read like an attack log: Worker/BroadcastChannel/postMessage fan-out denied inside the sandbox, a supervisor Worker so an infinite loop can’t outlive cancellation, reference-graph traversal bounded so malformed persisted input can’t hang rendering. Apply is one atomic state replace + one undo checkpoint.' },
          ] },
        { id: 'migrations', title: 'Migrations — guarantees the database itself enforces',
          tagline: 'Some invariants are too important to be code conventions.',
          sections: [
            { text: 'The runner applies each migration once, in order, under an advisory lock and a transaction — two servers booting at once can’t double-apply DDL, and a regression test injects a mid-migration failure and watches the half-applied statement roll back.' },
            { text: '012 is the interesting one: a BEFORE INSERT trigger on the session table refuses new sessions for actively-suspended users — closing a race no amount of session-deleting could. 013 fixed the fix: Postgres CURRENT_TIMESTAMP is frozen at transaction start, so an insert that waited on the suspension’s row lock evaluated stale pre-wait time; the trigger now reads the wall clock.', anchorId: 'migration-trigger' },
            { text: 'The moderation audit table (011, 014) rejects UPDATE and DELETE by trigger — immutability as a database property — and records actor/target as values, not foreign keys, so deleting an account can’t erase its history.' },
          ] },
        { id: 'publication-pinning', title: 'Publication pinning — public means what you published',
          tagline: 'The gallery never tracks your private head.',
          sections: [
            { text: 'Publish validates, locks and writes in one transaction, and sets published_commit_id — the only commit public readers ever resolve. Ordinary saves and merges advance only the private head. This model came out of a whole-branch review that caught gallery readers being served the live head — promoted to “disclosure hazard” the day generator source became public.', anchorId: 'publish-route' },
            { text: 'Listing metadata is pinned at publish too (name, description, tags — migration 010), so a private rename can’t silently rename a gallery card. The later PATCH /publication endpoint edits the listing without touching published_commit_id or published_at — the second omission is load-bearing: “Recently updated” sorts by published_at, and a tag fix must not be free promotion.' },
            { text: 'The PATCH carries a composite If-Match token — published_commit_id AND percent-encoded published_at — because republishing an unchanged commit is legal, so a version-only token would wave through exactly the stale-dialog overwrite the token exists to stop.' },
          ] },
        { id: 'validate-appstate', title: 'validateAppState — the one gate every write passes',
          tagline: 'Saves, publishes, merges: one structural validator.',
          sections: [
            { text: 'Shape checks, a 5 MB cap, and node/element count caps — enforced before anything is stored, on every path that accepts an AppState: commits, publish, and the merge endpoint’s produced result (a merge that validates badly refuses rather than writing).', anchorId: 'validate-appstate' },
            { text: 'It deliberately validates structure, not semantics: unknown extra fields ride along (that tolerance is what let layers/overflow/padding ship without server lockstep), while the client-side schema migration owns upgrading old documents.' },
          ] },
        { id: 'dotenv-seals', title: 'The dotenv seals — deleting a variable is an invitation',
          tagline: 'Sealed four times before it stayed sealed.',
          sections: [
            { text: 'The server loads dotenv at import time, and dotenv re-populates any MISSING variable from .env. So `delete process.env.RESEND_API_KEY` before tests doesn’t protect anything — the next import puts it back. Every guard is present-but-empty (`= \'\'`), which dotenv never overrides, with a regression test asserting the seal holds AFTER dotenv has loaded.', anchorId: 'email-seal' },
            { text: 'The same trap was found and sealed in four places as real credentials arrived: the Playwright webServer config, the tutorial recording servers, the deploy script’s own .env loader (which also word-split quoted values and broke a production deploy), and the unit-test helpers — discovered when a routine full-suite run sent forty real verification emails to @test.dev addresses.' },
          ] },
        { id: 'auth-stack', title: 'The auth stack — hooks as choke points',
          tagline: 'Everything app-specific hangs off better-auth hooks, not forked library code.',
          sections: [
            { text: 'databaseHooks.user.create.before is the signup-cap choke point: both email signup and first-time Google OAuth pass through user creation, and returning OAuth users never do — the one place path-based middleware can’t be blind-sided. Its error message surfaces in the OAuth error callback (spaces underscored), which the login page decodes into the waitlist panel.', anchorId: 'auth-hooks' },
            { text: 'hooks.before denies /admin/* INSIDE better-auth, where the path is already normalized — Express-level blocking was bypassed by percent-encoded dot-segments that normalized back to /admin/* inside the library. Red tests proved unban and role promotion answered 200 to a non-admin before the deny moved.' },
            { text: 'Above admin sits a deployment-controlled owner: OWNER_EMAILS is the only root of trust, reconciled at startup and signup in one transaction; requireAdmin/requireOwner demand CURRENT config membership on every request — a stored role outliving its config entry grants nothing.' },
          ] },
    ],
```

- [ ] **Step 3: Extend `render/codeWin.mjs`**

Add at the top of the file:

```js
export function highlightCode(code) {
    const esc = code.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    return esc
        .replace(/(\/\/[^\n]*|\/\*[\s\S]*?\*\/)/g, '<span class="tok-c">$1</span>')
        .replace(/(&#39;|')(?:[^'\\\n]|\\.)*\1|(&quot;|")(?:[^"\\\n]|\\.)*\2|`[^`]*`/g,
            (m) => m.includes('tok-') ? m : `<span class="tok-s">${m}</span>`)
        .replace(/\b(const|let|var|function|return|if|else|for|while|import|export|class|new|throw|await|async|null|true|false|typeof|delete)\b/g,
            '<span class="tok-k">$1</span>');
}
```

In `renderCode`, before building panes, branch on dives:

```js
    if (ctx.route.parts[0] === 'dive') {
        renderDive(el, ctx, ctx.route.parts[1], Number(ctx.route.parts[2]) || 0);
        return;
    }
```

Add the dive list to the tree pane body (after the `<nav class="tree">`):

```js
        `<div class="dive-list"><div class="pane-subtitle">deep dives</div><ul>` +
        ctx.content.codeMap.deepDives.map(d =>
            `<li><a href="#/code/dive/${d.id}/0">${d.title}</a></li>`).join('') + '</ul></div>' +
```

And the dive renderer:

```js
function renderDive(el, ctx, diveId, sectionIdx) {
    const dive = ctx.content.codeMap.deepDives.find(d => d.id === diveId);
    if (!dive) { ctx.navigate('#/code'); return; }
    const idx = Math.min(Math.max(sectionIdx, 0), dive.sections.length - 1);
    const section = dive.sections[idx];
    const excerpt = section.anchorId
        ? ctx.data.excerpts.find(e => e.id === section.anchorId) : null;

    const pane = document.createElement('section');
    pane.className = 'pane dive-pane';
    pane.innerHTML = `<div class="pane-title">deep dive · ${dive.title}</div>` +
        `<div class="pane-body">` +
        `<p class="dim">${dive.tagline} · <a href="#/code">back to the tree</a></p>` +
        `<p>${section.text}</p>` +
        (excerpt ? `<p class="dim"><a href="#/code/${excerpt.file}"><code>${excerpt.file}</code></a>` +
                   `:${excerpt.startLine}</p><pre class="code">${highlightCode(excerpt.code)}</pre>` : '') +
        `<div class="tour-nav">` +
        (idx > 0 ? `<a href="#/code/dive/${dive.id}/${idx - 1}">◀ prev</a>` : '<span></span>') +
        `<span class="dim">${idx + 1}/${dive.sections.length}</span>` +
        (idx < dive.sections.length - 1 ? `<a href="#/code/dive/${dive.id}/${idx + 1}">next ▶</a>` : '<span></span>') +
        `</div></div>`;
    el.append(pane);
}
```

Append to `style.css`:

```css
.dive-list { margin-top: 1em; border-top: 1px solid #2a352c; padding-top: 8px; }
.pane-subtitle { color: #e3c67c; font-size: 12px; margin-bottom: 6px; }
.dive-pane { flex: 1; }
.dive-pane .pane-body { max-width: 90ch; }
```

- [ ] **Step 4: Run tests, rebuild, commit**

Run: `npx vitest run tests/unit/onboarding/ && node onboarding/build.mjs`
Expected: PASS — an unresolvable anchor fails BOTH the test and the build.

```bash
git add onboarding/ tests/unit/onboarding/content.test.js
git commit -m "feat(onboarding): eight deep dives with build-time anchored excerpts and a minimal highlighter"
```

---

### Task 8: PLAYGROUND hub + Quiz ladder (5 levels × 8 questions)

**Files:**
- Modify: `onboarding/src/content/playground.mjs` (fill `quizLevels`; other keys stay `[]`), `onboarding/src/render/playgroundWin.mjs` (replace stub: hub + quiz), `onboarding/src/style.css` (append), `tests/unit/onboarding/content.test.js` (append block)
- Regenerate + commit: `onboarding/index.html`

**Interfaces:**
- Consumes: `scoreProfile`, `rankFor`, `levelUnlocked`, profile shape (Task 3). Routes: `#/playground` (hub), `#/playground/quiz/<levelIdx>`.
- Produces: `PLAYGROUND.quizLevels: [{title, questions: [{q, options: [4 strings], answer: 0-3, why}]}]`; `renderPlayground` dispatches on `parts[0]` ∈ `quiz|bugs|merge|wdil` — Tasks 9–11 add their branches to this same dispatcher.

- [ ] **Step 1: Append the failing test block to `content.test.js`**

```js
import { PLAYGROUND } from '../../../onboarding/src/content/playground.mjs';

describe('quiz ladder', () => {
    it('is 5 levels × 8 questions, each with a cited why', () => {
        expect(PLAYGROUND.quizLevels).toHaveLength(5);
        for (const level of PLAYGROUND.quizLevels) {
            expect(level.questions).toHaveLength(8);
            for (const q of level.questions) expect(q.why.length).toBeGreaterThan(20);
        }
    });
    it('answers are not all the same index (no answer-position tell)', () => {
        for (const level of PLAYGROUND.quizLevels) {
            expect(new Set(level.questions.map(q => q.answer)).size).toBeGreaterThan(1);
        }
    });
});
```

Run — expected FAIL.

- [ ] **Step 2: Author the 40 questions** (fill `quizLevels` in `playground.mjs` with exactly this)

```js
    quizLevels: [
        { title: 'L1 · orientation', questions: [
            { q: 'What is PDF Architect, in one sentence?',
              options: ['A cloud CMS for PDF forms', 'A local-first editor for structured PDF products (planners, journals) targeting e-ink pages', 'A PDF viewer with annotations', 'A print shop backend'],
              answer: 1, why: 'Local-first is the founding constraint — everything (editing, export) works with no account; cloud/gallery is opt-in on top. See the INTRO window.' },
            { q: 'Where does an anonymous user’s project live?',
              options: ['IndexedDB', 'A cloud draft keyed by cookie', 'localStorage', 'The URL fragment'],
              answer: 2, why: 'Projects persist to browser localStorage; cloud storage only exists after an explicit “save to cloud”.' },
            { q: 'npm run dev starts…',
              options: ['Vite only', 'Vite and the Express API concurrently', 'A Docker compose stack', 'Express serving a prebuilt dist/'],
              answer: 1, why: 'package.json: concurrently "vite" "node server/index.js" — client :3000, API :3001.' },
            { q: 'Databases in dev and prod are…',
              options: ['SQLite dev, Postgres prod — one query() over both', 'Postgres everywhere', 'SQLite everywhere', 'MongoDB'],
              answer: 0, why: 'server/db.js exposes one query() that behaves identically on both engines; migrations carry pg and sqlite variants.' },
            { q: 'A “variant” is…',
              options: ['A git branch of the project', 'An alternate template set over the same node hierarchy', 'A color theme', 'A fork on the gallery'],
              answer: 1, why: 'One document, many looks: variants swap the templates; the hierarchy stays shared. types.ts is the reference.' },
            { q: 'The in-app /docs content comes from…',
              options: ['A CMS', 'Hand-written JSX pages', 'Bundled markdown in docs-content/, validated at load', 'The GitHub wiki'],
              answer: 2, why: 'docs-content/ markdown is parsed and validated in the unit suite — a broken link or duplicate slug fails the build.' },
            { q: 'How does a project become publicly visible?',
              options: ['Auto-sync once signed in', 'An explicit publish that pins a specific commit', 'Sharing a link', 'Admin approval'],
              answer: 1, why: 'Publishing pins published_commit_id; private saves never move public content. The “pinned snapshot” tour walks it.' },
            { q: 'What lives in shared/?',
              options: ['CSS shared by pages', 'Plain ESM imported by BOTH client and server — the diff engine and generator metadata', 'React context providers', 'Test fixtures'],
              answer: 1, why: 'shared/diff.js renders diffs in the client and enforces merges on the server — same file, both sides.' },
        ] },
        { title: 'L2 · the client', questions: [
            { q: 'The editor canvas is technically…',
              options: ['A <canvas> 2D context', 'SVG', 'Absolutely-positioned DOM elements', 'WebGL'],
              answer: 2, why: 'DOM canvas — which is why thumbnails need the jsPDF→pdfjs pipeline and why editor chrome needed isolation:isolate.' },
            { q: 'Current document schema version, defined where?',
              options: ['v7 in types.ts', 'v11 in services/migration.ts', 'v11 in server/validateAppState.js', 'v9 in shared/diff.js'],
              answer: 1, why: 'CURRENT_SCHEMA_VERSION = 11 in services/migration.ts; the server validator deliberately doesn’t own versioning.' },
            { q: 'How are layers stored (“Shape B”)?',
              options: ['Elements nested inside layer objects', 'A flat element array + layerId tags + layers metadata on the template', 'A separate layers table in the cloud', 'CSS z-index only'],
              answer: 1, why: 'Flat elements stay individually addressable, render/export only re-sort, and the diff engine needed zero changes.' },
            { q: 'Why do elements render inside an isolation:isolate wrapper?',
              options: ['Performance', 'So user-set z-index can never paint over selection chrome at z-100', 'Accessibility', 'Print fidelity'],
              answer: 1, why: 'A template with an element at z>100 covered the selection border — isolation gives elements their own stacking context.' },
            { q: 'The gallery-project-as-modal trick uses…',
              options: ['A portal + display:none page', 'React Router background locations — URL changes, page underneath keeps rendering', 'An iframe', 'Query params only'],
              answer: 1, why: 'Direct loads/refreshes render the standalone page; in-app clicks pass the current location as state. Spiked before planning.' },
            { q: 'Components call the server through…',
              options: ['fetch() inline', 'services/cloudApi.ts, one typed wrapper for every endpoint', 'A GraphQL client', 'React Query hooks per component'],
              answer: 1, why: 'One file to grep when an endpoint changes; every cloud task since Task 9 of the original plan imports from it.' },
            { q: 'Opening someone’s project that carries generator scripts…',
              options: ['Runs them to rebuild the document', 'Never executes them — a badge shows; only explicit Preview runs, sandboxed', 'Strips them', 'Asks for permission then runs in-page'],
              answer: 1, why: 'Opening must never execute foreign code. Preview runs in a sandboxed iframe + disposable worker with a 10 s timeout.' },
            { q: 'Which client code is code-split off the main chunk?',
              options: ['Every route', 'The /docs section and the Edit Listing modal', 'The gallery', 'Nothing'],
              answer: 1, why: 'App.tsx imports every page statically by design; /docs (~160 KB gz) and the 6 kB listing editor are the lazy exceptions.' },
        ] },
        { title: 'L3 · server & data', questions: [
            { q: 'Migration policy is…',
              options: ['Edit the schema file and restart', 'Versioned, run-once, append-only — never edit an applied migration', 'ORM auto-migration', 'Manual SQL in prod'],
              answer: 1, why: 'server/migrations/index.js is a ledger; the runner is advisory-locked and transactional. The repo replaced a DROP TABLE bootstrap with this.' },
            { q: 'A cloud commit stores…',
              options: ['A gzip’d full snapshot of AppState', 'A diff against the parent', 'Only changed templates', 'A patch file'],
              answer: 0, why: 'Full snapshots (decided pre-code) make history, restore, fork and merge simple reads. stateCodec.js does the gzip.' },
            { q: 'What does publishing pin, exactly?',
              options: ['The head commit forever', 'published_commit_id + listing metadata (name/description/tags) at publish time', 'A tag name', 'A rendered PDF'],
              answer: 1, why: 'Migrations 009/010: public readers resolve only the pinned commit and pinned metadata; saves move the private head only.' },
            { q: 'A merge request’s diff is…',
              options: ['Snapshotted when opened', 'Cached for an hour', 'Recomputed live on every view', 'Computed client-side only'],
              answer: 2, why: 'A request that becomes conflicted after upstream changes is caught on view — and the merge endpoint re-verifies under lock anyway.' },
            { q: 'requireUsername guards…',
              options: ['Every /api route', 'Exactly the five content-creating routes — not unpublish/delete/close', 'Only publish', 'Only the gallery'],
              answer: 1, why: 'Gating cleanup routes would trap legacy no-username accounts away from reducing their own exposure.' },
            { q: 'Star-rating averages are…',
              options: ['Denormalized onto projects and updated on write', 'Computed client-side', 'Cached in Redis', 'Computed at read time with SQL AVG()'],
              answer: 3, why: 'A live AVG can’t drift the way a hand-maintained counter can — ratings change on every edit and delete.' },
            { q: 'Forking a public project gives you…',
              options: ['A public linked copy', 'A private project copied from the PUBLISHED commit, with lineage recorded', 'A branch on the original', 'Read access'],
              answer: 1, why: 'Forks never appear in the gallery, and they copy the published commit — not the owner’s private head. Even for your own project.' },
            { q: 'A save with a stale If-Match tag gets…',
              options: ['A silent overwrite', 'A stable 409 and no orphan commit', 'A merge attempt', 'A retry loop server-side'],
              answer: 1, why: 'Heads advance by transactional compare-and-swap; the losing writer is told cleanly and nothing half-lands.' },
        ] },
        { title: 'L4 · security & integrity', questions: [
            { q: 'The stored-XSS fix for SVG artwork was…',
              options: ['A CSP header', 'Escaping on upload', 'DOMPurify at the single place SVG is ever rendered', 'Blocking SVG in the gallery'],
              answer: 2, why: 'components/canvas/CanvasElement.tsx sanitizes with the svg/svgFilters profile — verified with a live exploit before and after.' },
            { q: 'The signup cap is enforced in…',
              options: ['Express middleware on /sign-up', 'better-auth databaseHooks.user.create.before', 'The client form', 'nginx'],
              answer: 1, why: 'The one choke point email signup AND first-time OAuth share; returning OAuth users never create a row so never hit it.' },
            { q: 'Why did the Express-level /api/auth/admin block get bypassed?',
              options: ['A missing await', 'Percent-encoded dot-segments normalized back to /admin/* inside better-auth', 'CORS misconfig', 'A regex typo'],
              answer: 1, why: 'The deny moved into better-auth’s hooks.before, which sees the normalized path. Red tests proved the bypass first.' },
            { q: 'A suspended user trying to establish a NEW session is stopped by…',
              options: ['Session-delete sweeps', 'A BEFORE INSERT trigger on the session table', 'The client', 'Rate limiting'],
              answer: 1, why: 'Migration 012 makes it a database property — closing the race that session deletion alone can’t.' },
            { q: 'The moderation audit log is immutable because…',
              options: ['Code convention', 'UPDATE/DELETE-rejecting triggers on the table itself', 'It’s append-only S3', 'Row-level security'],
              answer: 1, why: 'Triggers on both engines; actor/target stored as values (not FKs) so deleting an account can’t erase history.' },
            { q: 'The owner role is granted by…',
              options: ['An admin promoting you', 'OWNER_EMAILS config reconciliation at startup/signup — no HTTP path exists', 'A signup flag', 'The first account ever created'],
              answer: 1, why: 'Stale stored owners drop to plain user; requireOwner checks live config membership on every request.' },
            { q: 'Uploaded preview thumbnails are validated by…',
              options: ['File extension', 'Claimed MIME type', 'Actual magic bytes + a 300 KB cap', 'Virus scan'],
              answer: 2, why: 'parseThumbnail reads the bytes; a renamed .html can’t masquerade as a .webp.' },
            { q: 'When do someone else’s generator scripts execute in your browser?',
              options: ['On project open', 'On gallery hover', 'Only when YOU click Preview — inside the sandbox', 'On fork'],
              answer: 2, why: 'Open never executes; Apply applies the previewed result; the sandbox denies network, same-origin, and worker fan-out.' },
        ] },
        { title: 'L5 · war stories', questions: [
            { q: 'Why didn’t `delete process.env.RESEND_API_KEY` protect tests from sending real email?',
              options: ['Tests ran in a subprocess', 'dotenv re-populates any MISSING variable from .env on import', 'The key was cached', 'Resend ignores env'],
              answer: 1, why: 'Deleting a variable is an invitation. Every guard is present-but-empty, asserted AFTER dotenv loads. Sealed four times.' },
            { q: 'Pre-fix, DISABLE_AUTH_RATE_LIMIT=false did what?',
              options: ['Nothing', 'Disabled brute-force protection — any value was truthy', 'Enabled stricter limits', 'Crashed boot'],
              answer: 1, why: 'enabled: !process.env.X treats "false" as disable. The fix is a strict !== "true" check.' },
            { q: 'The tag filter’s “exact match” leaked because…',
              options: ['Unescaped % and _ in the LIKE pattern matched across JSON boundaries', 'Case sensitivity', 'Unicode', 'A join bug'],
              answer: 0, why: 'Fixed with an ESCAPE clause behaving identically on Postgres and SQLite, plus a regression test.' },
            { q: 'The Change Password section had never rendered for anyone because…',
              options: ['A CSS bug', 'The code checked a.provider but better-auth returns providerId — and the unit-test mock encoded the same wrong guess', 'A feature flag', 'It required owner role'],
              answer: 1, why: 'The mandatory real-browser task caught what mocked units structurally couldn’t. pages/AccountSettingsPage.tsx.' },
            { q: 'Two commits in the same second used to order randomly because…',
              options: ['UUIDv4 sort', 'A race in Express', 'SQLite CURRENT_TIMESTAMP has whole-second resolution; the tiebreak was a random UUID', 'Clock skew'],
              answer: 2, why: 'Fixed by app-generated millisecond timestamps instead of the database default.' },
            { q: 'SIGNUP_CAP=" " (a stray space) originally meant…',
              options: ['Unset', 'Signups CLOSED — Number(" ") === 0', 'Default 500', 'Crash'],
              answer: 1, why: 'Trimmed first now; whitespace means unset. Same review also caught deploy --set-env-vars replacing the whole env set.' },
            { q: 'The page-dimension unit dropdown (pt/px/in/mm) was, for its whole life before the layers follow-up…',
              options: ['Rounding wrong', 'Metric-only', 'Breaking undo', 'Purely decorative — the conversion table was imported but never called'],
              answer: 3, why: 'Inputs always showed raw points whatever the dropdown claimed. Switching units now re-expresses size with round-trip drift tests.' },
            { q: 'Profile pages shipped a release with zero thumbnails because…',
              options: ['A CDN outage', 'Endpoint omitted the new field + card dropped its fallback + a defensive default hid the crash — and no task owned the visual outcome', 'An auth bug', 'Image caps'],
              answer: 1, why: 'Task 1 flagged it, Task 4 guarded it, nobody owned it. The fix added the field at the source plus a profile-page test.' },
        ] },
    ],
```

- [ ] **Step 3: Implement hub + quiz in `render/playgroundWin.mjs`** (replace stub body)

```js
// onboarding/src/render/playgroundWin.mjs
// Imports stripped in the shipped bundle, required for direct ESM import in tests.
import { scoreProfile, rankFor, levelUnlocked } from '../app-logic.mjs';
import { highlightCode, treeHtml } from './codeWin.mjs';

function pgPane(title) {
    const s = document.createElement('section');
    s.className = 'pane pg-pane';
    s.innerHTML = `<div class="pane-title">${title}</div><div class="pane-body"></div>`;
    return { s, body: s.querySelector('.pane-body') };
}

function renderHub(el, ctx) {
    const pg = ctx.content.playground;
    const { points, max } = scoreProfile(ctx.profile, pg);
    const rank = rankFor(points, max);
    const hub = pgPane('playground');
    const quizDone = pg.quizLevels.reduce((s, _, i) => s + (ctx.profile.quiz[i]?.best || 0), 0);
    hub.body.innerHTML =
        `<p>rank: <span class="amber">${rank}</span> · ${points}/${max} points</p>` +
        `<div class="pg-cards">` +
        `<a class="pg-card" href="#/playground/quiz/0"><b>quiz ladder</b><span class="dim">5 levels, unlock at 6/8 · ${quizDone}/40</span></a>` +
        `<a class="pg-card" href="#/playground/bugs"><b>bug hunt</b><span class="dim">${pg.bugHunt.length} real historical bugs</span></a>` +
        `<a class="pg-card" href="#/playground/merge"><b>merge lab</b><span class="dim">drive the real diff engine</span></a>` +
        `<a class="pg-card" href="#/playground/wdil"><b>where does it live?</b><span class="dim">${pg.wdil.length} behaviors to locate</span></a>` +
        `</div>`;
    el.append(hub.s);
}

function renderQuiz(el, ctx, levelIdx) {
    const pg = ctx.content.playground;
    const li = Math.min(Math.max(levelIdx, 0), pg.quizLevels.length - 1);
    const level = pg.quizLevels[li];
    const state = ctx.profile.quiz[li] || (ctx.profile.quiz[li] = { answers: {}, best: 0 });

    const tabs = pg.quizLevels.map((l, i) => {
        const locked = !levelUnlocked(ctx.profile, i);
        return locked ? `<span class="dim">🔒 ${l.title}</span>`
            : `<a class="${i === li ? 'amber' : ''}" href="#/playground/quiz/${i}">${l.title}</a>`;
    }).join(' · ');

    const pane = pgPane(`quiz · ${level.title}`);
    if (!levelUnlocked(ctx.profile, li)) {
        pane.body.innerHTML = `<p>${tabs}</p><p class="red">locked — score 6/8 on the previous level first.</p>`;
        el.append(pane.s); return;
    }
    const answered = Object.keys(state.answers).length;
    const correct = level.questions.filter((q, i) => state.answers[i] === q.answer).length;
    pane.body.innerHTML = `<p>${tabs} · <a href="#/playground">hub</a></p>` +
        `<p class="dim">${answered}/8 answered · ${correct} correct · best ${state.best}</p>` +
        `<div class="quiz-list"></div>` +
        `<p><button data-reset>retry level</button></p>`;
    const list = pane.body.querySelector('.quiz-list');
    level.questions.forEach((q, qi) => {
        const chosen = state.answers[qi];
        const div = document.createElement('div');
        div.className = 'quiz-q';
        div.innerHTML = `<p><b>Q${qi + 1}.</b> ${q.q}</p>` + q.options.map((opt, oi) => {
            const cls = chosen === undefined ? '' :
                oi === q.answer ? 'right' : oi === chosen ? 'wrong' : 'dim';
            return `<button class="quiz-opt ${cls}" data-q="${qi}" data-o="${oi}" ${chosen !== undefined ? 'disabled' : ''}>${opt}</button>`;
        }).join('') + (chosen !== undefined ? `<p class="quiz-why dim">${q.why}</p>` : '');
        list.append(div);
    });
    list.addEventListener('click', (e) => {
        const btn = e.target.closest('.quiz-opt');
        if (!btn || btn.disabled) return;
        state.answers[btn.dataset.q] = Number(btn.dataset.o);
        const nowCorrect = level.questions.filter((q, i) => state.answers[i] === q.answer).length;
        if (Object.keys(state.answers).length === level.questions.length) {
            state.best = Math.max(state.best, nowCorrect);
        }
        ctx.save();
        renderPlayground(el, ctx);
    });
    pane.body.querySelector('[data-reset]').addEventListener('click', () => {
        ctx.profile.quiz[li] = { answers: {}, best: state.best };
        ctx.save();
        renderPlayground(el, ctx);
    });
    el.append(pane.s);
}

export function renderPlayground(el, ctx) {
    el.innerHTML = '';
    const [section, arg] = ctx.route.parts;
    if (section === 'quiz') return renderQuiz(el, ctx, Number(arg) || 0);
    if (section === 'bugs') return renderBugs ? renderBugs(el, ctx, arg) : renderHub(el, ctx);
    if (section === 'merge') return renderMerge ? renderMerge(el, ctx) : renderHub(el, ctx);
    if (section === 'wdil') return renderWdil ? renderWdil(el, ctx, arg) : renderHub(el, ctx);
    return renderHub(el, ctx);
}
```

Note on the `renderBugs ? …` guards: `renderBugs`/`renderMerge`/`renderWdil` don’t exist until Tasks 9–11. In the concatenated bundle they’re plain identifiers — referencing an undeclared identifier even behind `?:` throws in JS. So until Task 9 lands, write the dispatcher with only the quiz branch plus `return renderHub(el, ctx);` and let Tasks 9–11 each add their own line. (The version above is the FINAL shape for reference; Task 8 ships it without the three guarded lines.)

Append to `style.css`:

```css
/* playground */
.pg-pane { flex: 1; }
.pg-cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 10px; margin-top: 1em; }
.pg-card { border: 1px solid #2a352c; padding: 16px; display: flex; flex-direction: column; gap: 6px; }
.pg-card:hover { border-color: #7ce38b; text-decoration: none; }
.quiz-q { margin: 1.2em 0; }
.quiz-opt { display: block; width: 100%; text-align: left; margin: 4px 0; }
.quiz-opt.right { border-color: #7ce38b; color: #7ce38b; }
.quiz-opt.wrong { border-color: #e37c7c; color: #e37c7c; }
.quiz-why { margin-top: 6px; max-width: 80ch; }
```

- [ ] **Step 4: Run tests, rebuild, commit**

Run: `npx vitest run tests/unit/onboarding/ && node onboarding/build.mjs`
Expected: PASS (validator enforces 4 options + in-range answers + non-empty why on all 40).

```bash
git add onboarding/ tests/unit/onboarding/content.test.js
git commit -m "feat(onboarding): playground hub with ranks and the 40-question quiz ladder"
```

---

### Task 9: Bug Hunt — seven real historical bugs

**Files:**
- Modify: `onboarding/src/content/playground.mjs` (fill `bugHunt`), `onboarding/src/render/playgroundWin.mjs` (add `renderBugs` + dispatcher line), `onboarding/src/style.css` (append), `tests/unit/onboarding/content.test.js` (append block)
- Regenerate + commit: `onboarding/index.html`

**Interfaces:**
- Consumes: dispatcher from Task 8; `highlightCode` (Task 7); profile `bugs` map (`'found'` = guilty line on first click, `'revealed'` = anything else).
- Produces: `PLAYGROUND.bugHunt: [{id, title, setup, code, guiltyLine, story, fixedRef}]` — `code` is an authored *reconstruction* of the historical buggy form (labeled as such in the UI), `guiltyLine` is a 0-based index into `code.split('\n')`, `fixedRef` a current repo path.

- [ ] **Step 1: Append the failing test block to `content.test.js`**

```js
describe('bug hunt', () => {
    it('ships seven bugs whose guilty lines are in range (validator) and stories are told', () => {
        expect(PLAYGROUND.bugHunt.map(b => b.id)).toEqual(
            ['dotenv-resurrection', 'rate-limit-toggle', 'like-wildcards', 'provider-id',
             'commit-timestamps', 'signup-cap-space', 'spa-fallback']);
        for (const b of PLAYGROUND.bugHunt) expect(b.story.length).toBeGreaterThan(80);
    });
});

describe('bug hunt interaction', () => {
    it('clicking the guilty line marks found; a wrong line reveals', async () => {
        const { renderPlayground } = await import('../../../onboarding/src/render/playgroundWin.mjs');
        const { defaultProfile } = await import('../../../onboarding/src/app-logic.mjs');
        const content = await buildContent();
        const makeCtx = (profile, parts) => ({
            data: { vitals: { gitSha: 'x' } }, content, profile,
            save: () => {}, navigate: () => {}, route: { win: 'playground', parts }, diff: null });
        const el = document.createElement('div');
        const profile = defaultProfile();
        const bug = content.playground.bugHunt[0];
        renderPlayground(el, makeCtx(profile, ['bugs', bug.id]));
        el.querySelector(`[data-line="${bug.guiltyLine}"]`).click();
        expect(profile.bugs[bug.id]).toBe('found');
        const el2 = document.createElement('div');
        const profile2 = defaultProfile();
        renderPlayground(el2, makeCtx(profile2, ['bugs', bug.id]));
        el2.querySelector(`[data-line="${(bug.guiltyLine + 1) % bug.code.split('\n').length}"]`).click();
        expect(profile2.bugs[bug.id]).toBe('revealed');
    });
});
```

Run — expected FAIL.

- [ ] **Step 2: Author the seven bugs** (fill `bugHunt` in `playground.mjs`)

```js
    bugHunt: [
        { id: 'dotenv-resurrection', title: 'The test suite that emailed forty strangers',
          setup: 'Unit-test helper, written to guarantee tests can never send real email:',
          code: `import dotenv from 'dotenv';\ndotenv.config();\n\n// Ensure the suite can never deliver real email.\ndelete process.env.RESEND_API_KEY;\n\nexport const bootTestServer = () => import('../../server/app.js');`,
          guiltyLine: 4,
          story: 'The server loads dotenv during import — and dotenv re-populates any MISSING variable from .env. Deleting a variable is an invitation: the next import put the real key straight back, and a routine full-suite run sent forty real verification emails to @test.dev addresses. The seal is present-but-empty (RESEND_API_KEY = \'\'), which dotenv never overrides, with a regression test asserting the seal holds AFTER dotenv has loaded. The same trap was sealed in four places: Playwright config, tutorial recording servers, deploy script, unit-test helpers.',
          fixedRef: 'tests/unit/server/helpers.js' },
        { id: 'rate-limit-toggle', title: 'The off switch that only had one position',
          setup: 'better-auth rate limiting, with a way to opt out under test:',
          code: `rateLimit: {\n    // Tests sign up three users in a burst; allow opting out locally.\n    enabled: !process.env.DISABLE_AUTH_RATE_LIMIT,\n    window: 10,\n    max: 3,\n},`,
          guiltyLine: 2,
          story: 'Any value — including the DISABLE_AUTH_RATE_LIMIT=false someone writes to mean “do NOT disable this” — is a truthy string, so the negation turned brute-force protection OFF on any misconfigured deploy. Caught by the ratings round’s whole-branch review; the fix is a strict !== \'true\' comparison, with a regression test.',
          fixedRef: 'server/auth.js' },
        { id: 'like-wildcards', title: 'The exact match that wasn’t',
          setup: 'The gallery’s exact-tag filter, matching a JSON-quoted tag inside a stored tags string:',
          code: `if (tag) {\n    params.push(\`%"\${tag}"%\`);\n    where += \` AND p.published_tags LIKE $\${params.length}\`;\n}`,
          guiltyLine: 1,
          story: 'The LIKE pattern is built from the raw tag — so a tag containing % or _ carries live wildcards into the pattern and matches unrelated projects across JSON element boundaries, silently breaking the documented “exact match” guarantee. Fixed by escaping the wildcards and adding an ESCAPE clause that behaves identically on Postgres and SQLite.',
          fixedRef: 'server/routes/gallery.js' },
        { id: 'provider-id', title: 'The section nobody ever saw',
          setup: 'Account settings — show Change Password only for accounts that have a password credential:',
          code: `const res = await authClient.listAccounts();\n// Only credential accounts can change a password.\nsetHasCredential(!!res?.data?.some(a => a.provider === 'credential'));`,
          guiltyLine: 2,
          story: 'better-auth’s list-accounts returns providerId, not provider — so the predicate was false for everyone and the section had never rendered for a single user. The unit-test mock had encoded the same wrong field name, so the unit suite was green the whole time. The mandatory real-browser verification task caught it; fixed test-first from the live failure.',
          fixedRef: 'pages/AccountSettingsPage.tsx' },
        { id: 'commit-timestamps', title: 'Newest first, by coin flip',
          setup: 'The commits table and its history query:',
          code: `CREATE TABLE commits (\n    id TEXT PRIMARY KEY,\n    project_id TEXT NOT NULL,\n    state BLOB NOT NULL,\n    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP\n);\n-- newest first\nSELECT * FROM commits WHERE project_id = ? ORDER BY created_at DESC, id DESC;`,
          guiltyLine: 4,
          story: 'SQLite’s CURRENT_TIMESTAMP has whole-second resolution. Two commits saved within the same second tie — and the tiebreak column is a random UUID, so “newest commit first” became a coin flip exactly when someone saved twice quickly. Fixed by stamping commits with an app-generated millisecond-precision timestamp instead of trusting the database default.',
          fixedRef: 'server/routes/projects.js' },
        { id: 'signup-cap-space', title: 'The stray space that closed signups',
          setup: 'Reading the signup cap from the environment:',
          code: `const raw = process.env.SIGNUP_CAP;\nif (raw === undefined || raw === '') return DEFAULT_CAP;\nconst cap = Number(raw);\nreturn Number.isFinite(cap) ? cap : DEFAULT_CAP;`,
          guiltyLine: 1,
          story: 'SIGNUP_CAP=" " — one stray space in a deploy config — sails past the empty-string check, and Number(" ") === 0. Zero means CLOSED, so a whitespace typo would have silently shut the front door. The value is now trimmed first, and whitespace means unset. The same review caught deploy.sh’s --set-env-vars replacing the entire env set, so one update line omitting SIGNUP_CAP would have wiped it.',
          fixedRef: 'server/signupCap.js' },
        { id: 'spa-fallback', title: 'Every deep link 404s in production',
          setup: 'The SPA fallback route, serving the client for any non-API path:',
          code: `const distPath = path.join(__dirname, '../dist');\napp.use(express.static(distPath));\napp.get(/.*/, (req, res) => {\n    res.sendFile(path.join(distPath, 'index.html'));\n});`,
          guiltyLine: 3,
          story: 'express@5.2.1’s res.sendFile() 404s on a bare absolute path here even when the file exists — so every hard load of any non-root route (/login, /app, every gallery URL, a refresh, a bookmark) died in production. Pre-existing since before the gallery work, confirmed via git history, caught by the first whole-branch review. The fix is the one-line recommended form: res.sendFile(\'index.html\', { root: distPath }).',
          fixedRef: 'server/app.js' },
    ],
```

- [ ] **Step 3: Implement `renderBugs`** (add to `playgroundWin.mjs`, plus dispatcher line `if (section === 'bugs') return renderBugs(el, ctx, arg);`)

```js
function renderBugs(el, ctx, bugId) {
    const bugs = ctx.content.playground.bugHunt;
    const bug = bugs.find(b => b.id === bugId) || bugs[0];
    const status = ctx.profile.bugs[bug.id];

    const list = pgPane('bug hunt · 7 true stories');
    list.body.innerHTML = '<p><a href="#/playground">hub</a></p><ul class="bug-list">' +
        bugs.map(b => {
            const st = ctx.profile.bugs[b.id];
            const mark = st === 'found' ? '<span class="accent">✓</span>'
                : st === 'revealed' ? '<span class="amber">◦</span>' : '<span class="dim">·</span>';
            return `<li>${mark} <a class="${b.id === bug.id ? 'amber' : ''}" href="#/playground/bugs/${b.id}">${b.title}</a></li>`;
        }).join('') + '</ul>' +
        '<p class="dim">Each panel reconstructs the bug as it was written. Click the guilty line. One shot.</p>';

    const panel = pgPane(bug.title);
    const lines = bug.code.split('\n');
    panel.body.innerHTML = `<p>${bug.setup}</p><pre class="code bug-code">` +
        lines.map((ln, i) => {
            const cls = status && i === bug.guiltyLine ? 'bug-line guilty' : 'bug-line';
            return `<span class="${cls}" data-line="${i}">${highlightCode(ln) || ' '}</span>`;
        }).join('\n') + '</pre>' +
        (status ? `<p class="${status === 'found' ? 'accent' : 'amber'}">` +
            `${status === 'found' ? 'found it.' : 'revealed — the guilty line is highlighted.'}</p>` +
            `<p class="bug-story">${bug.story}</p>` +
            `<p class="dim">lives on, fixed: <a href="#/code/${bug.fixedRef}"><code>${bug.fixedRef}</code></a></p>`
          : '');
    if (!status) {
        panel.body.querySelector('.bug-code').addEventListener('click', (e) => {
            const line = e.target.closest('.bug-line');
            if (!line) return;
            ctx.profile.bugs[bug.id] = Number(line.dataset.line) === bug.guiltyLine ? 'found' : 'revealed';
            ctx.save();
            renderPlayground(el, ctx);
        });
    }
    el.append(list.s, panel.s);
}
```

Append to `style.css`:

```css
.bug-list { list-style: none; margin: 0 0 1em 0; }
.bug-code .bug-line { display: block; cursor: pointer; padding: 0 6px; }
.bug-code .bug-line:hover { background: #1d2a20; }
.bug-code .bug-line.guilty { background: #3a1d1d; outline: 1px solid #e37c7c; }
.bug-story { max-width: 85ch; }
```

- [ ] **Step 4: Run tests, rebuild, commit**

Run: `npx vitest run tests/unit/onboarding/ && node onboarding/build.mjs`

```bash
git add onboarding/ tests/unit/onboarding/content.test.js
git commit -m "feat(onboarding): bug hunt — seven reconstructed historical bugs with their true stories"
```

---

### Task 10: Merge Lab — the real diff engine, live

**Files:**
- Modify: `onboarding/src/content/playground.mjs` (fill `mergeScenarios`), `onboarding/src/render/playgroundWin.mjs` (add `renderMerge` + dispatcher line), `onboarding/src/style.css` (append), `tests/unit/onboarding/content.test.js` (append block)
- Regenerate + commit: `onboarding/index.html`

**Interfaces:**
- Consumes: `ctx.diff` (`window.DoctectDiff` in the page; the real ESM `shared/diff.js` in tests), fixtures from Task 2.
- Produces: `PLAYGROUND.mergeScenarios: [{name, blurb, base, fork, upstream}]` — the five states **must deep-equal** `DIFF_SCENARIOS` (same name keys, plus a human blurb); a test pins that so the shipped presets can never drift from the parity-tested fixtures.

- [ ] **Step 1: Append the failing test block to `content.test.js`**

```js
import { DIFF_SCENARIOS } from './fixtures/diffScenarios.js';
import * as realDiff from '../../../shared/diff.js';

describe('merge lab', () => {
    it('presets mirror the parity fixtures exactly', () => {
        expect(PLAYGROUND.mergeScenarios.map(s => s.name)).toEqual(DIFF_SCENARIOS.map(s => s.name));
        PLAYGROUND.mergeScenarios.forEach((s, i) => {
            expect({ base: s.base, fork: s.fork, upstream: s.upstream })
                .toEqual({ base: DIFF_SCENARIOS[i].base, fork: DIFF_SCENARIOS[i].fork, upstream: DIFF_SCENARIOS[i].upstream });
            expect(s.blurb.length).toBeGreaterThan(20);
        });
    });
    it('renderMerge runs the engine and prints conflicts', async () => {
        const { renderPlayground } = await import('../../../onboarding/src/render/playgroundWin.mjs');
        const { defaultProfile } = await import('../../../onboarding/src/app-logic.mjs');
        const content = await buildContent();
        const el = document.createElement('div');
        const ctx = { data: { vitals: { gitSha: 'x' } }, content, profile: defaultProfile(),
            save: () => {}, navigate: () => {}, route: { win: 'playground', parts: ['merge'] },
            diff: realDiff };
        renderPlayground(el, ctx);
        el.querySelector('[data-scenario]').value = 'same-template-conflict';
        el.querySelector('[data-scenario]').dispatchEvent(new Event('change'));
        el.querySelector('[data-run]').click();
        expect(el.querySelector('.merge-out').textContent).toContain('conflict');
    });
});
```

Run — expected FAIL.

- [ ] **Step 2: Fill `mergeScenarios`**

Copy each `{name, base, fork, upstream}` literal from `tests/unit/onboarding/fixtures/diffScenarios.js` **as resolved values** (write the literals out — the content module cannot import from tests/), adding one `blurb` each:

- `clean-merge`: 'Fork edits the day template; upstream renames the variant. No overlap — applyChangeSet keeps both.'
- `same-template-conflict`: 'Both sides edit the same template differently. The engine refuses; a human decides.'
- `remove-vs-modify`: 'Fork deletes the notes template; upstream improves it. Deleting what someone improved is a conflict.'
- `variant-added-both-sides`: 'Both sides add a variant with the same id but different content — an add/add conflict.'
- `generator-conflict`: 'Both sides changed the generator source. It is one atomic value — never line-merged.'

(The easiest faithful way: temporarily `node -e` print `JSON.stringify(DIFF_SCENARIOS, null, 2)` from the fixture and paste the five objects. The mirror test in Step 1 is the drift guard.)

- [ ] **Step 3: Implement `renderMerge`** (add dispatcher line `if (section === 'merge') return renderMerge(el, ctx);`)

```js
function renderMerge(el, ctx) {
    const scenarios = ctx.content.playground.mergeScenarios;
    const lab = pgPane('merge lab · the engine the server enforces');
    lab.body.innerHTML =
        '<p><a href="#/playground">hub</a> · <span class="dim">this runs the REAL shared/diff.js, bundled at build time</span></p>' +
        `<p><select data-scenario>${scenarios.map(s => `<option value="${s.name}">${s.name}</option>`).join('')}</select>` +
        ' <button data-run>threeWayDiff</button> <button data-merge>merge (applyChangeSet)</button></p>' +
        '<p class="dim" data-blurb></p>' +
        '<div class="merge-grid">' +
        ['base', 'fork', 'upstream'].map(k =>
            `<div><div class="pane-subtitle">${k}</div><textarea data-${k} rows="14" spellcheck="false"></textarea></div>`
        ).join('') + '</div>' +
        '<div class="pane-subtitle">output</div><pre class="code merge-out">pick a scenario, edit the JSON, run.</pre>';

    const ta = { base: lab.body.querySelector('[data-base]'), fork: lab.body.querySelector('[data-fork]'),
                 upstream: lab.body.querySelector('[data-upstream]') };
    const out = lab.body.querySelector('.merge-out');
    const blurb = lab.body.querySelector('[data-blurb]');
    const load = (name) => {
        const s = scenarios.find(x => x.name === name) || scenarios[0];
        for (const k of ['base', 'fork', 'upstream']) ta[k].value = JSON.stringify(s[k], null, 2);
        blurb.textContent = s.blurb;
        out.textContent = 'pick a scenario, edit the JSON, run.';
    };
    const parseAll = () => {
        const states = {};
        for (const k of ['base', 'fork', 'upstream']) {
            try { states[k] = JSON.parse(ta[k].value); }
            catch (err) { out.textContent = `${k}: JSON parse error — ${err.message}`; return null; }
        }
        return states;
    };
    lab.body.querySelector('[data-scenario]').addEventListener('change', (e) => load(e.target.value));
    lab.body.querySelector('[data-run]').addEventListener('click', () => {
        const s = parseAll(); if (!s) return;
        const result = ctx.diff.threeWayDiff(s.base, s.fork, s.upstream);
        out.textContent = (result.conflicts.length
            ? `⚠ ${result.conflicts.length} conflict(s):\n` + result.conflicts.map(c => `  · [${c.kind}] ${c.description}`).join('\n')
            : '✓ no conflicts — mergeable') +
            '\n\nfork changed:\n' + JSON.stringify(result.source, null, 2) +
            '\n\nupstream changed:\n' + JSON.stringify(result.target, null, 2);
    });
    lab.body.querySelector('[data-merge]').addEventListener('click', () => {
        const s = parseAll(); if (!s) return;
        const check = ctx.diff.threeWayDiff(s.base, s.fork, s.upstream);
        out.textContent = check.conflicts.length
            ? `refused — ${check.conflicts.length} conflict(s), exactly like the merge endpoint would:\n` +
              check.conflicts.map(c => `  · [${c.kind}] ${c.description}`).join('\n')
            : 'merged state (fork changes replayed onto upstream):\n' +
              JSON.stringify(ctx.diff.applyChangeSet(s.base, s.fork, s.upstream), null, 2);
    });
    load(scenarios[0].name);
    el.append(lab.s);
}
```

Append to `style.css`:

```css
.merge-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin: 10px 0; }
.merge-grid textarea { width: 100%; font-size: 12px; resize: vertical; }
.merge-out { white-space: pre-wrap; max-height: 40vh; overflow-y: auto; }
@media (max-width: 900px) { .merge-grid { grid-template-columns: 1fr; } }
```

- [ ] **Step 4: Run tests, rebuild, commit**

Run: `npx vitest run tests/unit/onboarding/ && node onboarding/build.mjs`

```bash
git add onboarding/ tests/unit/onboarding/content.test.js
git commit -m "feat(onboarding): merge lab driving the bundled real diff engine on five scenarios"
```

---

### Task 11: Where-does-it-live — locate behaviors in the real tree

**Files:**
- Modify: `onboarding/src/content/playground.mjs` (fill `wdil`), `onboarding/src/render/playgroundWin.mjs` (add `renderWdil` + dispatcher line), `onboarding/src/style.css` (append), `tests/unit/onboarding/content.test.js` (append block)
- Regenerate + commit: `onboarding/index.html`

**Interfaces:**
- Consumes: `treeHtml` (Task 6, exported from `codeWin.mjs` — same runtime scope in the bundle), profile `wdil` map `{tries, done, failed}` (3 tries; `done && !failed` scores).
- Produces: `PLAYGROUND.wdil: [{id, prompt, answers: string[], hint}]`.

- [ ] **Step 1: Append the failing test block to `content.test.js`**

```js
describe('where-does-it-live', () => {
    it('ships ten prompts with existing answer paths (validator checks existence)', () => {
        expect(PLAYGROUND.wdil).toHaveLength(10);
        for (const w of PLAYGROUND.wdil) expect(w.answers.length).toBeGreaterThanOrEqual(1);
    });
});
```

Run — expected FAIL.

- [ ] **Step 2: Author the ten prompts** (fill `wdil`)

```js
    wdil: [
        { id: 'svg-sanitize', prompt: 'Someone published a malicious SVG. Which file makes sure it can’t run in your browser?',
          answers: ['components/canvas/CanvasElement.tsx'], hint: 'Sanitize at the render site, not at upload.' },
        { id: 'signup-cap', prompt: 'Where is the signup cap counted and decided?',
          answers: ['server/signupCap.js', 'server/auth.js'], hint: 'The decision is a module; the enforcement is a hook.' },
        { id: 'conflict-rules', prompt: 'Which file decides that remove-vs-modify is a merge conflict?',
          answers: ['shared/diff.js'], hint: 'Client and server both import it.' },
        { id: 'save-cas', prompt: 'A stale save gets a 409 instead of overwriting. Where is that compare-and-swap?',
          answers: ['server/routes/projects.js'], hint: 'The biggest route file.' },
        { id: 'text-wrap', prompt: 'Where is the decision made about where a long line of text wraps?',
          answers: ['services/textLayout.ts'], hint: 'One engine, two renderers.' },
        { id: 'session-trigger', prompt: 'A suspended user’s new session is refused by the database itself. Where does that guard live?',
          answers: ['server/migrations/index.js'], hint: 'It’s DDL, not route code.' },
        { id: 'typed-api', prompt: 'A component needs to call a server endpoint. Which file should it import from?',
          answers: ['services/cloudApi.ts'], hint: 'One typed wrapper, no scattered fetch.' },
        { id: 'email-fallback', prompt: 'With no email key configured, verification links print to the console. Where?',
          answers: ['server/email.js'], hint: 'Fail-safe by design.' },
        { id: 'card-rollover', prompt: 'Gallery, profile, and directory cards all cycle preview pages on hover. Which single component?',
          answers: ['components/gallery/ProjectCard.tsx'], hint: 'The profile page dropped its duplicate markup for it.' },
        { id: 'sandbox', prompt: 'Generator Preview runs untrusted code. Which file is the cage?',
          answers: ['services/generatorSandbox.ts'], hint: 'iframe + worker + captured intrinsics.' },
    ],
```

- [ ] **Step 3: Implement `renderWdil`** (add dispatcher line `if (section === 'wdil') return renderWdil(el, ctx, arg);`)

```js
function renderWdil(el, ctx, wdilId) {
    const items = ctx.content.playground.wdil;
    const item = items.find(w => w.id === wdilId) || items[0];
    const state = ctx.profile.wdil[item.id] || (ctx.profile.wdil[item.id] = { tries: 0, done: false, failed: false });

    const list = pgPane('where does it live?');
    list.body.innerHTML = '<p><a href="#/playground">hub</a></p><ol class="wdil-list">' +
        items.map(w => {
            const st = ctx.profile.wdil[w.id];
            const mark = st?.done ? (st.failed ? '<span class="amber">◦</span>' : '<span class="accent">✓</span>')
                                  : '<span class="dim">·</span>';
            return `<li>${mark} <a class="${w.id === item.id ? 'amber' : ''}" href="#/playground/wdil/${w.id}">${w.prompt}</a></li>`;
        }).join('') + '</ol>';

    const game = pgPane(`find it · ${3 - state.tries} tries left`);
    game.body.innerHTML = `<p>${item.prompt}</p>` +
        (state.tries >= 1 && !state.done ? `<p class="amber">hint: ${item.hint}</p>` : '') +
        (state.done ? `<p class="${state.failed ? 'amber' : 'accent'}">` +
            (state.failed ? 'it lives in: ' : 'correct: ') +
            item.answers.map(a => `<a href="#/code/${a}"><code>${a}</code></a>`).join(' or ') + '</p>'
          : '<p class="dim">click the file in the tree.</p>') +
        `<nav class="tree wdil-tree"></nav>`;
    game.body.querySelector('.wdil-tree').innerHTML =
        treeHtml(ctx.data.tree, '', new Set(item.answers.map(a => a.split('/')[0])));
    if (!state.done) {
        game.body.querySelector('.wdil-tree').addEventListener('click', (e) => {
            const link = e.target.closest('a.tree-file');
            if (!link) return;
            e.preventDefault();
            const picked = link.getAttribute('href').replace('#/code/', '');
            if (item.answers.includes(picked)) { state.done = true; }
            else {
                state.tries += 1;
                if (state.tries >= 3) { state.done = true; state.failed = true; }
            }
            ctx.save();
            renderPlayground(el, ctx);
        });
    }
    el.append(list.s, game.s);
}
```

Append to `style.css`:

```css
.wdil-list li { margin-bottom: 6px; }
.wdil-tree { margin-top: 10px; max-height: 50vh; overflow-y: auto; }
```

- [ ] **Step 4: Run tests, rebuild, commit**

Run: `npx vitest run tests/unit/onboarding/ && node onboarding/build.mjs`

```bash
git add onboarding/ tests/unit/onboarding/content.test.js
git commit -m "feat(onboarding): where-does-it-live file-finding game over the real tree"
```

---

### Task 12: README, final assembly, real-browser verification

**Files:**
- Create: `onboarding/README.md`
- Modify: `onboarding/src/style.css` (footer visibility), `onboarding/src/shell.html` (only if the footer needs a container tweak)
- Regenerate + commit: `onboarding/index.html`
- Throwaway (not committed): `scratch/onboarding_verify.mjs`

- [ ] **Step 1: Write `onboarding/README.md`**

```markdown
# Dev Onboarding Playground

`index.html` is a self-contained, committed page that onboards a new developer:
a tmux-styled UI with an intro (generated vitals + the house method), six guided
data-flow tours, an annotated file tree with deep dives, and a playground —
quiz ladder, bug hunt, merge lab (running the real bundled `shared/diff.js`),
and a file-finding game. Open it by double-clicking; it works over `file://`,
offline, with zero dependencies.

## Regenerate

    node onboarding/build.mjs

Rerun after meaningful repo changes (same policy as `docs-capture/`): the tree,
vitals, code excerpts, and the diff-engine bundle are read from the working
checkout at build time. The footer of the page records when and from which
commit it was built. Commit the regenerated `index.html`.

## What guards it

`tests/unit/onboarding/` (part of `npm test`):
- every file path referenced by any content module exists;
- every code-excerpt anchor resolves uniquely (the build also fails on rot);
- quiz/bug/wdil data shapes are valid (exactly one right answer, stories told);
- the bundled diff engine is behavior-identical to the real ESM module
  (parity fixtures), so the Merge Lab can never drift from what the server enforces.

There is deliberately no freshness test — regeneration is manual. If the page
looks stale, it is: rebuild it.

## Authoring

Source lives in `src/` (ESM; single-line imports; `export const/function` only —
the bundler strips module syntax by line). Content modules are data-only and
JSON-serializable. Validators: `src/content/validate.mjs`.
```

- [ ] **Step 2: Make the footer visible** — in `style.css` replace `#buildinfo { display: none; }` with:

```css
#buildinfo { color: #7d8a7a; font-size: 11px; text-align: right; padding: 1px 8px;
    background: #0c0f0d; border-top: 1px solid #1d2a20; }
```

- [ ] **Step 3: Full suite + rebuild**

Run: `npx vitest run` — everything green (existing suites + all onboarding suites).
Run: `node onboarding/build.mjs && grep -c "SLOT:" onboarding/index.html` — prints `0`.

- [ ] **Step 4: Real-browser drive (throwaway, house convention)**

Write `scratch/onboarding_verify.mjs` (Playwright, chromium; loads `file://` + the repo copy) asserting, with a screenshot per item into `scratch/`:

1. `file://…/onboarding/index.html` loads; boot sequence types, a keypress skips it, reload does not replay it (localStorage).
2. Keys `2/3/4/1` switch windows; status bar tab highlights follow; `?` opens and `Esc` closes help.
3. Intro shows non-zero vitals numbers matching `node -e` reads of the repo (spot-check migrations count).
4. Tour `publish` step 4 lights the `pin` diagram token; clicking a file chip lands on `#/code/server/migrations/index.js` with commentary visible.
5. Code window: filter for `diff`, select `shared/diff.js`; open deep dive `diff-engine`, excerpt shows `computeChangeSet` with line number.
6. Quiz L1: answer all 8 (right answers from the embedded data — read `window.DOCTECT`), best becomes 8, L2 unlocks, reload persists.
7. Bug hunt `spa-fallback`: click the `res.sendFile` line → “found it.”; story visible.
8. Merge lab: scenario `same-template-conflict` → threeWayDiff prints 1 conflict; `clean-merge` → merge prints merged state.
9. WDIL `conflict-rules`: click `shared/diff.js` in the tree → correct.
10. No console errors anywhere in the run (`page.on('pageerror')` collector is empty).

Run it: `node scratch/onboarding_verify.mjs`. Fix anything it catches test-first (unit test where the logic allows, else rerun the driver). Paste the checklist outcomes into the final commit message body.

- [ ] **Step 5: Final commit**

```bash
git add onboarding/
git commit -m "feat(onboarding): README, visible build footer, final assembled page

Real-browser verification: 10/10 checklist items passing (boot, windows,
tours, code map + dives, quiz persistence, bug hunt, merge lab, wdil,
no console errors)."
```

---

## Plan self-review (performed while writing)

- **Spec coverage:** delivery model, directory layout, chrome (status bar, keys, boot, hash routing, reduced-motion, narrow screens), intro (about/vitals/method/timeline), six tours, tree + ~60 annotations, eight deep dives with anchored excerpts, quiz 5×8 with citing explanations, bug hunt (7), merge lab on the real engine with presets, wdil (10), build script steps 1–5, validators + parity + path/anchor integrity tests, README with regen policy, footer generatedAt+sha, error handling (AnchorError, JSON parse errors inline, localStorage try/catch), real-browser final task. Spec's `onboarding/tests/` moved to `tests/unit/onboarding/` — declared in the header.
- **Placeholders:** none — every content list is written out in full; the one pointer (Merge Lab presets copying fixture literals) includes the exact command to produce them and a drift-pinning test.
- **Type consistency:** `renderIntro/renderTours/renderCode/renderPlayground`, `treeHtml(node, selectedPath, openPaths)`, `highlightCode`, `scoreProfile/rankFor/levelUnlocked`, profile shape `{v, bootSeen, quiz, bugs, wdil}`, `CODE_MAP`/`PLAYGROUND`/`INTRO`/`TOURS` export names, and the `#/win/parts` routes are used with the same signatures across Tasks 3–12. Task 8's dispatcher note resolves the forward-reference hazard explicitly.
```
