# IndexedDB Final Review Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close four final-review data-safety and release-gate defects while preserving the approved three-method local-workspace interface and lossless authority model.

**Architecture:** Treat every complete store snapshot as the authoritative durable base and overlay only active React working copies. Before authority loss unmounts the editor, synchronously capture its latest open workspace for explicit download. While legacy remains authoritative under a `copied` ledger, let explicit Retry atomically replace the unverified six-store target using ledger CAS. Expand static analysis to executable inline HTML and repository-wide executable discovery, and run the migration gate on every pull request.

**Tech Stack:** React 19, TypeScript 5.8, IndexedDB, `idb` 8.0.3, `fake-indexeddb` 6.2.5, Vitest/jsdom, Playwright 1.57.

## Global Constraints

- Source design: `docs/superpowers/specs/2026-08-16-indexeddb-final-review-fixes-design.md`.
- Parent design: `docs/superpowers/specs/2026-08-14-indexeddb-local-persistence-migration-design.md`.
- Keep `LocalWorkspaceStore` at exactly `bootstrap`, `commit`, and `exportRecoveryBundle`.
- Keep database `doctect-local-workspace`, version `1`, migration ID `local-storage-to-indexeddb-v1`, and rollout epoch `1` unchanged.
- Never set, remove, clear, or rewrite `hype_projects`, `hype_active_project`, `hype_custom_presets`, or `hype_import_pending`.
- Legacy remains authoritative until independent readback and `copied -> verified` CAS complete.
- Hashing, migration, validation, and replacement preparation occur outside IndexedDB transactions.
- Replacement of a `copied` target is explicit-Retry-only, six-store atomic, and exact-ledger-CAS protected.
- Open-work recovery remains local; no document content, names, scripts, hashes, or raw values enter analytics.
- Keep editor unmounted during recovery.
- Keep retained nonblocking Minors and pre-existing mobile editor layout out of scope.
- Use `--legacy-peer-deps` for npm install/CI commands.
- Write each production change only after its regression test fails for the expected reason.

## File Structure

- `hooks/useWorkspaceProjectWrites.ts`: authoritative durable-base replacement, working-copy overlay, synchronous open-work publication.
- `pages/EditorPage.tsx`: passes latest open-work snapshots from hook to gate callback.
- `App.tsx`: forwards gate capture callback into `EditorPage`.
- `components/workspace/WorkspaceBootstrapGate.tsx`: captures open workspace before blocking and owns local download envelope.
- `components/workspace/WorkspaceRecoveryScreen.tsx`: renders the optional **Download open work** action.
- `services/localWorkspace/indexedDbAdapter.ts`: exact copied-ledger CAS and atomic six-store replacement.
- `services/localWorkspace/LocalWorkspaceStore.ts`: explicit-retry state machine around copied-target replacement.
- `tests/unit/localWorkspaceBoundary.test.ts`: repository executable discovery, inline HTML analysis, and workflow trigger contract.
- `.github/workflows/local-workspace-migration.yml`: release gate on every pull request.
- Existing focused unit files receive regressions; no parallel test-only production seam is added.

---

### Task 1: Couple Authoritative Project Bytes and Revisions

**Files:**
- Modify: `hooks/useWorkspaceProjectWrites.ts:38-160`
- Modify: `tests/unit/useWorkspaceProjectWrites.test.tsx`
- Test: `tests/unit/localWorkspace/commit.test.ts`

**Interfaces:**
- Consumes: complete `WorkspaceSnapshot` values returned by `LocalWorkspaceStore.commit`.
- Produces: hook state where every non-working project comes from the latest complete command snapshot and every active working copy overlays that base.
- Preserves: `WorkspaceProjectWrites` public fields and the three-method store interface.

- [ ] **Step 1: Add a failing cross-project byte/revision regression**

Add a two-project builder and this test to `tests/unit/useWorkspaceProjectWrites.test.tsx`:

```tsx
const projectWithId = (id: string, name: string, scale = 1): WorkspaceProject => ({
  id,
  name,
  initialState: { ...createBlankProject(), scale },
});

it('adopts unrelated authoritative project bytes from a save snapshot', async () => {
  const initial: WorkspaceSnapshot = {
    projects: [
      projectWithId('project-a', 'A stale'),
      projectWithId('project-b', 'B initial'),
    ],
    activeProjectId: 'project-b',
    customPresets: [],
    pendingImports: [],
  };
  const authoritativeA = projectWithId('project-a', 'A from another tab', 7);
  const savedB = projectWithId('project-b', 'B saved', 2);
  const store = storeWithCommit(async () => ({
    ...initial,
    projects: [authoritativeA, savedB],
  }));
  const { result } = renderHook(() => useWorkspaceProjectWrites(store, initial));

  await act(async () => {
    await result.current.updateProject('project-b', () => savedB);
  });

  expect(result.current.workspace.projects).toEqual([authoritativeA, savedB]);
  let updateBase: WorkspaceProject | undefined;
  act(() => {
    void result.current.updateProject('project-a', current => {
      updateBase = current;
      return { ...current, name: 'A edited locally' };
    });
  });
  expect(updateBase).toEqual(authoritativeA);
});
```

Update the existing mocked out-of-order test so both coalesced callers resolve with the same newest physical store snapshot, matching `MutationQueue.settleSuccess` semantics. Retain assertions that a newer working copy overlays an older caller completion.

- [ ] **Step 2: Run the hook regression to verify RED**

Run:

```bash
npx vitest run tests/unit/useWorkspaceProjectWrites.test.tsx -t "adopts unrelated authoritative project bytes"
```

Expected: FAIL because `saveProject` replaces only `project-b` inside the prior durable snapshot, leaving `project-a` as `A stale`.

- [ ] **Step 3: Replace the complete durable base before overlay**

In `hooks/useWorkspaceProjectWrites.ts`, remove `currentProjects` and the surviving-project substitution from `reconcileStructuralSnapshot`. Use one helper for complete snapshots:

```ts
const reconcileSnapshot = useCallback((snapshot: WorkspaceSnapshot): WorkspaceSnapshot => {
  const survivingProjectIds = new Set(snapshot.projects.map(project => project.id));
  for (const projectId of workingCopiesRef.current.keys()) {
    if (survivingProjectIds.has(projectId)) continue;
    generationsRef.current.set(projectId, (generationsRef.current.get(projectId) ?? 0) + 1);
    workingCopiesRef.current.delete(projectId);
  }

  durableSnapshotRef.current = snapshot;
  const visible = overlayWorkingCopies(snapshot, workingCopiesRef.current);
  setWorkspace(visible);
  setSaveStates(current => {
    const next = new Map(current);
    for (const project of snapshot.projects) {
      if (!next.has(project.id)) next.set(project.id, { status: 'saved' });
    }
    for (const projectId of next.keys()) {
      if (!survivingProjectIds.has(projectId)) next.delete(projectId);
    }
    return next;
  });
  return snapshot;
}, []);
```

Use `reconcileSnapshot(snapshot)` for structural results. In `saveProject`, determine whether the generation is current, remove the target working copy only for current success, then call `reconcileSnapshot(snapshot)` for every successful result. Mark the target saved only for current success:

```ts
const currentCopy = workingCopiesRef.current.get(project.id);
const currentGeneration = generationsRef.current.get(project.id) === generation
  && currentCopy?.generation === generation;
if (currentGeneration) workingCopiesRef.current.delete(project.id);
reconcileSnapshot(snapshot);
if (!currentGeneration) return true;
setSaveStates(current => {
  const next = new Map(current);
  next.set(project.id, { status: 'saved' });
  return next;
});
return true;
```

Keep the existing failure-generation checks unchanged. Rename callers from `reconcileStructuralSnapshot` to `reconcileSnapshot`.

- [ ] **Step 4: Pin real-store full-snapshot ordering**

In `tests/unit/localWorkspace/commit.test.ts`, extend `adopts a newer revision for a project with no admitted local intent` to assert the unrelated result contains both `Store B durable` bytes and the local `project-b` save. Then save `project-a` from the returned object rather than constructing it from stale fixture bytes:

```ts
const observedProject = observed.projects.find(project => project.id === 'project-a');
expect(observedProject?.name).toBe('Store B durable');
const saveAfterObservation = storeA.commit({
  type: 'save-project',
  project: { ...observedProject!, name: 'Store A based on observed revision' },
});
```

This test documents that the store already returns bytes and installed private revisions from one readback; no extra publication queue is introduced.

- [ ] **Step 5: Run focused suites to verify GREEN**

Run:

```bash
npx vitest run tests/unit/useWorkspaceProjectWrites.test.tsx tests/unit/localWorkspace/commit.test.ts
```

Expected: both files PASS; no existing working-copy, conflict, coalescing, or structural test fails.

- [ ] **Step 6: Commit Task 1**

```bash
git add hooks/useWorkspaceProjectWrites.ts tests/unit/useWorkspaceProjectWrites.test.tsx tests/unit/localWorkspace/commit.test.ts
git commit -m "fix(storage): couple snapshot bytes and revisions"
```

---

### Task 2: Preserve Open Work Across Authority Loss

**Files:**
- Modify: `hooks/useWorkspaceProjectWrites.ts`
- Modify: `pages/EditorPage.tsx:38-69`
- Modify: `App.tsx:60-73`
- Modify: `components/workspace/WorkspaceBootstrapGate.tsx`
- Modify: `components/workspace/WorkspaceRecoveryScreen.tsx`
- Modify: `tests/unit/useWorkspaceProjectWrites.test.tsx`
- Modify: `tests/unit/WorkspaceBootstrapGate.test.tsx`

**Interfaces:**
- Produces: `WorkspaceEditorMount.onWorkspaceChange(snapshot: WorkspaceSnapshot): void`.
- Produces: optional `EditorPageProps.onWorkspaceChange` with the same signature.
- Produces: optional `WorkspaceRecoveryScreenProps.onExportOpenWorkspace`.
- Download envelope: `{ format: 'doctect.open-workspace-recovery'; version: 1; capturedAt: string; workspace: WorkspaceSnapshot }`.

- [ ] **Step 1: Write failing synchronous-capture hook test**

Add to `tests/unit/useWorkspaceProjectWrites.test.tsx`:

```tsx
it('publishes the newest working workspace before its save settles', () => {
  const pending = new Promise<WorkspaceSnapshot>(() => {});
  const store = storeWithCommit(() => pending);
  const onWorkspaceChange = vi.fn();
  const { result } = renderHook(() => useWorkspaceProjectWrites(
    store,
    snapshot(),
    onWorkspaceChange,
  ));
  const working = project('Unsaved authority-loss copy', 13);

  act(() => { void result.current.updateProject('project-1', () => working); });

  expect(onWorkspaceChange).toHaveBeenLastCalledWith({
    ...snapshot(),
    projects: [working],
  });
});
```

- [ ] **Step 2: Write failing gate download regression**

Import `downloadJson` beside `downloadBlob` from the already mocked
`services/browserDownload` module, reset both mocks in `beforeEach`, and call
`vi.useRealTimers()` in `afterEach`. Add an editor probe that publishes changed
workspace through the mount callback, then trigger authority loss:

```tsx
it('downloads captured open work after authority loss unmounts the editor', async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-08-16T12:00:00.000Z'));
  const store = fakeReadyStore();
  const openWorkspace = workspaceSnapshot({
    projects: [{ ...workspaceSnapshot().projects[0], name: 'Unsaved open work' }],
  });
  const renderEditor = ({ onWorkspaceChange }: WorkspaceEditorMount) => (
    <button data-testid="editor-page" onClick={() => onWorkspaceChange(openWorkspace)}>
      Publish open work
    </button>
  );
  render(<WorkspaceBootstrapGate store={store} renderEditor={renderEditor} />);
  fireEvent.click(await screen.findByTestId('editor-page'));

  act(() => store.emitAuthorityLost(recoveryResult(splitBrainRecovery())));
  expect(screen.queryByTestId('editor-page')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Download open work' }));

  expect(downloadJson).toHaveBeenCalledWith({
    format: 'doctect.open-workspace-recovery',
    version: 1,
    capturedAt: '2026-08-16T12:00:00.000Z',
    workspace: openWorkspace,
  }, 'doctect-open-workspace.json');
});
```

