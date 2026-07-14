# Generator Source Persistence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Preserve Hierarchy Generator source with project JSON so gallery users can safely view, edit, preview, and rerun it without reverse-synchronizing manual template edits.

**Architecture:** Store validated `GeneratorProvenance` as optional schema-v9 `AppState` metadata, which existing local/cloud/gallery state pipelines carry automatically. Execute source only through an opaque-origin iframe and disposable Worker, validate the returned plain data in the parent, preview it, then atomically apply output and source. Treat generator metadata as one atomic field in three-way project merges.

**Tech Stack:** React 19, TypeScript, browser iframe/Worker APIs, CSP, Vitest/jsdom, Playwright, Express validation, existing project migration/cloud/gallery/diff services.

## Global Constraints

- Source design: `docs/superpowers/specs/2026-07-13-generator-source-persistence-design.md`.
- Project JSON schema increases exactly from v8 to v9 through a sequential `migrateV8ToV9` migration.
- Generator metadata `formatVersion` is exactly `1`.
- Each script is limited to 512 KiB UTF-8; combined scripts are limited to 1 MiB UTF-8.
- Sandbox execution timeout is exactly 5,000 ms.
- Existing state ceilings remain 5 MiB, 20,000 nodes, 50 variants, and 50,000 elements.
- Saved and gallery-provided source is inert until explicit Preview; no load/open/fork path executes it.
- Generator code receives no DOM, parent, cookie, storage, IndexedDB, cache, network, WebSocket, dynamic-import, or application-state access.
- Applying a preview replaces generated document fields and exact source atomically with one undo checkpoint.
- Manual document edits never rewrite generator source; reverse synchronization is out of scope.
- Publishing source makes it public and must show an explicit secrets/private-comments warning.
- Generator metadata merges atomically; divergent two-sided edits conflict instead of line-merging.
- No new runtime dependency.
- Existing untracked `.superpowers/brainstorm/` and `scratch/` files remain untouched.

---

### Task 1: Schema v9 and Generator Metadata Contract

**Files:**
- Create: `shared/generatorMetadata.js`
- Create: `services/loadProjectState.ts`
- Create: `tests/unit/generatorMetadata.test.ts`
- Create: `tests/unit/loadProjectState.test.ts`
- Create: `tests/unit/presets.test.ts`
- Modify: `types.ts`
- Modify: `services/migration.ts`
- Modify: `services/presets.ts`
- Modify: `tests/unit/migration.test.ts`
- Modify: `SCHEMA_CHANGELOG.md`
- Modify: `docs/2-core-data-models.md`
- Modify: `docs/3-state-management.md`

**Interfaces:**
- Produces `GeneratorProvenance`, optional `AppState.generator`, `CURRENT_SCHEMA_VERSION === 9`.
- Produces `validateGeneratorProvenance(value, options)`, `normalizeGeneratorProvenance(value)`, and `generatorProvenanceEqual(left, right)`.
- Produces `loadProjectState(raw): { state: AppState; warnings: string[] }` for all external project-load paths.

- [ ] **Step 1: Add failing metadata and migration tests**

Add these contract cases before implementation:

```ts
const source = {
  formatVersion: 1 as const,
  templateScript: 'const café = "☕";\nreturn {};',
  hierarchyScript: 'return { nodes: {}, rootId: "root" };\n',
  generatedAt: '2026-07-13T12:00:00.000Z',
};

expect(validateGeneratorProvenance(source, { strictUnknownFields: true })).toEqual({
  ok: true,
  value: source,
});
expect(generatorProvenanceEqual(source, structuredClone(source))).toBe(true);
expect(validateGeneratorProvenance({ ...source, extra: true }, { strictUnknownFields: true }).ok).toBe(false);
expect(validateGeneratorProvenance({ ...source, templateScript: 'x'.repeat(512 * 1024 + 1) }).ok).toBe(false);
expect(validateGeneratorProvenance({
  ...source,
  templateScript: 'x'.repeat(512 * 1024),
  hierarchyScript: 'y'.repeat(512 * 1024 + 1),
}).ok).toBe(false);
```

In `migration.test.ts`, add v8 input and exact assertions:

```ts
const input = { ...validV8State(), generator: source, schemaVersion: 8 };
const before = structuredClone(input);
const output = migrateState(input);

expect(CURRENT_SCHEMA_VERSION).toBe(9);
expect(output.schemaVersion).toBe(9);
expect(output.generator).toEqual(source);
expect(input).toEqual(before);
expect(migrateState(structuredClone(output))).toEqual(output);
expect(migrateState(validV8State()).generator).toBeUndefined();
expect(migrateState(validLegacyV0State()).schemaVersion).toBe(9);
```

- [ ] **Step 2: Run metadata and migration tests to verify RED**

Run:

```bash
npx vitest run tests/unit/generatorMetadata.test.ts tests/unit/loadProjectState.test.ts tests/unit/migration.test.ts
```

Expected: FAIL because metadata module/load wrapper do not exist and current schema is 8.

- [ ] **Step 3: Add runtime metadata validation and static types**

Add to `types.ts`:

```ts
export interface GeneratorProvenance {
  formatVersion: 1;
  templateScript: string;
  hierarchyScript: string;
  generatedAt: string;
}

export interface AppState {
  // existing fields remain unchanged
  generator?: GeneratorProvenance;
}
```

Implement `shared/generatorMetadata.js` with browser/Node-compatible UTF-8 counting:

```js
export const GENERATOR_FORMAT_VERSION = 1;
export const GENERATOR_SCRIPT_MAX_BYTES = 512 * 1024;
export const GENERATOR_COMBINED_MAX_BYTES = 1024 * 1024;
export const GENERATOR_KEYS = ['formatVersion', 'templateScript', 'hierarchyScript', 'generatedAt'];

const byteLength = value => new TextEncoder().encode(value).byteLength;
const isPlainObject = value => value !== null && typeof value === 'object'
  && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;

export const validateGeneratorProvenance = (value, { strictUnknownFields = false } = {}) => {
  if (!isPlainObject(value)) return { ok: false, issue: 'not_plain_object', message: 'Saved generator must be an object.' };
  if (strictUnknownFields && Object.keys(value).some(key => !GENERATOR_KEYS.includes(key))) {
    return { ok: false, issue: 'unknown_field', message: 'Saved generator contains unknown fields.' };
  }
  if (value.formatVersion !== GENERATOR_FORMAT_VERSION) return { ok: false, issue: 'format_version', message: 'Unsupported generator format version.' };
  if (typeof value.templateScript !== 'string') return { ok: false, issue: 'template_script', message: 'Template script must be text.' };
  if (typeof value.hierarchyScript !== 'string') return { ok: false, issue: 'hierarchy_script', message: 'Hierarchy script must be text.' };
  const templateBytes = byteLength(value.templateScript);
  const hierarchyBytes = byteLength(value.hierarchyScript);
  if (templateBytes > GENERATOR_SCRIPT_MAX_BYTES) return { ok: false, issue: 'template_script_too_large', message: 'Template script exceeds 512 KiB.' };
  if (hierarchyBytes > GENERATOR_SCRIPT_MAX_BYTES) return { ok: false, issue: 'hierarchy_script_too_large', message: 'Hierarchy script exceeds 512 KiB.' };
  if (templateBytes + hierarchyBytes > GENERATOR_COMBINED_MAX_BYTES) return { ok: false, issue: 'combined_scripts_too_large', message: 'Combined generator source exceeds 1 MiB.' };
  if (typeof value.generatedAt !== 'string' || Number.isNaN(Date.parse(value.generatedAt))) {
    return { ok: false, issue: 'generated_at', message: 'Generator timestamp must be ISO 8601 text.' };
  }
  return { ok: true, value: {
    formatVersion: GENERATOR_FORMAT_VERSION,
    templateScript: value.templateScript,
    hierarchyScript: value.hierarchyScript,
    generatedAt: value.generatedAt,
  } };
};

export const normalizeGeneratorProvenance = value => {
  if (value === undefined) return {};
  const result = validateGeneratorProvenance(value);
  return result.ok ? { generator: result.value } : { warning: `Saved generator was detached: ${result.message}` };
};

export const generatorProvenanceEqual = (left, right) =>
  left === undefined && right === undefined
  || Boolean(left && right
    && left.formatVersion === right.formatVersion
    && left.templateScript === right.templateScript
    && left.hierarchyScript === right.hierarchyScript
    && left.generatedAt === right.generatedAt);
```

- [ ] **Step 4: Add v8→v9 migration and load normalization**

Set `CURRENT_SCHEMA_VERSION = 9`, add the sequential runner branch, and add:

```ts
function migrateV8ToV9(state: any): any {
  console.log('[Migration] Applying v8 → v9: Adding optional generator provenance');
  const migrated = JSON.parse(JSON.stringify(state));
  migrated.schemaVersion = 9;
  return migrated;
}
```

Implement `services/loadProjectState.ts` so malformed optional metadata never blocks document load:

```ts
import type { AppState } from '../types';
import { migrateState } from './migration';
import { normalizeGeneratorProvenance } from '../shared/generatorMetadata.js';

export interface ProjectLoadResult { state: AppState; warnings: string[] }

export const loadProjectState = (raw: unknown): ProjectLoadResult => {
  const migrated = migrateState(raw);
  const normalized = normalizeGeneratorProvenance((migrated as AppState).generator);
  if (!normalized.warning) return { state: { ...migrated, ...(normalized.generator ? { generator: normalized.generator } : {}) }, warnings: [] };
  const state = { ...migrated } as AppState;
  delete state.generator;
  return { state, warnings: [normalized.warning] };
};
```