- [ ] **Step 3: Run both regressions to verify RED**

Run:

```bash
npx vitest run tests/unit/useWorkspaceProjectWrites.test.tsx -t "publishes the newest working workspace"
npx vitest run tests/unit/WorkspaceBootstrapGate.test.tsx -t "downloads captured open work"
```

Expected: first test fails because the hook has no callback parameter; second fails because the mount and recovery action do not exist.

- [ ] **Step 4: Publish hook snapshots synchronously**

Change the hook signature:

```ts
export function useWorkspaceProjectWrites(
  store: LocalWorkspaceStore,
  initialWorkspace: WorkspaceSnapshot,
  onWorkspaceChange?: (snapshot: WorkspaceSnapshot) => void,
): WorkspaceProjectWrites
```

Keep the callback current without triggering renders:

```ts
const onWorkspaceChangeRef = useRef(onWorkspaceChange);
onWorkspaceChangeRef.current = onWorkspaceChange;
const publishWorkspace = useCallback((snapshot: WorkspaceSnapshot) => {
  onWorkspaceChangeRef.current?.(structuredClone(snapshot));
  setWorkspace(snapshot);
}, []);
```

Call `publishWorkspace` instead of `setWorkspace` in complete-snapshot reconciliation and `updateProject`. Build the updated visible snapshot before updating refs/state, then publish it synchronously.

- [ ] **Step 5: Thread the capture callback through editor mount**

Add to `EditorPageProps`:

```ts
onWorkspaceChange?: (snapshot: WorkspaceSnapshot) => void;
```

Pass it as the hook's third argument. Add to `WorkspaceEditorMount`:

```ts
onWorkspaceChange(snapshot: WorkspaceSnapshot): void;
```

In `App.tsx`, destructure and forward it:

```tsx
renderEditor={({ store, initialWorkspace, initialWarnings, onWorkspaceChange }) => (
  <EditorPage
    store={store}
    initialWorkspace={initialWorkspace}
    initialWarnings={initialWarnings}
    onWorkspaceChange={onWorkspaceChange}
  />
)}
```

- [ ] **Step 6: Capture before blocked-state publication**

In `WorkspaceBootstrapGate.tsx`, extend blocked state with optional `openWorkspace`. Keep `openWorkspaceRef` scoped to the current store. On every ready result seed it from the verified snapshot. Pass this callback to `renderEditor`:

```ts
onWorkspaceChange(snapshot) {
  const current = committedStateRef.current;
  if (current.kind !== 'ready' || current.store !== state.store) return;
  openWorkspaceRef.current = structuredClone(snapshot);
},
```

Create blocked states through one helper:

```ts
const blockedState = (
  resultStore: LocalWorkspaceStore,
  result: WorkspaceBlockingResult,
): GateState => ({
  kind: 'blocked',
  store: resultStore,
  result,
  ...(openWorkspaceRef.current
    ? { openWorkspace: structuredClone(openWorkspaceRef.current) }
    : {}),
});
```

Use it in `publishResult`, `onAuthorityLost`, and import-consumption failure. Clear `openWorkspaceRef` when the `store` prop changes, not when the current editor unmounts.

- [ ] **Step 7: Add the local recovery action**

Import `downloadJson` in the gate. Add:

```ts
const exportOpenWorkspace = (snapshot: WorkspaceSnapshot): void => {
  setActionError(null);
  try {
    downloadJson({
      format: 'doctect.open-workspace-recovery',
      version: 1,
      capturedAt: new Date().toISOString(),
      workspace: structuredClone(snapshot),
    }, 'doctect-open-workspace.json');
  } catch {
    setActionError('Open-work download failed. Nothing was changed. Try again.');
  }
};
```

Add `onExportOpenWorkspace?: () => void` to `WorkspaceRecoveryScreenProps`. Render its button in the Recovery downloads section before store-backed exports:

```tsx
const downloadButtonClassName = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-60';

{onExportOpenWorkspace && (
  <button
    type="button"
    onClick={onExportOpenWorkspace}
    disabled={busy}
    className={downloadButtonClassName}
  >
    <Download className="size-4" aria-hidden="true" />
    Download open work
  </button>
)}
```

Use `downloadButtonClassName` for the existing store-backed buttons too. Treat
`onExportOpenWorkspace` as an available recovery download so the empty-state
copy appears only when it and `availableExports` are both absent.

- [ ] **Step 8: Run focused UI suites to verify GREEN**

Run:

```bash
npx vitest run tests/unit/useWorkspaceProjectWrites.test.tsx tests/unit/WorkspaceBootstrapGate.test.tsx tests/unit/EditorPageWorkspaceCommands.test.tsx
npx tsc --noEmit
```

Expected: all focused tests PASS; editor still unmounts on authority loss; typecheck reports zero diagnostics.

- [ ] **Step 9: Commit Task 2**

```bash
git add App.tsx pages/EditorPage.tsx hooks/useWorkspaceProjectWrites.ts components/workspace/WorkspaceBootstrapGate.tsx components/workspace/WorkspaceRecoveryScreen.tsx tests/unit/useWorkspaceProjectWrites.test.tsx tests/unit/WorkspaceBootstrapGate.test.tsx
git commit -m "fix(storage): preserve open work on authority loss"
```

---

### Task 3: Rebuild an Unverified Copy on Explicit Retry

**Files:**
- Modify: `services/localWorkspace/indexedDbAdapter.ts`
- Modify: `services/localWorkspace/LocalWorkspaceStore.ts`
- Modify: `tests/unit/localWorkspace/indexedDbAdapter.test.ts`
- Modify: `tests/unit/localWorkspace/bootstrap.test.ts`