Keep `loadPreset` stamping `CURRENT_SCHEMA_VERSION`; add assertions that blank/notebook/planner projects are v9 and have no `generator`.
Use `loadProjectState` when hydrating saved custom presets; preserve the project while logging each non-fatal metadata-detachment warning with `console.warn`.

- [ ] **Step 5: Run focused tests to verify GREEN**

Run:

```bash
npx vitest run tests/unit/generatorMetadata.test.ts tests/unit/loadProjectState.test.ts tests/unit/migration.test.ts tests/unit/presets.test.ts
```

Expected: all focused tests PASS.

- [ ] **Step 6: Update schema documentation**

Add v9 to `SCHEMA_CHANGELOG.md`, document `GeneratorProvenance` in `docs/2-core-data-models.md`, and describe sequential v8→v9 migration plus optional-source detachment in `docs/3-state-management.md`. State explicitly that old projects cannot recover discarded source.

- [ ] **Step 7: Commit**

```bash
git add shared/generatorMetadata.js services/loadProjectState.ts types.ts services/migration.ts services/presets.ts tests/unit/generatorMetadata.test.ts tests/unit/loadProjectState.test.ts tests/unit/migration.test.ts tests/unit/presets.test.ts SCHEMA_CHANGELOG.md docs/2-core-data-models.md docs/3-state-management.md
git commit -m "feat(generator): persist source metadata in schema v9"
```

---

### Task 2: Sandboxed Generator Runner and Output Validation

**Files:**
- Create: `shared/projectLimits.js`
- Create: `services/generatorSandbox.ts`
- Create: `services/validateGeneratedProject.ts`
- Create: `tests/unit/generatorSandbox.test.ts`
- Create: `tests/unit/validateGeneratedProject.test.ts`
- Modify: `services/generatorTemplates.ts`
- Modify: `server/validateAppState.js`
- Modify: `tests/unit/generatorTemplates.test.ts`

**Interfaces:**
- Consumes metadata limits from Task 1.
- Produces `runGeneratorSandbox(request): Promise<GeneratorSandboxResult>`.
- Produces `validateGeneratedProject(raw): GeneratedProjectValidation` and `GeneratedProjectSummary`.
- Produces shared project ceiling constants used by browser validation and server validation.

- [ ] **Step 1: Add failing validator and sandbox lifecycle tests**

Cover valid flat/variant output, missing root, unknown node type, functions/custom prototypes/cycles, 20,001 nodes, 51 variants, 50,001 elements, and >5 MiB output. Add sandbox transport tests using fake iframe/clock hooks for success, runtime failure, malformed protocol, 5,000 ms timeout, cancellation, and teardown exactly once.

Core assertions:

```ts
const validation = validateGeneratedProject({ templates: validTemplates(), hierarchy: validHierarchy() });
expect(validation).toMatchObject({
  ok: true,
  summary: { variantCount: 1, templateCount: 1, nodeCount: 1, estimatedPageCount: 1 },
});

vi.useFakeTimers();
const dispose = vi.fn();
const environment: GeneratorSandboxEnvironment = {
  createRequestToken: () => 'test-token',
  createFrame: () => ({ post: vi.fn(), dispose }),
};
const pending = runGeneratorSandbox(validRequest(), environment);
await vi.advanceTimersByTimeAsync(5000);
await expect(pending).resolves.toMatchObject({ ok: false, category: 'timeout' });
expect(dispose).toHaveBeenCalledTimes(1);
```

- [ ] **Step 2: Run focused tests to verify RED**

```bash
npx vitest run tests/unit/generatorSandbox.test.ts tests/unit/validateGeneratedProject.test.ts tests/unit/generatorTemplates.test.ts
```

Expected: FAIL because sandbox/validator modules and shared limits do not exist.

- [ ] **Step 3: Extract shared project limits and generated-output validation**

Create `shared/projectLimits.js`:

```js
export const MAX_STATE_BYTES = 5 * 1024 * 1024;
export const MAX_NODES = 20000;
export const MAX_VARIANTS = 50;
export const MAX_ELEMENTS = 50000;
```

Make `server/validateAppState.js` import these constants without changing existing behavior.

Implement `services/validateGeneratedProject.ts` with these exact public shapes, importing `GeneratorSandboxRawResult` as a type from `generatorSandbox.ts`:

```ts
import type { GeneratorSandboxRawResult } from './generatorSandbox';

export interface GeneratedProject {
  nodes: Record<string, AppNode>;
  rootId: string;
  variants: Record<string, Variant>;
  activeVariantId: string;
  schemaVersion: 9;
}
export interface GeneratedProjectSummary {
  variantCount: number;
  variantNames: string[];
  templateCount: number;
  nodeCount: number;
  estimatedPageCount: number;
  warnings: string[];
}
export type GeneratedProjectValidation =
  | { ok: true; project: GeneratedProject; summary: GeneratedProjectSummary }
  | { ok: false; category: 'template' | 'hierarchy' | 'limits' | 'migration'; message: string };

export function validateGeneratedProject(raw: GeneratorSandboxRawResult): GeneratedProjectValidation;
```