**Interfaces:**
- Adds private adapter method:
  `replaceCopiedInitialCopy(prepared: PreparedInitialCopy, expectedLedger: MigrationLedger): Promise<void>`.
- Keeps public store interface unchanged.
- Uses existing `COPY_TRANSACTION_FAULTS` for replacement atomicity.

- [ ] **Step 1: Write failing adapter replacement tests**

First parameterize the existing local builder without changing its default
fixtures:

```ts
const preparedCopy = (digest = 'source-digest'): PreparedInitialCopy => {
  const snapshot = workspaceSnapshot();
  if (digest !== 'source-digest') {
    snapshot.projects[0] = {
      ...snapshot.projects[0],
      name: `Project ${digest}`,
    };
  }
  const migratedAt = '2026-08-14T15:00:00.000Z';
  const source = legacySnapshot();
  const backupId = `${WORKSPACE_MIGRATION_ID}:original:${digest}`;
  const projects = snapshot.projects.map(project => ({
    id: project.id,
    project,
    storageRevision: 0,
    updatedAt: migratedAt,
  }));
  const workspace = {
    id: 'current' as const,
    projectOrder: projects.map(project => project.id),
    activeProjectId: snapshot.activeProjectId,
    revision: 0,
  };
  const presets = snapshot.customPresets.map((preset, position) => ({
    id: preset.id,
    preset,
    position,
  }));
  const pendingImports = snapshot.pendingImports.map((pendingImport, position) => ({
    id: pendingImport.id,
    pendingImport,
    position,
  }));
  const backup: LegacyBackupRecord = {
    id: backupId,
    kind: 'original',
    capturedAt: migratedAt,
    snapshot: source,
    digest,
  };
  const ledger: MigrationLedger = {
    id: WORKSPACE_MIGRATION_ID,
    indexedDbVersion: 1,
    state: 'copied',
    origin: 'legacy',
    ledgerRevision: 0,
    sourceDigest: digest,
    expectedTargetDigest: `target-${digest}`,
    acceptedLegacyDigest: digest,
    originalLegacyBackupId: backupId,
    acceptedLegacyBackupId: backupId,
    keyFingerprints: [],
    projectFingerprints: [],
    presetFingerprints: [],
    counts: {
      sourceProjects: projects.length,
      targetProjects: projects.length,
      customPresets: presets.length,
      pendingImports: pendingImports.length,
    },
    migratedAt,
    verifiedAt: null,
    persistenceRolloutEpoch: 1,
    unresolvedRecovery: null,
  };

  return {
    origin: 'legacy',
    source,
    sourceDigest: digest,
    targetDigest: `target-${digest}`,
    projects,
    workspace,
    presets,
    pendingImports,
    backup,
    ledger,
  };
};
```

Then add tests that seed `oldCopy`, prepare `newCopy`, and call the wished-for
API:

```ts
it('atomically replaces an exact copied ledger with a newly prepared copy', async () => {
  const adapter = createTestAdapter();
  const oldCopy = preparedCopy();
  const newCopy = preparedCopy('new-source-digest');
  await adapter.writeInitialCopy(oldCopy);

  await adapter.replaceCopiedInitialCopy(newCopy, oldCopy.ledger);

  expect(await adapter.inspect()).toEqual({
    projects: newCopy.projects,
    workspace: [newCopy.workspace],
    presets: newCopy.presets,
    pendingImports: newCopy.pendingImports,
    migrationLedger: [newCopy.ledger],
    legacyBackup: [newCopy.backup],
  });
});

it.each(COPY_TRANSACTION_FAULTS)(
  'preserves the previous copied target when replacement fails at %s',
  async faultPoint => {
    let replacementArmed = false;
    const adapter = createTestAdapter({
      fault(point) {
        if (replacementArmed && point === faultPoint) {
          throw new Error(`Injected replacement fault at ${point}.`);
        }
      },
    });
    const oldCopy = preparedCopy();
    const newCopy = preparedCopy('new-source-digest');
    await adapter.writeInitialCopy(oldCopy);
    const before = await adapter.inspect();
    replacementArmed = true;

    await expect(adapter.replaceCopiedInitialCopy(
      newCopy,
      oldCopy.ledger,
    )).rejects.toBeInstanceOf(WorkspaceStoreError);

    expect(await adapter.inspect()).toEqual(before);
  },
);

it('rejects replacement when the copied ledger no longer matches exactly', async () => {
  const adapter = createTestAdapter();
  const oldCopy = preparedCopy();
  const newCopy = preparedCopy('new-source-digest');
  await adapter.writeInitialCopy(oldCopy);
  const before = await adapter.inspect();

  await expect(adapter.replaceCopiedInitialCopy(newCopy, {
    ...oldCopy.ledger,
    ledgerRevision: oldCopy.ledger.ledgerRevision + 1,
  })).rejects.toMatchObject({ code: 'conflict' });

  expect(await adapter.inspect()).toEqual(before);
});
```

- [ ] **Step 2: Run adapter tests to verify RED**

Run:

```bash
npx vitest run tests/unit/localWorkspace/indexedDbAdapter.test.ts -t "copied target|replacement"
```

Expected: FAIL because `replaceCopiedInitialCopy` does not exist.

- [ ] **Step 3: Extract prepared-copy writes and implement exact CAS replacement**

In `indexedDbAdapter.ts`, extract the existing add sequence from `writeInitialCopy` into a private synchronous request-enqueuing helper that retains every existing fault point:

```ts
const enqueuePreparedCopy = (
  transaction: WriteTransaction,
  prepared: PreparedInitialCopy,
  requests: Promise<unknown>[],
): void => {
  const projects = transaction.objectStore('projects');
  for (const project of prepared.projects) requests.push(projects.add(project));
  environment.fault?.('copy.after-projects');
  requests.push(transaction.objectStore('workspace').add(prepared.workspace));
  environment.fault?.('copy.after-workspace');
  for (const preset of prepared.presets) {
    requests.push(transaction.objectStore('presets').add(preset));
  }
  environment.fault?.('copy.after-presets');
  for (const pending of prepared.pendingImports) {
    requests.push(transaction.objectStore('pendingImports').add(pending));
  }
  environment.fault?.('copy.after-pending-imports');
  requests.push(transaction.objectStore('legacyBackup').add(prepared.backup));
  environment.fault?.('copy.after-backup');
  requests.push(transaction.objectStore('migrationLedger').add(prepared.ledger));
  environment.fault?.('copy.after-ledger');
  environment.fault?.('copy.before-complete');
};
```