Use `normalizeGeneratedTemplates`, reject non-plain JSON recursively, normalize node `data`/`children`, verify root and every node type, enforce shared ceilings, migrate to schema v9, and use `computePageOrder` for estimated pages. Do not mutate sandbox output.

- [ ] **Step 4: Implement opaque iframe + disposable Worker runner**

Expose:

```ts
export interface GeneratorSandboxRequest {
  templateScript: string;
  hierarchyScript: string;
  constants: { RM_PP_WIDTH: number; RM_PP_HEIGHT: number; A4_WIDTH: number; A4_HEIGHT: number };
  timeoutMs?: number;
}
export interface GeneratorSandboxRawResult { templates: unknown; hierarchy: unknown }
export interface GeneratorSandboxEnvironment {
  createRequestToken(): string;
  createFrame(args: {
    requestToken: string;
    onMessage: (message: unknown) => void;
  }): { post: (request: GeneratorSandboxRequest) => void; dispose: () => void };
}
export type GeneratorSandboxResult =
  | { ok: true; value: GeneratorSandboxRawResult }
  | { ok: false; category: 'runtime' | 'timeout' | 'clone' | 'protocol'; message: string };

export const runGeneratorSandbox = (
  request: GeneratorSandboxRequest,
  environment?: GeneratorSandboxEnvironment,
): Promise<GeneratorSandboxResult>;
```

The generated iframe document must contain this CSP and no `allow-same-origin` token:

```html
<meta http-equiv="Content-Security-Policy"
      content="default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval'; worker-src blob:; connect-src 'none'">
```

Trusted iframe bootloader creates one blob Worker. Before evaluating source, worker sets `fetch`, `XMLHttpRequest`, `WebSocket`, `localStorage`, `sessionStorage`, `cookieStore`, `indexedDB`, `caches`, and `importScripts` to `undefined`; it exposes only page constants, normalized templates, and `createId`. Parent accepts messages only from the created iframe window with a cryptographically random request token, validates protocol shape, clears timeout, removes listener, terminates worker through iframe teardown, revokes URLs, and removes iframe on every exit path.

Use destructured constants instead of current `with (consts)`:

```js
const templateFn = new Function(
  'consts',
  'const { RM_PP_WIDTH, RM_PP_HEIGHT, A4_WIDTH, A4_HEIGHT } = consts;\n'
    + templateScript,
);
const templates = templateFn(constants);
const hierarchyFn = new Function('templates', 'createId', hierarchyScript);
const hierarchy = hierarchyFn(activeTemplates, createId);
```

Reject Promise results; generator contract remains synchronous.

- [ ] **Step 5: Run focused and server-regression tests**

```bash
npx vitest run tests/unit/generatorSandbox.test.ts tests/unit/validateGeneratedProject.test.ts tests/unit/generatorTemplates.test.ts tests/unit/server/validateAppState.test.js
```

Expected: all tests PASS and existing server ceilings remain unchanged.

- [ ] **Step 6: Commit**

```bash
git add shared/projectLimits.js services/generatorSandbox.ts services/validateGeneratedProject.ts services/generatorTemplates.ts server/validateAppState.js tests/unit/generatorSandbox.test.ts tests/unit/validateGeneratedProject.test.ts tests/unit/generatorTemplates.test.ts
git commit -m "feat(generator): sandbox source previews"
```

---

### Task 3: Preview, Apply, Undo, and Detach Workflow

**Files:**
- Create: `services/projectDocumentSnapshot.ts`
- Create: `tests/unit/HierarchyGeneratorModal.test.tsx`
- Create: `tests/unit/projectDocumentSnapshot.test.ts`
- Modify: `components/HierarchyGeneratorModal.tsx`
- Modify: `components/ProjectEditor.tsx`
- Modify: `tests/e2e/editor_advanced.spec.js`

**Interfaces:**
- Consumes Task 1 provenance and Task 2 sandbox/validator.
- Produces generator modal props `savedGenerator`, `onApplyGenerated`, and `onDetachSavedGenerator`.
- Produces document snapshot helpers that atomically preserve generated fields and provenance through undo/redo.

- [ ] **Step 1: Add failing modal and snapshot tests**

Mock `runGeneratorSandbox` but use real `validateGeneratedProject`. Cover:

```ts
expect(runGeneratorSandbox).not.toHaveBeenCalled(); // opening saved source is inert
expect(screen.getByDisplayValue(saved.templateScript)).toBeVisible();
expect(screen.getByText('Saved Generator')).toBeVisible();

await user.click(screen.getByRole('button', { name: 'Preview' }));
expect(onApplyGenerated).not.toHaveBeenCalled();
expect(screen.getByText('1 template')).toBeVisible();

await user.click(screen.getByRole('button', { name: 'Apply Generated Project' }));
expect(onApplyGenerated).toHaveBeenCalledWith(
  expect.objectContaining({ rootId: 'root' }),
  { templateScript: saved.templateScript, hierarchyScript: saved.hierarchyScript },
);
```

Also cover failed preview, dirty close, dirty preset switch, cancel, exact draft source, detach confirmation, and disabled Apply before success. Snapshot tests must prove root/variant/schema/generator restoration and that normal UI-only state stays current.

- [ ] **Step 2: Run focused tests to verify RED**

```bash
npx vitest run tests/unit/HierarchyGeneratorModal.test.tsx tests/unit/projectDocumentSnapshot.test.ts
```

Expected: FAIL because modal still executes/imports immediately and document snapshot helper does not exist.

- [ ] **Step 3: Add focused document snapshot helpers**

Implement:

```ts
export type DocumentSnapshot = Pick<AppState,
  'nodes' | 'rootId' | 'variants' | 'activeVariantId' | 'schemaVersion'
  | 'generator' | 'selectedNodeId' | 'selectedNodeIds'
  | 'selectedTemplateId' | 'selectedTemplateIds' | 'selectedElementIds'>;

export const snapshotDocument = (state: AppState): DocumentSnapshot => structuredClone({
  nodes: state.nodes,
  rootId: state.rootId,
  variants: state.variants,
  activeVariantId: state.activeVariantId,
  schemaVersion: state.schemaVersion,
  generator: state.generator,
  selectedNodeId: state.selectedNodeId,
  selectedNodeIds: state.selectedNodeIds,
  selectedTemplateId: state.selectedTemplateId,
  selectedTemplateIds: state.selectedTemplateIds,
  selectedElementIds: state.selectedElementIds,
});

export const restoreDocument = (state: AppState, snapshot: DocumentSnapshot): AppState => ({
  ...state,
  ...structuredClone(snapshot),
});
```

Change editor history from `{nodes, variants}` to `DocumentSnapshot`; preserve existing undo behavior while adding generated-document fields and provenance.

- [ ] **Step 4: Replace direct generator execution with preview state machine**

Change modal props to:

```ts
interface HierarchyGeneratorModalProps {
  isOpen: boolean;
  savedGenerator?: GeneratorProvenance;
  onClose: () => void;
  onApplyGenerated: (
    project: GeneratedProject,
    source: Pick<GeneratorProvenance, 'templateScript' | 'hierarchyScript'>,
  ) => boolean;
  onDetachSavedGenerator: () => boolean;
}
```

Use states `idle | running | ready | error`; initialize drafts from `savedGenerator` on each closed→open transition, otherwise current simple preset. Preview validates metadata-size limits, runs sandbox, validates output, then stores `{project, summary, source}`. Any source edit clears the prior preview. Dirty close/preset changes call `window.confirm`. Apply calls `onApplyGenerated` only from `ready`. Remove all same-realm `new Function` calls from the React component.

Preview copy must show variants/templates/nodes/estimated pages and:

> Applying replaces the current generated document. Manual template and hierarchy edits are not written back to generator source.

- [ ] **Step 5: Wire atomic apply and detach in ProjectEditor**

Replace `handleImportGenerated` with an apply callback that checkpoints once and performs one state update:

```ts
const handleApplyGenerated = (
  project: GeneratedProject,
  source: Pick<GeneratorProvenance, 'templateScript' | 'hierarchyScript'>,
) => {
  saveToHistory();
  const generatedAt = new Date().toISOString();
  setState(current => ({
    ...current,
    nodes: project.nodes,
    rootId: project.rootId,
    variants: project.variants,
    activeVariantId: project.activeVariantId,
    schemaVersion: CURRENT_SCHEMA_VERSION,
    generator: { formatVersion: 1, ...source, generatedAt },
    selectedNodeId: project.rootId,
    selectedNodeIds: [project.rootId],
    selectedTemplateId: '',
    selectedTemplateIds: [],
    selectedElementIds: [],
  }));
  return true;
};
```

Detach checkpoints once, deletes only `generator`, and returns true. Manual element/node/template updates never touch `generator`. Pass callbacks and `state.generator` into modal.

- [ ] **Step 6: Run focused tests and update generator browser flow**

Update `editor_advanced.spec.js` to click **Preview**, assert summary and unchanged canvas, click **Apply Generated Project**, then verify generated canvas. Add reload assertion that source reopens exactly and a manual element edit does not change it.

Run:

```bash
npx vitest run tests/unit/HierarchyGeneratorModal.test.tsx tests/unit/projectDocumentSnapshot.test.ts
npm run test:e2e -- tests/e2e/editor_advanced.spec.js
```