Implement replacement in one six-store transaction:

```ts
const replaceCopiedInitialCopy = async (
  prepared: PreparedInitialCopy,
  expectedLedger: MigrationLedger,
): Promise<void> => {
  const activeDatabase = await getDatabase();
  try {
    environment.fault?.('copy.before-transaction');
  } catch (error) {
    throw mappedError(error);
  }
  let transaction: WriteTransaction | undefined;
  const requests: Promise<unknown>[] = [];
  try {
    transaction = activeDatabase.transaction(STORE_NAMES, 'readwrite');
    const ledgerStore = transaction.objectStore('migrationLedger');
    const currentLedger = await ledgerStore.get(WORKSPACE_MIGRATION_ID);
    if (!recognizedLedger(currentLedger)
      || currentLedger.state !== 'copied'
      || currentLedger.unresolvedRecovery !== null
      || canonicalStringify(currentLedger) !== canonicalStringify(expectedLedger)) {
      throw conflict('Copied migration ledger changed before replacement.');
    }
    const keys = await Promise.all(STORE_NAMES.map(name =>
      transaction!.objectStore(name).getAllKeys()));
    for (const [index, name] of STORE_NAMES.entries()) {
      const objectStore = transaction.objectStore(name);
      for (const key of keys[index]) requests.push(objectStore.delete(key));
    }
    enqueuePreparedCopy(transaction, prepared, requests);
    await Promise.all(requests);
    await transaction.done;
  } catch (error) {
    return abortTransaction(transaction, requests, error);
  }
};
```

Expose it only on private `IndexedDbAdapter`.

- [ ] **Step 4: Run adapter suite to verify GREEN**

Run:

```bash
npx vitest run tests/unit/localWorkspace/indexedDbAdapter.test.ts
```

Expected: all adapter tests PASS, including every replacement fault preserving the old inspection.

- [ ] **Step 5: Write failing store retry tests**

Extend `returns verification-failed for a copied source mismatch` in `bootstrap.test.ts` to use one store and assert first failure, then successful explicit retry:

```ts
const copy = await seedCopy(harness, { source: sourceFrom(oldValues) });
const store = createLocalWorkspaceStore(harness.environment);
const first = await store.bootstrap();
expect(recoveryResult(first).recovery.kind).toBe('verification-failed');

const retried = readyResult(await store.bootstrap());
expect(retried.snapshot.projects.map(project => project.id))
  .toEqual(['project-a', 'project-b']);
expect((await inspect(harness)).migrationLedger[0]).toMatchObject({
  state: 'verified',
});
expect((await inspect(harness)).migrationLedger[0].sourceDigest)
  .not.toBe(copy.sourceDigest);
expect(storage.mutations).toEqual([]);
```

Add these three tests:

```ts
it('preserves the previous copy when retry preparation rejects changed legacy', async () => {
  const oldValues = validLegacyValues();
  const storage = memoryStorage(oldValues);
  const harness = createHarness({ storage });
  await seedCopy(harness, { source: sourceFrom(oldValues) });
  storage.seed(LEGACY_KEYS.projects, '{');
  const store = createLocalWorkspaceStore(harness.environment);

  expect(recoveryResult(await store.bootstrap()).recovery.kind)
    .toBe('verification-failed');
  const before = canonicalStringify(await inspect(harness));
  const retry = recoveryResult(await store.bootstrap());

  expect(retry.recovery.kind).toBe('migration-failed');
  expect(canonicalStringify(await inspect(harness))).toBe(before);
  expect(storage.mutations).toEqual([]);
});

it('aborts copied replacement without changing either source', async () => {
  const oldValues = validLegacyValues();
  const storage = memoryStorage(oldValues);
  const harness = createHarness({ storage });
  await seedCopy(harness, { source: sourceFrom(oldValues) });
  storage.seed(LEGACY_KEYS.projects, JSON.stringify([legacyProject(), secondProject()]));
  const store = createLocalWorkspaceStore(harness.environment);
  expect(recoveryResult(await store.bootstrap()).recovery.kind)
    .toBe('verification-failed');
  const before = canonicalStringify(await inspect(harness));
  harness.setFault('copy.after-projects');

  expect(recoveryResult(await store.bootstrap()).recovery.kind)
    .toBe('migration-failed');
  expect(canonicalStringify(await inspect(harness))).toBe(before);
  expect(storage.mutations).toEqual([]);
});

it('lets concurrent copied retries follow one replacement winner', async () => {
  const oldValues = validLegacyValues();
  const storage = memoryStorage(oldValues);
  const harness = createHarness({ storage });
  await seedCopy(harness, { source: sourceFrom(oldValues) });
  storage.seed(LEGACY_KEYS.projects, JSON.stringify([legacyProject(), secondProject()]));
  const left = createLocalWorkspaceStore(harness.environment);
  const right = createLocalWorkspaceStore(harness.environment);
  const first = await Promise.all([left.bootstrap(), right.bootstrap()]);
  expect(first.map(result => recoveryResult(result).recovery.kind))
    .toEqual(['verification-failed', 'verification-failed']);

  const retried = await Promise.all([left.bootstrap(), right.bootstrap()]);

  expect(retried).toEqual([
    expect.objectContaining({ status: 'ready' }),
    expect.objectContaining({ status: 'ready' }),
  ]);
  const finalInspection = await inspect(harness);
  expect(finalInspection.migrationLedger).toHaveLength(1);
  expect(finalInspection.migrationLedger[0].state).toBe('verified');
  expect(finalInspection.legacyBackup).toHaveLength(1);
  expect(storage.mutations).toEqual([]);
});
```

- [ ] **Step 6: Run store retries to verify RED**

Run:

```bash
npx vitest run tests/unit/localWorkspace/bootstrap.test.ts -t "copied source mismatch|copied replacement|concurrent copied retries"
```

Expected: successful-retry and concurrency tests FAIL because Retry re-verifies the obsolete copied ledger forever.

- [ ] **Step 7: Add explicit-retry state to copied verification**

In `LocalWorkspaceStore.ts`, add private state:

```ts
let retryableCopiedLedger: MigrationLedger | undefined;
```

When a `copied` ledger verification returns `verification-failed`, retain a structured clone of that exact ledger. Clear it on ready, unsupported/unrecognized state, or successful replacement.

Change `followInspection` to accept:

```ts
const followInspection = async (
  inspection: IndexedDbInspection,
  allowCopiedReplacement: boolean,
): Promise<WorkspaceBootstrapResult>
```

Implement the branch with the existing preparation environment and an exact
inspection for the replacement:

```ts
const inspectionForPrepared = (prepared: PreparedInitialCopy): IndexedDbInspection => ({
  projects: prepared.projects,
  workspace: [prepared.workspace],
  presets: prepared.presets,
  pendingImports: prepared.pendingImports,
  migrationLedger: [prepared.ledger],
  legacyBackup: [prepared.backup],
});

if (ledger.state === 'copied'
  && allowCopiedReplacement
  && retryableCopiedLedger
  && canonicalStringify(retryableCopiedLedger) === canonicalStringify(ledger)) {
  let replacement: PreparedInitialCopy;
  try {
    replacement = await captureStableLegacySnapshot(
      environment.legacyStorage,
      source => prepareInitialCopy(source, {
        crypto: environment.crypto,
        now: environment.now,
        randomUUID: environment.randomUUID,
        createBlankProject: environment.createBlankProject,
      }),
      environment.crypto.subtle,
      { generation: () => observedLegacyChange },
    );
  } catch (error) {
    if (error instanceof LegacyCaptureError || error instanceof WorkspaceMigrationError) {
      return migrationFailure(error);
    }
    throw error;
  }
  emit('copying-projects');
  try {
    await adapter.replaceCopiedInitialCopy(replacement, ledger);
  } catch (error) {
    if (error instanceof WorkspaceStoreError && error.code === 'conflict') {
      try {
        return followInspection(await adapter.inspect(), false);
      } catch (inspectionError) {
        if (inspectionError instanceof WorkspaceStoreError) return unavailable();
        throw inspectionError;
      }
    }
    if (error instanceof WorkspaceStoreError && error.code === 'unavailable') {
      return unavailable();
    }
    if (error instanceof WorkspaceStoreError) return migrationFailure(error);
    throw error;
  }
  retryableCopiedLedger = undefined;
  return followInspection(inspectionForPrepared(replacement), false);
}
```

Create a local helper for every copied verification return:

```ts
const copiedFailure = (error?: unknown) => {
  retryableCopiedLedger = structuredClone(ledger);
  return verificationFailure(error);
};
```

Use `copiedFailure` for readback reconstruction/digest/source/CAS failures while
the ledger is still `copied`. Clear `retryableCopiedLedger` when classification
is verified, cleanup, or unrecognized, and after a ready result.

Call with `true` only for a recognized ledger present at bootstrap start. Call with `false` after a fresh copy, after observing a concurrent initial-copy winner, and after replacement. This guarantees one blocking result before explicit Retry.

- [ ] **Step 8: Run copied-retry and prior bootstrap suites to verify GREEN**

Run:

```bash
npx vitest run tests/unit/localWorkspace/bootstrap.test.ts tests/unit/localWorkspace/indexedDbAdapter.test.ts tests/unit/localWorkspace/migrationPreparation.test.ts
```

Expected: all files PASS; changed stable legacy reaches verified only on Retry; every failed replacement leaves both old target and exact legacy intact.

- [ ] **Step 9: Commit Task 3**

```bash
git add services/localWorkspace/indexedDbAdapter.ts services/localWorkspace/LocalWorkspaceStore.ts tests/unit/localWorkspace/indexedDbAdapter.test.ts tests/unit/localWorkspace/bootstrap.test.ts
git commit -m "fix(storage): rebuild copied migration on retry"
```

---

### Task 4: Close Inline HTML and Future-Root Policy Gaps

**Files:**
- Modify: `tests/unit/localWorkspaceBoundary.test.ts`
- Modify: `.github/workflows/local-workspace-migration.yml`

**Interfaces:**
- Repository policy scans executable `.js`, `.jsx`, `.mjs`, `.cjs`, `.ts`, `.tsx`, `.mts`, `.cts`, and `.html` files recursively from root.
- HTML inline scripts feed the existing symbol-aware analyzer with original path and line offsets.
- Migration workflow runs on every `pull_request`.

- [ ] **Step 1: Write failing inline HTML adversarial tests**

Add:

```ts
it('rejects reconstructed legacy access inside executable inline HTML', () => {
  const source = [
    '<script type="module">',
    "const key = 'hype_' + 'projects';",
    'const read = localStorage.getItem.bind(localStorage, key);',
    'read();',
    '</script>',
  ].join('\n');
  expect(analyzeSource('future-shell.html', source)).toEqual(expect.arrayContaining([
    expect.stringContaining('future-shell.html:4:'),
    expect.stringContaining('accesses legacy document key'),
  ]));
});

it('skips import maps but reports malformed executable inline scripts', () => {
  expect(analyzeSource('shell.html', '<script type="importmap">{"imports":{}}</script>'))
    .toEqual([]);
  expect(analyzeSource('shell.html', '<script>const broken = ;</script>'))
    .toEqual(expect.arrayContaining([expect.stringContaining('could not be parsed')]));
});
```

- [ ] **Step 2: Write failing discovery and workflow tests**

Refactor `repositorySourcePaths` to accept an optional root only after RED is observed. First add a temporary-directory test using `mkdtempSync`, `mkdirSync`, `writeFileSync`, `rmSync`, and `tmpdir`:

```ts
it('discovers executable files in future source roots without allowlist edits', () => {
  const temporaryRoot = mkdtempSync(join(tmpdir(), 'workspace-policy-'));
  try {
    mkdirSync(join(temporaryRoot, 'future-feature'));
    writeFileSync(join(temporaryRoot, 'future-feature', 'entry.ts'), 'export const ready = true;');
    mkdirSync(join(temporaryRoot, 'docs'));
    writeFileSync(join(temporaryRoot, 'docs', 'example.ts'), 'localStorage.clear();');
    expect(repositorySourcePaths(temporaryRoot)).toEqual(['future-feature/entry.ts']);
  } finally {
    rmSync(temporaryRoot, { recursive: true, force: true });
  }
});
```

Replace the exact workflow path-list test with:

```ts
it('runs the migration release gate for every pull request', () => {
  const workflow = readFileSync(
    join(root, '.github/workflows/local-workspace-migration.yml'),
    'utf8',
  );
  expect(workflow).toMatch(/pull_request:\s*\{\}/);
  expect(workflow).not.toMatch(/^\s+paths:/m);
});
```

- [ ] **Step 3: Run policy tests to verify RED**

Run:

```bash
npx vitest run tests/unit/localWorkspaceBoundary.test.ts -t "inline HTML|future source roots|every pull request"
```

Expected: all new cases FAIL: HTML is literal-only, discovery uses fixed roots, and workflow contains `paths`.

- [ ] **Step 4: Discover executable sources from root**

Replace `sourceRoots`, `rootSourceEntries`, and broad documentation extensions with:

```ts
const executableExtensions = new Set([
  '.cjs', '.cts', '.html', '.js', '.jsx', '.mjs', '.mts', '.ts', '.tsx',
]);
const excludedDirectories = new Set([
  '.claude', '.git', '.superpowers', '.worktrees',
  'archives', 'build', 'coverage', 'dist', 'docs', 'docs-content',
  'gallery-samples', 'node_modules', 'playwright-report', 'scratch', 'test-results',
]);
```

Parameterize discovery:

```ts
const sourceFiles = (directory: string): string[] => readdirSync(directory, {
  withFileTypes: true,
}).flatMap(entry => {
  const path = join(directory, entry.name);
  if (entry.isDirectory()) {
    return excludedDirectories.has(entry.name) ? [] : sourceFiles(path);
  }
  return entry.isFile() && executableExtensions.has(extname(entry.name)) ? [path] : [];
});

const repositorySourcePaths = (repositoryRoot = root): string[] =>
  sourceFiles(repositoryRoot)
    .map(path => relative(repositoryRoot, path).split(sep).join('/'))
    .sort();
```

Replace the production-path table with:

```ts
it.each([
  'App.tsx',
  'index.tsx',
  'index.html',
  'types.ts',
  'vite.config.ts',
  'lib/auth-client.ts',
  'shared/validateAppState.js',
  'constants/editor.ts',
  'server/index.js',
  'onboarding/build.mjs',
  'scripts/run-lighthouse.js',
  'tutorial/lib/servers.js',
])('discovers production path %s without a root allowlist', path => {
  expect(repositorySourcePaths()).toContain(path);
});
```

- [ ] **Step 5: Analyze executable inline scripts**

Extend analysis inputs with report metadata:

```ts
interface SourceInput {
  path: string;
  source: string;
  reportPath?: string;
  lineOffset?: number;
}
```

Extract scripts before creating the TypeScript program:

```ts
const executableInputs = (inputs: readonly SourceInput[]): SourceInput[] => inputs.flatMap(input => {
  if (extname(input.path) !== '.html') return [input];
  const scripts: SourceInput[] = [];
  const pattern = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
  let match: RegExpExecArray | null;
  let index = 0;
  while ((match = pattern.exec(input.source)) !== null) {
    const type = /\btype=["']([^"']+)["']/i.exec(match[1])?.[1]?.toLowerCase();
    if (type && type !== 'module' && type !== 'text/javascript' && type !== 'application/javascript') {
      continue;
    }
    if (match[2].trim().length === 0) continue;
    const bodyStart = match.index + match[0].indexOf('>') + 1;
    scripts.push({
      path: `${input.path}.__inline_${index}.js`,
      reportPath: input.path,
      lineOffset: input.source.slice(0, bodyStart).split('\n').length - 1,
      source: match[2],
    });
    index += 1;
  }
  return scripts;
});
```

Keep exact-literal scanning on original inputs. Replace the current `scripts`
selection with:

```ts
const scripts = executableInputs(inputs)
  .filter(input => scriptKinds.has(extname(input.path)));
```

Inside the source-file loop, normalize policy and reporting paths before the
existing import/storage checks:

```ts
const policyPath = input.reportPath ?? input.path;
const lineOffset = input.lineOffset ?? 0;
const violations = results.get(policyPath)!;
const importsAllowed = policyPath.startsWith('services/localWorkspace/')
  || policyPath === 'tests/helpers/localWorkspaceFixtures.ts';
const localWorkspaceSource = policyPath.startsWith('services/localWorkspace/');
const productionSource = !policyPath.startsWith('tests/');
const report = (node: ts.Node, message: string): void => {
  const position = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
  violations.push(`${policyPath}:${position.line + lineOffset + 1}: ${message}`);
};
```

Replace the existing parse-diagnostic push with:

```ts
violations.push(
  `${policyPath}:${position.line + lineOffset + 1}: could not be parsed: ${message}`,
);
```

Use `policyPath` for allowlist checks. This makes standalone and inline scripts
share symbol, candidate-string, alias, `.bind`, `.call`, and `.apply` analysis.

- [ ] **Step 6: Remove workflow path filtering**

Change workflow header to:

```yaml
on:
  pull_request: {}
```

Keep jobs and release-gate steps unchanged.

- [ ] **Step 7: Run policy and full boundary suites to verify GREEN**

Run:

```bash
npm run check:workspace-boundary --legacy-peer-deps
```