Expected: unit and Chromium generator flow PASS.

- [ ] **Step 7: Commit**

```bash
git add services/projectDocumentSnapshot.ts components/HierarchyGeneratorModal.tsx components/ProjectEditor.tsx tests/unit/HierarchyGeneratorModal.test.tsx tests/unit/projectDocumentSnapshot.test.ts tests/e2e/editor_advanced.spec.js
git commit -m "feat(generator): preview and apply saved source"
```

---

### Task 4: Persistence, Publishing, Gallery, and History

**Files:**
- Create: `tests/unit/PublishModal.test.tsx`
- Create: `tests/unit/EditorPageGeneratorMetadata.test.tsx`
- Create: `tests/unit/JsonModalGeneratorMetadata.test.tsx`
- Modify: `pages/EditorPage.tsx`
- Modify: `components/JsonModal.tsx`
- Modify: `components/cloud/HistoryModal.tsx`
- Modify: `components/cloud/PublishModal.tsx`
- Modify: `server/validateAppState.js`
- Modify: `tests/unit/server/validateAppState.test.js`
- Modify: `tests/unit/server/stateCodec.test.js`
- Modify: `tests/unit/server/commitStorage.test.js`
- Modify: `tests/unit/server/gallery.test.js`
- Modify: `tests/unit/HistoryModal.test.tsx`
- Modify: `tests/unit/GalleryDetailPage.test.tsx`
- Modify: `tests/unit/generateVariantsZip.test.ts`
- Modify: `docs/6-advanced-features.md`
- Modify: `pages/DocsPage.tsx`

**Interfaces:**
- Consumes `loadProjectState` and strict metadata validation from Task 1.
- Existing full-state storage APIs remain unchanged.
- Produces explicit public-source warning and exact persistence evidence through every required path.

- [ ] **Step 1: Add failing strict-validation and round-trip tests**

Add server cases for valid metadata and each invalid field/limit, including strict unknown-key rejection:

```js
expect(validateAppState({ ...goodState(), generator: validGenerator() })).toEqual({ ok: true });
expect(validateAppState({ ...goodState(), generator: { ...validGenerator(), secret: true } })).toMatchObject({ ok: false });
expect(validateAppState({ ...goodState(), generator: { ...validGenerator(), formatVersion: 2 } })).toMatchObject({ ok: false });
```

Use whitespace/Unicode scripts and assert exact equality after codec, cloud commit fetch, gallery state fetch, fork first commit, history restore/clone, and gallery open/fork staging. Add a ZIP fixture with metadata and assert PDF entry names/counts remain identical.

Add UI import cases: local storage and staged gallery imports with malformed metadata open without `generator` and show a non-fatal `role="alert"`; JSON modal save removes malformed metadata, calls `onSave`, closes, and alerts once. Add valid-source cases proving JSON modal import preserves scripts byte-for-byte and EditorPage's JSON download contains the exact nested `generator` object.

- [ ] **Step 2: Run persistence tests to verify RED**

```bash
npx vitest run tests/unit/server/validateAppState.test.js tests/unit/server/stateCodec.test.js tests/unit/server/commitStorage.test.js tests/unit/server/gallery.test.js tests/unit/HistoryModal.test.tsx tests/unit/GalleryDetailPage.test.tsx tests/unit/generateVariantsZip.test.ts tests/unit/PublishModal.test.tsx tests/unit/EditorPageGeneratorMetadata.test.tsx tests/unit/JsonModalGeneratorMetadata.test.tsx
```

Expected: strict validation, warning UI, and import normalization assertions FAIL.

- [ ] **Step 3: Normalize every external load boundary with warnings**

Replace direct `migrateState(raw)` calls for local saved projects, staged gallery/fork imports, JSON modal imports, and history restore with `loadProjectState(raw)`. Keep history cloning raw because `EditorPage` normalizes staged imports exactly once.

In `EditorPage`, extract initial local-storage loading into a pure `loadSavedProjects()` helper returning `{ projects, warnings }`; initialize both project state and one dismissible `role="alert"` warning banner from that result. Staged imports append their warnings to the same banner. In `JsonModal`, call `onSave(result.state)`, close, then call `window.alert(result.warnings.join('\n'))` when warnings exist. In restore-mode `HistoryModal`, call `onRestore(result.state)` and show the same alert after restore. Keep existing fatal migration error handling unchanged.

Do not normalize built-in generator output here; Task 2 validator already produces current-schema output.

- [ ] **Step 4: Enforce strict metadata validation on server saves**

In `server/validateAppState.js`, when `state.generator !== undefined`, call:

```js
const generatorResult = validateGeneratorProvenance(state.generator, { strictUnknownFields: true });
if (!generatorResult.ok) return fail(generatorResult.message);
```