Expected: all boundary cases PASS; exact key literals remain confined to the two approved files; no source root list or workflow path list remains.

- [ ] **Step 8: Commit Task 4**

```bash
git add tests/unit/localWorkspaceBoundary.test.ts .github/workflows/local-workspace-migration.yml
git commit -m "test(storage): close executable policy gaps"
```

---

### Task 5: Release Verification and Final Re-review

**Files:**
- Modify: `.superpowers/sdd/final-fix-report.md`
- Modify: `.superpowers/sdd/progress.md`

**Interfaces:**
- Produces fresh unit/type/build/static/browser evidence at final HEAD.
- Produces independent Standards and Spec review against merge base `6feb8dfffe9c5452225014705d24e81aa88628aa`.

- [ ] **Step 1: Run focused review-fix suites**

Run sequentially:

```bash
npx vitest run tests/unit/useWorkspaceProjectWrites.test.tsx tests/unit/WorkspaceBootstrapGate.test.tsx tests/unit/EditorPageWorkspaceCommands.test.tsx
npx vitest run tests/unit/localWorkspace/bootstrap.test.ts tests/unit/localWorkspace/indexedDbAdapter.test.ts tests/unit/localWorkspace/commit.test.ts
npm run check:workspace-boundary --legacy-peer-deps
```

Expected: all focused files PASS with zero failed tests.

- [ ] **Step 2: Run full static, type, unit, and build verification**

Run sequentially to avoid the known load-sensitive moderation setup timeout:

```bash
npm test -- --run
npx tsc --noEmit
npm run build
git diff --check
```

Expected: 226 test files and at least 2,426 tests PASS; TypeScript exits 0; Vite builds 2,449 modules; only the existing chunk-size warning remains; diff check exits 0. If `accountModeration.test.js` alone hits its known 10-second setup timeout, run it focused, then rerun the complete suite unchanged and require a complete green run.

- [ ] **Step 3: Run supported migration browser matrix**

Use the repository-aligned official image, isolated dependencies, Node 22, and
tmpfs-backed browser profiles:

```bash
docker run --rm --ipc=host \
  --tmpfs /tmp:rw,size=8g \
  --mount type=bind,src="$PWD",dst=/work \
  --mount type=volume,dst=/work/node_modules \
  --workdir /work \
  --env CI=1 \
  --env E2E_WEB_PORT=3290 \
  --env E2E_API_PORT=3291 \
  mcr.microsoft.com/playwright:v1.57.0-noble@sha256:3bed4b1a12f2338642f3d8cba28e291deef3c66bd4a964bbeb3e57bbff511dbd \
  bash -lc 'apt-get update >/dev/null && apt-get install -y build-essential python3 >/dev/null && npm install -g n >/dev/null && n 22.23.2 >/dev/null && hash -r && npm ci --legacy-peer-deps && node -e "console.log(JSON.stringify({node:process.version,platformOverride:process.env.PLAYWRIGHT_HOST_PLATFORM_OVERRIDE??null,skipHostValidation:process.env.PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS??null}))" && npx playwright test tests/e2e/local_workspace_migration.spec.js --workers=1 --retries=0 --reporter=line'
```

Expected in supported environment: 47 passed, 3 intentional standard-project large-source skips, 0 failed across Chromium, Firefox, WebKit, `workspace-large-chromium`, and `workspace-large-firefox`.

- [ ] **Step 4: Run independent two-axis review**

Pin:

```bash
git rev-parse 6feb8dfffe9c5452225014705d24e81aa88628aa
git rev-parse HEAD
git diff 6feb8dfffe9c5452225014705d24e81aa88628aa...HEAD
git log 6feb8dfffe9c5452225014705d24e81aa88628aa..HEAD --oneline
```

Dispatch Standards and Spec reviewers independently. Standards uses repository docs plus Fowler smell baseline. Spec uses both migration designs and both implementation plans. Fix every Critical and Important finding through a new RED/GREEN cycle; retain Minors in progress notes.

- [ ] **Step 5: Record final evidence**

Append to `.superpowers/sdd/final-fix-report.md`:

- final reviewed head SHA;
- four closed findings and exact regression names;
- focused/full/type/build/static/browser command results;
- two-axis review findings and disposition;
- remaining nonblocking Minors.

Update `.superpowers/sdd/progress.md` with a `Final review fixes: complete` entry and commit ranges.

- [ ] **Step 6: Commit verification report**

Inspect status, diff, and recent log first. Then:

```bash
git add .superpowers/sdd/final-fix-report.md .superpowers/sdd/progress.md
git commit -m "docs(storage): record final review evidence"
```

- [ ] **Step 7: Confirm final workspace state**

Run:

```bash
git status --short --branch
git diff --check 6feb8dfffe9c5452225014705d24e81aa88628aa...HEAD
```

Expected: clean `feat/indexeddb-local-persistence` worktree and no whitespace errors.

## Spec Coverage

| Review-fix requirement | Plan coverage |
|---|---|
| Couple foreign project bytes to adopted private revisions | Task 1 |
| Preserve active working-copy overlays | Task 1 |
| Capture open workspace before recovery unmount | Task 2 |
| User-triggered local open-work download | Task 2 |
| First copied mismatch blocks without mutation | Task 3 |
| Explicit Retry rebuilds from authoritative stable legacy | Task 3 |
| Six-store exact-ledger CAS replacement | Task 3 |
| Replacement fault and concurrent retry safety | Task 3 |
| Inline HTML symbol/candidate analysis | Task 4 |
| Future executable roots discovered automatically | Task 4 |
| Migration gate runs on every pull request | Task 4 |
| Full release evidence and independent review | Task 5 |

## Deferred Items

- `MutationQueue.hasPending()` removal remains a nonblocking Minor.
- Mobile editor panel/toolbar redesign remains a separate user-scoped follow-up.
- Existing analytics `/api/auth/track` dev quirk and local Google OAuth configuration remain unrelated.
- Legacy cleanup remains a separate epoch-3-or-later design and plan.