Continue enforcing total 5 MiB state size before detailed validation. Do not alter commit, codec, gallery, or fork payload shapes; tests must prove full-state behavior carries source automatically.

- [ ] **Step 5: Add publish warning**

When `project.initialState.generator` exists, render an amber `role="alert"` block in `PublishModal` before confirmation:

> This project includes saved generator source. Publishing makes both scripts public. Review them for secrets, private comments, or identifying information. To exclude source, cancel, use “Detach Saved Generator” in Hierarchy Generator, and save to cloud before publishing.

Projects without metadata show no generator warning. Existing publish behavior and visibility warning remain unchanged.

- [ ] **Step 6: Update user documentation**

Document source retention, public visibility, inert opening, sandboxed Preview, replacement Apply, detach action, and no reverse synchronization in `docs/6-advanced-features.md`, `pages/DocsPage.tsx`, and Hierarchy Generator help text.

- [ ] **Step 7: Run focused persistence suites**

```bash
npx vitest run tests/unit/server/validateAppState.test.js tests/unit/server/stateCodec.test.js tests/unit/server/commitStorage.test.js tests/unit/server/gallery.test.js tests/unit/HistoryModal.test.tsx tests/unit/GalleryDetailPage.test.tsx tests/unit/generateVariantsZip.test.ts tests/unit/PublishModal.test.tsx tests/unit/EditorPageGeneratorMetadata.test.tsx tests/unit/JsonModalGeneratorMetadata.test.tsx
```

Expected: all focused tests PASS with exact script equality.

- [ ] **Step 8: Commit**

```bash
git add pages/EditorPage.tsx components/JsonModal.tsx components/cloud/HistoryModal.tsx components/cloud/PublishModal.tsx server/validateAppState.js tests/unit/server/validateAppState.test.js tests/unit/server/stateCodec.test.js tests/unit/server/commitStorage.test.js tests/unit/server/gallery.test.js tests/unit/HistoryModal.test.tsx tests/unit/GalleryDetailPage.test.tsx tests/unit/generateVariantsZip.test.ts tests/unit/PublishModal.test.tsx tests/unit/EditorPageGeneratorMetadata.test.tsx tests/unit/JsonModalGeneratorMetadata.test.tsx docs/6-advanced-features.md pages/DocsPage.tsx components/HierarchyGeneratorModal.tsx
git commit -m "feat(generator): retain source across gallery flows"
```

---

### Task 5: Atomic Generator Diff and Merge Support

**Files:**
- Modify: `shared/diff.js`
- Modify: `server/routes/mergeRequests.js`
- Modify: `services/cloudApi.ts`
- Modify: `pages/MergeRequestPage.tsx`
- Modify: `tests/unit/shared/diff.test.js`
- Modify: `tests/unit/server/mergeRequests.test.js`
- Modify: `tests/unit/MergeRequestPage.test.tsx`

**Interfaces:**
- Consumes `generatorProvenanceEqual` from Task 1.
- Adds `generatorChange: null | 'added' | 'modified' | 'removed'` to change sets.
- Adds conflict kind `generator`; generator metadata remains atomic.

- [ ] **Step 1: Add failing add/change/remove/conflict tests**

Add all cases required by the spec:

```js
expect(computeChangeSet(baseWithoutGenerator, withGenerator).generatorChange).toBe('added');
expect(computeChangeSet(withGenerator, changedGenerator).generatorChange).toBe('modified');
expect(computeChangeSet(withGenerator, baseWithoutGenerator).generatorChange).toBe('removed');

expect(applyChangeSet(base, sourceChanged, targetUnchanged).generator).toEqual(sourceChanged.generator);
expect(applyChangeSet(base, sourceUnchanged, targetChanged).generator).toEqual(targetChanged.generator);
expect(applyChangeSet(base, sourceRemoved, targetUnchanged).generator).toBeUndefined();
expect(threeWayDiff(base, sourceChanged, targetChangedDifferently).conflicts)
  .toContainEqual(expect.objectContaining({ kind: 'generator' }));
```

Also test identical two-sided changes, modify-vs-remove in both directions, unchanged source preserving target, MR “has changes”, merged commit metadata, and one UI row `Generator source changed`.

- [ ] **Step 2: Run merge tests to verify RED**

```bash
npx vitest run tests/unit/shared/diff.test.js tests/unit/server/mergeRequests.test.js tests/unit/MergeRequestPage.test.tsx
```

Expected: FAIL because change sets ignore generator metadata.

- [ ] **Step 3: Extend change-set and conflict calculation**

Add to every empty/default change set and `ChangeSetDto`:

```ts
generatorChange: null | 'added' | 'modified' | 'removed';
```

Classification uses normalized absence (`state.generator ?? null`) and whole-value equality. In `threeWayDiff`, when both sides changed generator:

```js
if (sourceChanged && targetChanged
    && !generatorProvenanceEqual(source.generator, target.generator)) {
  conflicts.push({
    kind: 'generator',
    id: 'generator',
    description: 'Generator source changed differently on both branches.',
  });
}
```

- [ ] **Step 4: Apply generator changes atomically and expose them**

In `applyChangeSet`, only source-side generator changes alter target:

```js
if (changes.generatorChange === 'removed') delete merged.generator;
if (changes.generatorChange === 'added' || changes.generatorChange === 'modified') {
  merged.generator = clone(source.generator);
}
```

Include `generatorChange !== null` in MR no-op detection. Render exactly one summary row, `~ Generator source changed`, for any add/modify/remove. Existing generic conflict rendering may show the generator conflict description.

- [ ] **Step 5: Run focused merge tests**

```bash
npx vitest run tests/unit/shared/diff.test.js tests/unit/server/mergeRequests.test.js tests/unit/MergeRequestPage.test.tsx
```

Expected: all focused tests PASS; existing node/template merge cases remain green.

- [ ] **Step 6: Commit**

```bash
git add shared/diff.js server/routes/mergeRequests.js services/cloudApi.ts pages/MergeRequestPage.tsx tests/unit/shared/diff.test.js tests/unit/server/mergeRequests.test.js tests/unit/MergeRequestPage.test.tsx
git commit -m "feat(generator): merge saved source atomically"
```

---

### Task 6: Security, Gallery, and End-to-End Verification

**Files:**
- Modify: `tests/e2e/editor_advanced.spec.js`
- Modify: `tests/e2e/gallery.spec.js`
- Modify: `tests/e2e/fork.spec.js`
- Modify: `tests/e2e/merge_requests.spec.js`
- Modify only if verification exposes a defect: files from Tasks 1–5

**Interfaces:**
- Consumes completed source persistence, sandbox, preview/apply, gallery, and merge behavior.
- Produces browser evidence for security boundary and all acceptance criteria.

- [ ] **Step 1: Add sandbox attack and timeout browser cases**

Through the real modal, preview scripts that assert these globals are unavailable:

```js
if (typeof window !== 'undefined' || typeof document !== 'undefined') throw new Error('DOM exposed');
if (typeof fetch !== 'undefined' || typeof XMLHttpRequest !== 'undefined') throw new Error('network exposed');
if (typeof WebSocket !== 'undefined' || typeof indexedDB !== 'undefined') throw new Error('browser capability exposed');
if (typeof localStorage !== 'undefined' || typeof sessionStorage !== 'undefined') throw new Error('storage exposed');
if (typeof cookieStore !== 'undefined') throw new Error('cookies exposed');
if (typeof caches !== 'undefined' || typeof importScripts !== 'undefined') throw new Error('loader exposed');
```

Return a valid one-page project afterward and verify preview succeeds. Add a separate script that returns `import('/generator-sandbox-must-not-load.js')`; assert preview rejects the Promise/dynamic import and the test server receives no request. Then use `while (true) {}` and assert timeout appears after 5 seconds, current canvas remains unchanged, and modal remains responsive. Verify no request reaches test server during either attack case.

- [ ] **Step 2: Add publish/open/fork persistence browser flow**

Generate/apply source containing distinctive whitespace and Unicode, save cloud project, publish, assert public-source warning, open gallery project in a second context, and verify source appears but does not run. Edit, preview, apply, save, reload, and verify exact edited source. Fork and assert fork starts with exact source.

- [ ] **Step 3: Add merge-request source cases**

In `merge_requests.spec.js`, regenerate source/output in fork, create MR, assert `Generator source changed`, merge, and verify target source/output match. Add divergent target/fork source changes and assert generator conflict blocks merge.

- [ ] **Step 4: Run focused browser suites**

```bash
npm run test:e2e -- tests/e2e/editor_advanced.spec.js tests/e2e/gallery.spec.js tests/e2e/fork.spec.js tests/e2e/merge_requests.spec.js
```

Expected: all focused browser cases PASS on configured Playwright project; sandbox timeout does not hang suite.

- [ ] **Step 5: Commit end-to-end coverage**

```bash
git add tests/e2e/editor_advanced.spec.js tests/e2e/gallery.spec.js tests/e2e/fork.spec.js tests/e2e/merge_requests.spec.js
git commit -m "test(generator): verify published source workflow"
```

- [ ] **Step 6: Run full unit suite and production build**

```bash
npm test -- --run && npm run build
```

Expected: all tests PASS and Vite build exits 0. Existing chunk-size warning may remain; no new build error is allowed.

- [ ] **Step 7: Run full browser suite**

```bash
npm run test:e2e
```

Expected: full Playwright suite PASS.

- [ ] **Step 8: Inspect final state and commit verification fixes**

```bash
git status --short
git diff --check
```

Expected: no tracked changes and no whitespace errors. Do not create an empty commit.
