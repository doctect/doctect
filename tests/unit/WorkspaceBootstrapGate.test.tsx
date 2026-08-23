import { StrictMode, Suspense, startTransition, useLayoutEffect, useState } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { downloadBlob, downloadJson } from '../../services/browserDownload';
import { trackEvent } from '../../services/analytics';
import {
  WorkspaceBootstrapGate,
  type WorkspaceEditorMount,
} from '../../components/workspace/WorkspaceBootstrapGate';
import { MigrationReceipt } from '../../components/workspace/MigrationReceipt';
import { WorkspaceRecoveryScreen } from '../../components/workspace/WorkspaceRecoveryScreen';
import {
  OPEN_WORKSPACE_PRESENTATION,
  PROJECT_COPY_HELPER_TEXT,
  PROJECT_DOWNLOAD_ERROR,
  RECOVERY_SOURCE_PRESENTATION,
  SEPARATE_COPIES_ERROR,
} from '../../components/workspace/recoverySourcePresentation';
import { useWorkspaceProjectWrites } from '../../hooks/useWorkspaceProjectWrites';
import { createBlankProject } from '../../services/presets';
import type {
  LocalWorkspaceStore,
  RecoverySource,
  WorkspaceBootstrapPhase,
  WorkspacePendingImport,
  WorkspaceProject,
  WorkspaceSnapshot,
} from '../../services/localWorkspace/index';
import {
  deferred,
  fakeReadyStore,
  fakeStore,
  migrationReceipt,
  readyResult,
  recoveryResult,
  splitBrainRecovery,
  unavailableResult,
  workspaceRecovery,
  workspaceSnapshot,
} from '../helpers/fakeLocalWorkspaceStore';

vi.mock('../../services/browserDownload', () => ({
  downloadBlob: vi.fn(),
  downloadJson: vi.fn(),
}));
vi.mock('../../services/analytics', () => ({ trackEvent: vi.fn() }));

const pendingImport = (
  id: string,
  targetProjectId: string,
  warnings: string[] = [],
): WorkspacePendingImport => ({
  id,
  targetProjectId,
  name: `Imported ${id}`,
  state: {} as WorkspacePendingImport['state'],
  warnings,
  createdAt: '2026-08-15T12:00:00.000Z',
});

const consumedSnapshot = (
  initial: ReturnType<typeof workspaceSnapshot>,
  imported: WorkspacePendingImport[],
  remaining: WorkspacePendingImport[] = [],
) => workspaceSnapshot({
  projects: [
    ...initial.projects,
    ...imported.map(item => ({
      id: item.targetProjectId,
      name: item.name,
      initialState: item.state,
    })),
  ],
  activeProjectId: imported.at(-1)?.targetProjectId ?? initial.activeProjectId,
  pendingImports: remaining,
});

const fakeEditorRenderer = ({ initialWorkspace }: WorkspaceEditorMount) => (
  <div data-testid="editor-page">{initialWorkspace.activeProjectId}</div>
);

function WorkspaceWritesProbe({
  mount,
  workingProject,
}: {
  mount: WorkspaceEditorMount;
  workingProject: WorkspaceProject;
}) {
  const { updateProject } = useWorkspaceProjectWrites(
    mount.store,
    mount.initialWorkspace,
    mount.onWorkspaceChange,
  );

  return (
    <button
      data-testid="editor-page"
      onClick={() => { void updateProject(workingProject.id, () => workingProject); }}
    >
      Change nested project bytes
    </button>
  );
}

function AuthorityLossOnLayoutProbe({
  mount,
  onAuthorityLost,
}: {
  mount: WorkspaceEditorMount;
  onAuthorityLost: () => void;
}) {
  useWorkspaceProjectWrites(
    mount.store,
    mount.initialWorkspace,
    mount.onWorkspaceChange,
  );

  useLayoutEffect(() => {
    onAuthorityLost();
  }, [onAuthorityLost]);

  return <div data-testid="editor-page" />;
}

function ReplacementActionProbe({
  store,
  downloadDuringLayout,
}: {
  store: LocalWorkspaceStore;
  downloadDuringLayout: boolean;
}) {
  useLayoutEffect(() => {
    if (downloadDuringLayout) {
      screen.queryByRole('button', {
        name: RECOVERY_SOURCE_PRESENTATION['legacy-current'].actionLabel,
      })?.click();
    }
  }, [downloadDuringLayout, store]);

  return <WorkspaceBootstrapGate store={store} renderEditor={fakeEditorRenderer} />;
}

function ReplacementCaptureProbe({
  store,
  retained,
  publishDuringLayout,
  workspace,
}: {
  store: LocalWorkspaceStore;
  retained: { publish?: WorkspaceEditorMount['onWorkspaceChange'] };
  publishDuringLayout: boolean;
  workspace: ReturnType<typeof workspaceSnapshot>;
}) {
  useLayoutEffect(() => {
    if (publishDuringLayout) retained.publish?.(workspace);
  }, [publishDuringLayout, retained, store, workspace]);

  return <WorkspaceBootstrapGate
    store={store}
    renderEditor={mount => {
      retained.publish = mount.onWorkspaceChange;
      return <div data-testid="editor-page">{mount.initialWorkspace.activeProjectId}</div>;
    }}
  />;
}

function SuspendedSibling({
  pending,
  onRender,
}: {
  pending: Promise<void>;
  onRender: () => void;
}): never {
  onRender();
  throw pending;
}

function InterruptedReplacementHarness({
  firstStore,
  replacementStore,
  pending,
  onReplacementRender,
  control,
}: {
  firstStore: LocalWorkspaceStore;
  replacementStore: LocalWorkspaceStore;
  pending: Promise<void>;
  onReplacementRender: () => void;
  control: { replace?: () => void };
}) {
  const [replacement, setReplacement] = useState(false);

  useLayoutEffect(() => {
    control.replace = () => startTransition(() => setReplacement(true));
    return () => { delete control.replace; };
  }, [control]);

  return (
    <Suspense fallback={<div>Replacement suspended</div>}>
      <WorkspaceBootstrapGate
        store={replacement ? replacementStore : firstStore}
        renderEditor={fakeEditorRenderer}
      />
      {replacement && <SuspendedSibling pending={pending} onRender={onReplacementRender} />}
    </Suspense>
  );
}

beforeEach(() => {
  window.localStorage.clear();
  vi.mocked(downloadBlob).mockReset();
  vi.mocked(downloadJson).mockReset();
  vi.mocked(trackEvent).mockReset();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('WorkspaceBootstrapGate', () => {
  it('does not mount the editor while bootstrap is pending', () => {
    const bootstrap = deferred<ReturnType<typeof readyResult>>();
    const store = fakeStore({ bootstrap: bootstrap.promise });

    const view = render(
      <WorkspaceBootstrapGate store={store} renderEditor={fakeEditorRenderer} />,
    );

    expect(screen.getByRole('status')).toHaveTextContent('Opening project storage');
    expect(view.container.querySelector('.animate-spin'))
      .toHaveClass('motion-reduce:animate-none');
    expect(screen.getByRole('heading', { name: 'Opening your projects' })).toBeVisible();
    expect(screen.getByText(
      'Doctect is checking your saved projects before opening the editor.',
    )).toBeVisible();
    expect(screen.queryByText('Preparing your local projects')).not.toBeInTheDocument();
    expect(screen.queryByTestId('editor-page')).not.toBeInTheDocument();
  });

  it('advertises no store export when bootstrap rejects before capability probing', async () => {
    const store = fakeStore({
      bootstrap: () => Promise.reject(new Error('Bootstrap rejected before source validation.')),
    });

    render(<WorkspaceBootstrapGate store={store} renderEditor={fakeEditorRenderer} />);

    expect(await screen.findByRole('heading', {
      name: 'We couldn’t finish preparing your projects',
    })).toBeVisible();
    expect(screen.getByText('No project copies are available to save right now.')).toBeVisible();
    expect(screen.queryByRole('button', {
      name: RECOVERY_SOURCE_PRESENTATION['legacy-current'].actionLabel,
    }))
      .not.toBeInTheDocument();
    expect(store.exportRecoveryBundle).not.toHaveBeenCalled();
  });

  it('announces all five truthful bootstrap phase labels', () => {
    const bootstrap = deferred<ReturnType<typeof readyResult>>();
    const store = fakeStore({ bootstrap: bootstrap.promise });
    render(<WorkspaceBootstrapGate store={store} renderEditor={fakeEditorRenderer} />);
    const phases: Array<[WorkspaceBootstrapPhase, string]> = [
      ['opening-local-storage', 'Opening project storage'],
      ['checking-existing-projects', 'Checking saved projects'],
      ['copying-projects', 'Preparing saved projects'],
      ['verifying-projects', 'Checking project data'],
      ['finishing-upgrade', 'Getting the editor ready'],
    ];

    for (const [phase, label] of phases) {
      act(() => store.emitPhase(phase));
      expect(screen.getByRole('status')).toHaveTextContent(label);
    }
    expect(screen.queryByText('Finishing upgrade')).not.toBeInTheDocument();
    expect(screen.queryByText(/%/)).not.toBeInTheDocument();
  });

  it('passes only a ready public snapshot to the caller-supplied editor renderer', async () => {
    const snapshot = workspaceSnapshot({ activeProjectId: 'verified-project' });
    const store = fakeReadyStore({ snapshot });
    const renderEditor = vi.fn(fakeEditorRenderer);

    render(<WorkspaceBootstrapGate store={store} renderEditor={renderEditor} />);

    expect(await screen.findByTestId('editor-page')).toHaveTextContent('verified-project');
    expect(renderEditor).toHaveBeenCalledWith({
      store,
      initialWorkspace: snapshot,
      initialWarnings: [],
      onWorkspaceChange: expect.any(Function),
    });
  });

  it('consumes one pending import once under React StrictMode before mounting the editor', async () => {
    const pending = pendingImport('import-1', 'target-1');
    const initial = workspaceSnapshot({ pendingImports: [pending] });
    const consumed = consumedSnapshot(initial, [pending]);
    const store = fakeReadyStore({ snapshot: initial });
    store.commit.mockResolvedValue(consumed);

    render(
      <StrictMode>
        <WorkspaceBootstrapGate store={store} renderEditor={fakeEditorRenderer} />
      </StrictMode>,
    );

    expect(await screen.findByTestId('editor-page')).toHaveTextContent('target-1');
    expect(store.commit).toHaveBeenCalledWith({ type: 'consume-import', importId: 'import-1' });
    expect(store.commit.mock.calls.filter(([command]) => command.type === 'consume-import'))
      .toHaveLength(1);
  });

  it('consumes multiple pending imports in stored position order', async () => {
    const first = pendingImport('import-1', 'target-1');
    const second = pendingImport('import-2', 'target-2');
    const initial = workspaceSnapshot({ pendingImports: [first, second] });
    const afterFirst = consumedSnapshot(initial, [first], [second]);
    const afterSecond = consumedSnapshot(initial, [first, second]);
    const store = fakeReadyStore({ snapshot: initial });
    store.commit.mockImplementation(async command => (
      command.type === 'consume-import' && command.importId === 'import-1'
        ? afterFirst
        : afterSecond
    ));

    render(<WorkspaceBootstrapGate store={store} renderEditor={fakeEditorRenderer} />);

    expect(await screen.findByTestId('editor-page')).toHaveTextContent('target-2');
    expect(store.commit.mock.calls.map(([command]) => command)).toEqual([
      { type: 'consume-import', importId: 'import-1' },
      { type: 'consume-import', importId: 'import-2' },
    ]);
  });

  it('continues with imports that appear in a consume result until the queue is empty', async () => {
    const first = pendingImport('import-first', 'target-first');
    const appeared = pendingImport('import-appeared', 'target-appeared');
    const initial = workspaceSnapshot({ pendingImports: [first] });
    const afterFirst = consumedSnapshot(initial, [first], [appeared]);
    const afterAppeared = consumedSnapshot(initial, [first, appeared]);
    const store = fakeReadyStore({ snapshot: initial });
    store.commit
      .mockResolvedValueOnce(afterFirst)
      .mockResolvedValueOnce(afterAppeared);

    render(<WorkspaceBootstrapGate store={store} renderEditor={fakeEditorRenderer} />);

    expect(await screen.findByTestId('editor-page')).toHaveTextContent('target-appeared');
    expect(store.commit.mock.calls.map(([command]) => command)).toEqual([
      { type: 'consume-import', importId: 'import-first' },
      { type: 'consume-import', importId: 'import-appeared' },
    ]);
    expect(afterAppeared.pendingImports).toEqual([]);
  });

  it('blocks editor mount on consume failure and retries the retained import', async () => {
    const pending = pendingImport('import-retry', 'target-retry');
    const initial = workspaceSnapshot({ pendingImports: [pending] });
    const consumed = consumedSnapshot(initial, [pending]);
    const store = fakeReadyStore({ snapshot: initial });
    store.commit
      .mockRejectedValueOnce(new Error('quota exhausted'))
      .mockResolvedValueOnce(consumed);

    render(<WorkspaceBootstrapGate store={store} renderEditor={fakeEditorRenderer} />);

    const alert = await screen.findByRole('alert');
    expect(within(alert).queryByRole('button')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeEnabled();
    expect(screen.getByRole('button', {
      name: OPEN_WORKSPACE_PRESENTATION.actionLabel,
    })).toBeEnabled();
    expect(screen.queryByRole('button', {
      name: RECOVERY_SOURCE_PRESENTATION['indexeddb-workspace'].actionLabel,
    }))
      .not.toBeInTheDocument();
    expect(screen.queryByTestId('editor-page')).not.toBeInTheDocument();
    expect(initial.pendingImports).toEqual([pending]);
    expect(trackEvent).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByTestId('editor-page')).toHaveTextContent('target-retry');
    expect(store.commit).toHaveBeenCalledTimes(2);
    expect(store.commit).toHaveBeenNthCalledWith(2, {
      type: 'consume-import',
      importId: 'import-retry',
    });
    expect(trackEvent).toHaveBeenCalledOnce();
  });

  it('publishes each import warning once and emits analytics only after durable consume', async () => {
    const pending = pendingImport('import-warning', 'target-warning', ['Saved generator was detached.']);
    const initial = workspaceSnapshot({ pendingImports: [pending] });
    const consumed = consumedSnapshot(initial, [pending]);
    const commit = deferred<ReturnType<typeof workspaceSnapshot>>();
    const store = fakeReadyStore({ snapshot: initial });
    store.commit.mockReturnValue(commit.promise);
    const renderEditor = vi.fn(({ initialWorkspace, initialWarnings }: WorkspaceEditorMount) => (
      <div data-testid="editor-page">
        <span>{initialWorkspace.activeProjectId}</span>
        {initialWarnings.map(warning => <span key={warning}>{warning}</span>)}
      </div>
    ));

    render(
      <StrictMode>
        <WorkspaceBootstrapGate store={store} renderEditor={renderEditor} />
      </StrictMode>,
    );
    await waitFor(() => expect(store.commit).toHaveBeenCalledOnce());
    expect(screen.queryByTestId('editor-page')).not.toBeInTheDocument();
    expect(trackEvent).not.toHaveBeenCalled();

    await act(async () => commit.resolve(consumed));

    expect(await screen.findByText('Saved generator was detached.')).toBeVisible();
    expect(renderEditor.mock.calls.at(-1)?.[0].initialWarnings)
      .toEqual(['Saved generator was detached.']);
    expect(trackEvent).toHaveBeenCalledOnce();
    expect(trackEvent).toHaveBeenCalledWith('project_imported_from_gallery');
  });

  it('delivers stale consume analytics once and warnings on one later same-store mount', async () => {
    const pending = pendingImport(
      'import-stale-delivery',
      'target-stale-delivery',
      ['Stale import warning.'],
    );
    const initial = workspaceSnapshot({ pendingImports: [pending] });
    const consumed = consumedSnapshot(initial, [pending]);
    const commit = deferred<ReturnType<typeof workspaceSnapshot>>();
    const firstStore = fakeStore({
      bootstrap: [
        readyResult({ snapshot: initial }),
        readyResult({ snapshot: consumed }),
        readyResult({ snapshot: consumed }),
      ],
      commit: commit.promise,
    });
    const replacementStore = fakeReadyStore({
      snapshot: workspaceSnapshot({ activeProjectId: 'replacement-project' }),
    });
    const renderEditor = vi.fn(({ initialWorkspace, initialWarnings }: WorkspaceEditorMount) => (
      <div data-testid="editor-page">
        <span>{initialWorkspace.activeProjectId}</span>
        {initialWarnings.map(warning => <span key={warning}>{warning}</span>)}
      </div>
    ));
    const view = render(
      <WorkspaceBootstrapGate store={firstStore} renderEditor={renderEditor} />,
    );
    await waitFor(() => expect(firstStore.commit).toHaveBeenCalledOnce());

    view.rerender(
      <WorkspaceBootstrapGate store={replacementStore} renderEditor={renderEditor} />,
    );
    expect(await screen.findByTestId('editor-page')).toHaveTextContent('replacement-project');
    await act(async () => commit.resolve(consumed));

    await waitFor(() => expect(trackEvent).toHaveBeenCalledOnce());
    expect(trackEvent).toHaveBeenCalledWith('project_imported_from_gallery');
    view.rerender(
      <WorkspaceBootstrapGate store={firstStore} renderEditor={renderEditor} />,
    );
    expect(await screen.findByText('Stale import warning.')).toBeVisible();
    await waitFor(() => expect(firstStore.bootstrap).toHaveBeenCalledTimes(2));
    view.unmount();

    render(<WorkspaceBootstrapGate store={firstStore} renderEditor={renderEditor} />);
    expect(await screen.findByTestId('editor-page')).toHaveTextContent('target-stale-delivery');
    expect(screen.queryByText('Stale import warning.')).not.toBeInTheDocument();
    expect(trackEvent).toHaveBeenCalledOnce();
  });

  it('waits for receipt acknowledgement before consuming its pending import', async () => {
    const pending = pendingImport('receipt-import', 'receipt-target');
    const initial = workspaceSnapshot({ pendingImports: [pending] });
    const store = fakeReadyStore({
      snapshot: initial,
      receipt: migrationReceipt({ id: 'receipt-before-import', pendingImportPreserved: true }),
    });
    store.commit.mockResolvedValue(consumedSnapshot(initial, [pending]));

    render(<WorkspaceBootstrapGate store={store} renderEditor={fakeEditorRenderer} />);

    expect(await screen.findByRole('heading', { name: 'Your projects are ready' })).toBeVisible();
    expect(store.commit).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Continue to editor' }));

    expect(await screen.findByTestId('editor-page')).toHaveTextContent('receipt-target');
    expect(store.commit).toHaveBeenCalledWith({
      type: 'consume-import',
      importId: 'receipt-import',
    });
  });

  it('reloads an already consumed public snapshot without duplicate or leaked provenance', async () => {
    const pending = pendingImport('reload-import', 'reload-target');
    const initial = workspaceSnapshot({ pendingImports: [pending] });
    const consumed = consumedSnapshot(initial, [pending]);
    const firstStore = fakeReadyStore({ snapshot: initial });
    firstStore.commit.mockResolvedValue(consumed);
    const first = render(
      <WorkspaceBootstrapGate store={firstStore} renderEditor={fakeEditorRenderer} />,
    );
    expect(await screen.findByTestId('editor-page')).toHaveTextContent('reload-target');
    first.unmount();

    const reloadStore = fakeReadyStore({ snapshot: consumed });
    const renderEditor = vi.fn(fakeEditorRenderer);
    render(<WorkspaceBootstrapGate store={reloadStore} renderEditor={renderEditor} />);

    expect(await screen.findByTestId('editor-page')).toHaveTextContent('reload-target');
    expect(reloadStore.commit).not.toHaveBeenCalled();
    const reloaded = renderEditor.mock.calls.at(-1)?.[0].initialWorkspace;
    expect(reloaded.projects.filter(project => project.id === 'reload-target')).toHaveLength(1);
    expect(Object.hasOwn(
      reloaded.projects.find(project => project.id === 'reload-target')!,
      'consumedImportId',
    )).toBe(false);
  });

  it('fails closed synchronously while a replacement store bootstraps', async () => {
    const firstSnapshot = workspaceSnapshot({ activeProjectId: 'first-store-project' });
    const firstStore = fakeReadyStore({ snapshot: firstSnapshot });
    const replacementBootstrap = deferred<ReturnType<typeof readyResult>>();
    const replacementStore = fakeStore({ bootstrap: replacementBootstrap.promise });
    const renderEditor = vi.fn(fakeEditorRenderer);
    const view = render(
      <WorkspaceBootstrapGate store={firstStore} renderEditor={renderEditor} />,
    );
    expect(await screen.findByTestId('editor-page')).toHaveTextContent('first-store-project');
    renderEditor.mockClear();

    view.rerender(
      <WorkspaceBootstrapGate store={replacementStore} renderEditor={renderEditor} />,
    );

    expect(renderEditor).not.toHaveBeenCalled();
    expect(screen.queryByTestId('editor-page')).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Opening project storage');
    expect(replacementStore.bootstrap).toHaveBeenCalledOnce();
  });

  it('rejects a retained open-work callback after committed store replacement', async () => {
    const firstStore = fakeReadyStore();
    const replacementBootstrap = deferred<ReturnType<typeof unavailableResult>>();
    const replacementStore = fakeStore({ bootstrap: replacementBootstrap.promise });
    const retained: { publish?: WorkspaceEditorMount['onWorkspaceChange'] } = {};
    const oldWorkspace = workspaceSnapshot({
      projects: [{ ...workspaceSnapshot().projects[0], name: 'Old store open work' }],
    });
    const view = render(<ReplacementCaptureProbe
      store={firstStore}
      retained={retained}
      publishDuringLayout={false}
      workspace={oldWorkspace}
    />);
    expect(await screen.findByTestId('editor-page')).toBeVisible();

    view.rerender(<ReplacementCaptureProbe
      store={replacementStore}
      retained={retained}
      publishDuringLayout
      workspace={oldWorkspace}
    />);
    expect(screen.getByRole('status')).toHaveTextContent('Opening project storage');
    expect(replacementStore.bootstrap).toHaveBeenCalledOnce();

    await act(async () => replacementBootstrap.resolve(unavailableResult({
      availableExports: [],
    })));
    expect(await screen.findByRole('heading', {
      name: 'Doctect can’t open your saved projects',
    })).toBeVisible();
    const staleDownload = screen.queryByRole('button', {
      name: OPEN_WORKSPACE_PRESENTATION.actionLabel,
    });
    if (staleDownload) fireEvent.click(staleDownload);

    expect(downloadJson).not.toHaveBeenCalledWith({
      format: 'doctect.open-workspace-recovery',
      version: 1,
      capturedAt: expect.any(String),
      workspace: oldWorkspace,
    }, OPEN_WORKSPACE_PRESENTATION.filename);
    expect(staleDownload).not.toBeInTheDocument();
  });

  it('does not let replacement-layout recovery controls invoke the new store', async () => {
    const firstStore = fakeStore({ bootstrap: recoveryResult(splitBrainRecovery()) });
    const replacementBootstrap = deferred<ReturnType<typeof readyResult>>();
    const replacementStore = fakeStore({ bootstrap: replacementBootstrap.promise });
    const view = render(
      <ReplacementActionProbe store={firstStore} downloadDuringLayout={false} />,
    );
    await screen.findByRole('heading', { name: 'We found two different saved project sets' });

    view.rerender(
      <ReplacementActionProbe store={replacementStore} downloadDuringLayout />,
    );

    expect(replacementStore.exportRecoveryBundle).not.toHaveBeenCalled();
    expect(firstStore.exportRecoveryBundle).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', {
      name: RECOVERY_SOURCE_PRESENTATION['legacy-current'].actionLabel,
    }))
      .not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Opening project storage');
  });

  it('keeps committed store authority active when a replacement render is interrupted', async () => {
    const firstStore = fakeReadyStore({
      snapshot: workspaceSnapshot({ activeProjectId: 'committed-project' }),
    });
    const replacementStore = fakeReadyStore({
      snapshot: workspaceSnapshot({ activeProjectId: 'uncommitted-project' }),
    });
    const suspended = deferred<void>();
    const replacementRendered = vi.fn();
    const control: { replace?: () => void } = {};
    render(<InterruptedReplacementHarness
      firstStore={firstStore}
      replacementStore={replacementStore}
      pending={suspended.promise}
      onReplacementRender={replacementRendered}
      control={control}
    />);
    expect(await screen.findByTestId('editor-page')).toHaveTextContent('committed-project');

    act(() => control.replace?.());
    await waitFor(() => expect(replacementRendered).toHaveBeenCalled());
    expect(screen.getByTestId('editor-page')).toHaveTextContent('committed-project');
    expect(replacementStore.bootstrap).not.toHaveBeenCalled();

    act(() => firstStore.emitAuthorityLost(recoveryResult(splitBrainRecovery({
      recoveryId: 'committed-store-authority-lost',
    }))));

    expect(await screen.findByRole('heading', {
      name: 'We found two different saved project sets',
    })).toBeVisible();
    expect(screen.queryByTestId('editor-page')).not.toBeInTheDocument();
    expect(replacementStore.bootstrap).not.toHaveBeenCalled();
  });

  it('shows the exact initial migration failure and offers retry plus a project copy', async () => {
    const store = fakeStore({
      bootstrap: recoveryResult(workspaceRecovery({
        kind: 'migration-failed',
        availableExports: ['legacy-current'],
      })),
    });
    render(<WorkspaceBootstrapGate store={store} renderEditor={fakeEditorRenderer} />);

    const alert = await screen.findByRole('alert');
    expect(within(alert).getByRole('heading', {
      name: 'We couldn’t finish preparing your projects',
    })).toBeVisible();
    expect(within(alert).getByText(
      'Editor stayed closed to protect your work. Your saved projects were not replaced or deleted.',
    )).toBeVisible();
    expect(within(alert).queryByRole('button')).not.toBeInTheDocument();
    const detailsTrigger = screen.getByText('Technical details');
    expect(detailsTrigger).toHaveClass('min-h-11');
    const details = detailsTrigger.closest('details');
    expect(details).not.toHaveAttribute('open');
    expect(alert).not.toContainElement(details);
    const retry = screen.getByRole('button', { name: 'Try again' });
    const copiesHeading = screen.getByRole('heading', { name: 'Save project copies' });
    expect(retry.compareDocumentPosition(copiesHeading)
      & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByText(
      PROJECT_COPY_HELPER_TEXT,
    )).toBeVisible();
    expect(screen.getByRole('heading', {
      name: RECOVERY_SOURCE_PRESENTATION['legacy-current'].title,
    })).toBeVisible();
    expect(screen.getByText(
      RECOVERY_SOURCE_PRESENTATION['legacy-current'].explanation,
    )).toBeVisible();
    const download = screen.getByRole('button', {
      name: RECOVERY_SOURCE_PRESENTATION['legacy-current'].actionLabel,
    });
    expect(retry).toBeEnabled();
    expect(retry).toHaveClass('min-h-11');
    expect(download).toHaveClass('min-h-11');

    fireEvent.click(download);
    await waitFor(() => expect(store.exportRecoveryBundle).toHaveBeenCalledWith('legacy-current'));
    await waitFor(() => expect(downloadBlob).toHaveBeenCalledOnce());
    expect(screen.queryByTestId('editor-page')).not.toBeInTheDocument();
  });

  it('ignores phase and authority callbacks retained by a stale retry attempt', async () => {
    const retry = deferred<ReturnType<typeof readyResult>>();
    const store = fakeStore({
      bootstrap: [
        recoveryResult(workspaceRecovery({ canRetry: true })),
        retry.promise,
      ],
    });
    render(<WorkspaceBootstrapGate store={store} renderEditor={fakeEditorRenderer} />);
    expect(await screen.findByRole('heading', {
      name: 'We couldn’t finish preparing your projects',
    })).toBeVisible();

    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(screen.getByRole('status')).toHaveTextContent('Opening project storage');

    act(() => {
      store.emitPhase('finishing-upgrade', 0);
      store.emitAuthorityLost(unavailableResult(), 0);
    });
    expect(screen.getByRole('status')).toHaveTextContent('Opening project storage');
    expect(screen.queryByRole('heading', {
      name: 'Doctect can’t open your saved projects',
    })).not.toBeInTheDocument();

    await act(async () => retry.resolve(readyResult()));
    expect(await screen.findByTestId('editor-page')).toBeVisible();
  });

  it('blocks the editor when local project storage is unavailable', async () => {
    const store = fakeStore({ bootstrap: unavailableResult({ availableExports: [] }) });
    render(<WorkspaceBootstrapGate store={store} renderEditor={fakeEditorRenderer} />);

    const alert = await screen.findByRole('alert');
    expect(within(alert).getByRole('heading', {
      name: 'Doctect can’t open your saved projects',
    })).toBeVisible();
    expect(within(alert).getByText(
      'Local project storage could not be opened. No saved project data was changed.',
    )).toBeVisible();
    expect(screen.queryByTestId('editor-page')).not.toBeInTheDocument();
  });

  it('guides a blocked IndexedDB upgrade without retrying the frozen adapter', async () => {
    const store = fakeStore({
      bootstrap: unavailableResult({ message: 'IndexedDB upgrade is blocked.' }),
    });
    render(<WorkspaceBootstrapGate store={store} renderEditor={fakeEditorRenderer} />);

    await screen.findByRole('heading', {
      name: 'Doctect can’t open your saved projects',
    });
    expect(screen.getByText(
      'Close other Doctect tabs, then reload this page.',
    )).toBeVisible();
    expect(screen.queryByText(
      'Local project storage could not be opened. No saved project data was changed.',
    )).not.toBeInTheDocument();
    expect(screen.getByText('IndexedDB upgrade is blocked.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument();
    expect(screen.queryByTestId('editor-page')).not.toBeInTheDocument();
  });

  it('unmounts a ready editor immediately when storage authority is lost', async () => {
    const store = fakeReadyStore();
    render(<WorkspaceBootstrapGate store={store} renderEditor={fakeEditorRenderer} />);
    expect(await screen.findByTestId('editor-page')).toBeVisible();

    act(() => store.emitAuthorityLost(recoveryResult(splitBrainRecovery())));

    expect(await screen.findByRole('heading', {
      name: 'We found two different saved project sets',
    })).toBeVisible();
    expect(screen.getByText(
      'Another tab or an older Doctect version may have saved different changes. Nothing was overwritten.',
    )).toBeVisible();
    expect(screen.queryByTestId('editor-page')).not.toBeInTheDocument();
  });

  it('downloads captured open work after authority loss unmounts the editor', async () => {
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
    expect(screen.getByRole('heading', {
      name: OPEN_WORKSPACE_PRESENTATION.title,
    })).toBeVisible();
    expect(screen.getByText(OPEN_WORKSPACE_PRESENTATION.explanation)).toBeVisible();
    fireEvent.click(screen.getByRole('button', {
      name: OPEN_WORKSPACE_PRESENTATION.actionLabel,
    }));

    expect(downloadJson).toHaveBeenCalledWith({
      format: 'doctect.open-workspace-recovery',
      version: 1,
      capturedAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/),
      workspace: openWorkspace,
    }, OPEN_WORKSPACE_PRESENTATION.filename);
  });

  it('reports the shared project error when an open-work download fails', async () => {
    const store = fakeReadyStore();
    vi.mocked(downloadJson).mockImplementationOnce(() => {
      throw new Error('download blocked');
    });
    render(<WorkspaceBootstrapGate store={store} renderEditor={fakeEditorRenderer} />);
    await screen.findByTestId('editor-page');

    act(() => store.emitAuthorityLost(recoveryResult(splitBrainRecovery())));
    fireEvent.click(screen.getByRole('button', {
      name: OPEN_WORKSPACE_PRESENTATION.actionLabel,
    }));

    expect(screen.getByText(PROJECT_DOWNLOAD_ERROR)).toBeVisible();
  });

  it('clones project-edit publication before synchronous authority-loss unmount', async () => {
    const store = fakeReadyStore();
    const published = workspaceSnapshot({
      projects: [{ ...workspaceSnapshot().projects[0], name: 'Captured before unmount' }],
    });
    const expected = structuredClone(published);
    const renderEditor = ({ onWorkspaceChange }: WorkspaceEditorMount) => (
      <button
        data-testid="editor-page"
        onClick={() => {
          onWorkspaceChange(published);
          published.projects[0].name = 'Caller mutation after publication';
          store.emitAuthorityLost(recoveryResult(splitBrainRecovery()));
        }}
      >
        Publish and lose authority
      </button>
    );
    render(<WorkspaceBootstrapGate store={store} renderEditor={renderEditor} />);

    fireEvent.click(await screen.findByTestId('editor-page'));
    expect(screen.queryByTestId('editor-page')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', {
      name: OPEN_WORKSPACE_PRESENTATION.actionLabel,
    }));

    expect(downloadJson).toHaveBeenCalledWith({
      format: 'doctect.open-workspace-recovery',
      version: 1,
      capturedAt: expect.any(String),
      workspace: expected,
    }, OPEN_WORKSPACE_PRESENTATION.filename);
  });

  it('retries a provisional capture after initial clone failure while the editor stays blocked', async () => {
    const initial = workspaceSnapshot({
      projects: [{ ...workspaceSnapshot().projects[0], name: 'Provisional retry source' }],
    });
    const store = fakeReadyStore({ snapshot: initial });
    const originalStructuredClone = globalThis.structuredClone.bind(globalThis);
    let cloningBlockedCapture = false;
    let failCapture = true;
    let captureAttempts = 0;
    vi.spyOn(globalThis, 'structuredClone').mockImplementation(function cloneWithFailure<T>(
      value: T,
      options?: StructuredSerializeOptions,
    ): T {
      const name = (value as WorkspaceSnapshot)?.projects?.[0]?.name;
      if (cloningBlockedCapture && name === 'Provisional retry source') {
        captureAttempts += 1;
        if (failCapture) throw new DOMException('clone failed', 'DataCloneError');
      }
      return originalStructuredClone(value, options);
    });
    render(
      <WorkspaceBootstrapGate store={store} renderEditor={fakeEditorRenderer} />,
    );
    await screen.findByTestId('editor-page');
    const firstResult = recoveryResult(splitBrainRecovery({
      recoveryId: 'capture-clone-failed',
    }));
    const emitAuthorityLost = (result: Parameters<typeof store.emitAuthorityLost>[0]) => {
      cloningBlockedCapture = true;
      try {
        act(() => store.emitAuthorityLost(result));
      } finally {
        cloningBlockedCapture = false;
      }
    };

    emitAuthorityLost(firstResult);

    expect(screen.queryByTestId('editor-page')).not.toBeInTheDocument();
    const alert = screen.getByRole('alert');
    expect(within(alert).getByRole('heading', {
      name: 'We found two different saved project sets',
    })).toBeVisible();
    expect(captureAttempts).toBe(1);
    expect(within(alert).queryByRole('button')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', {
      name: OPEN_WORKSPACE_PRESENTATION.actionLabel,
    })).not.toBeInTheDocument();
    for (const source of [
      'legacy-current',
      'legacy-original',
      'indexeddb-workspace',
    ] as const satisfies readonly RecoverySource[]) {
      expect(screen.getByRole('button', {
        name: RECOVERY_SOURCE_PRESENTATION[source].actionLabel,
      })).toBeEnabled();
    }
    expect(store.commit).not.toHaveBeenCalled();
    expect(trackEvent).not.toHaveBeenCalled();

    failCapture = false;
    emitAuthorityLost(unavailableResult({
      availableExports: ['indexeddb-workspace'],
    }));
    expect(screen.getByRole('heading', {
      name: 'Doctect can’t open your saved projects',
    })).toBeVisible();
    expect(screen.getByRole('button', {
      name: RECOVERY_SOURCE_PRESENTATION['indexeddb-workspace'].actionLabel,
    })).toBeEnabled();
    expect(screen.getByRole('button', {
      name: OPEN_WORKSPACE_PRESENTATION.actionLabel,
    })).toBeEnabled();
    expect(screen.queryByTestId('editor-page')).not.toBeInTheDocument();
    expect(screen.getAllByRole('alert')).toHaveLength(1);
    expect(captureAttempts).toBe(2);
    fireEvent.click(screen.getByRole('button', {
      name: OPEN_WORKSPACE_PRESENTATION.actionLabel,
    }));
    expect(downloadJson).toHaveBeenCalledWith({
      format: 'doctect.open-workspace-recovery',
      version: 1,
      capturedAt: expect.any(String),
      workspace: initial,
    }, OPEN_WORKSPACE_PRESENTATION.filename);
  });

  it('keeps a successful protected capture when a repeated notification clone would fail', async () => {
    const initial = workspaceSnapshot({
      projects: [{ ...workspaceSnapshot().projects[0], name: 'Protected before repeat' }],
    });
    const store = fakeReadyStore({ snapshot: initial });
    const originalStructuredClone = globalThis.structuredClone.bind(globalThis);
    let cloningBlockedCapture = false;
    let failCapture = false;
    let captureAttempts = 0;
    vi.spyOn(globalThis, 'structuredClone').mockImplementation(function cloneWithFailure<T>(
      value: T,
      options?: StructuredSerializeOptions,
    ): T {
      if (cloningBlockedCapture
        && (value as WorkspaceSnapshot)?.projects?.[0]?.name === 'Protected before repeat') {
        captureAttempts += 1;
        if (failCapture) throw new DOMException('repeat clone failed', 'DataCloneError');
      }
      return originalStructuredClone(value, options);
    });
    render(<WorkspaceBootstrapGate store={store} renderEditor={fakeEditorRenderer} />);
    await screen.findByTestId('editor-page');
    const emitAuthorityLost = (result: Parameters<typeof store.emitAuthorityLost>[0]) => {
      cloningBlockedCapture = true;
      try {
        act(() => store.emitAuthorityLost(result));
      } finally {
        cloningBlockedCapture = false;
      }
    };

    emitAuthorityLost(recoveryResult(splitBrainRecovery({ recoveryId: 'protected-first' })));
    expect(screen.queryByTestId('editor-page')).not.toBeInTheDocument();
    expect(screen.getByRole('button', {
      name: OPEN_WORKSPACE_PRESENTATION.actionLabel,
    })).toBeEnabled();

    failCapture = true;
    emitAuthorityLost(unavailableResult({ availableExports: ['indexeddb-workspace'] }));

    expect(screen.queryByTestId('editor-page')).not.toBeInTheDocument();
    expect(screen.getByRole('button', {
      name: OPEN_WORKSPACE_PRESENTATION.actionLabel,
    })).toBeEnabled();
    expect(captureAttempts).toBe(1);
    fireEvent.click(screen.getByRole('button', {
      name: OPEN_WORKSPACE_PRESENTATION.actionLabel,
    }));
    expect(downloadJson).toHaveBeenCalledWith({
      format: 'doctect.open-workspace-recovery',
      version: 1,
      capturedAt: expect.any(String),
      workspace: initial,
    }, OPEN_WORKSPACE_PRESENTATION.filename);
  });

  it('does not replace protected open work when repeated cloning returns changed source', async () => {
    const initial = workspaceSnapshot({
      projects: [{ ...workspaceSnapshot().projects[0], name: 'Changing provisional source' }],
    });
    const firstProtected = workspaceSnapshot({
      projects: [{ ...initial.projects[0], name: 'First protected copy' }],
    });
    const changedRepeat = workspaceSnapshot({
      projects: [{ ...initial.projects[0], name: 'Changed repeated source' }],
    });
    const store = fakeReadyStore({ snapshot: initial });
    const originalStructuredClone = globalThis.structuredClone.bind(globalThis);
    let cloningBlockedCapture = false;
    let captureAttempts = 0;
    vi.spyOn(globalThis, 'structuredClone').mockImplementation(function cloneChangedSource<T>(
      value: T,
      options?: StructuredSerializeOptions,
    ): T {
      if (cloningBlockedCapture
        && (value as WorkspaceSnapshot)?.projects?.[0]?.name === 'Changing provisional source') {
        captureAttempts += 1;
        return originalStructuredClone(
          captureAttempts === 1 ? firstProtected : changedRepeat,
          options,
        ) as T;
      }
      return originalStructuredClone(value, options);
    });
    render(<WorkspaceBootstrapGate store={store} renderEditor={fakeEditorRenderer} />);
    await screen.findByTestId('editor-page');
    const emitAuthorityLost = (result: Parameters<typeof store.emitAuthorityLost>[0]) => {
      cloningBlockedCapture = true;
      try {
        act(() => store.emitAuthorityLost(result));
      } finally {
        cloningBlockedCapture = false;
      }
    };

    emitAuthorityLost(recoveryResult(splitBrainRecovery({ recoveryId: 'changed-source-first' })));
    expect(screen.queryByTestId('editor-page')).not.toBeInTheDocument();
    expect(screen.getByRole('button', {
      name: OPEN_WORKSPACE_PRESENTATION.actionLabel,
    })).toBeEnabled();
    emitAuthorityLost(recoveryResult(splitBrainRecovery({ recoveryId: 'changed-source-repeat' })));

    expect(screen.queryByTestId('editor-page')).not.toBeInTheDocument();
    expect(captureAttempts).toBe(1);
    fireEvent.click(screen.getByRole('button', {
      name: OPEN_WORKSPACE_PRESENTATION.actionLabel,
    }));
    expect(downloadJson).toHaveBeenCalledWith({
      format: 'doctect.open-workspace-recovery',
      version: 1,
      capturedAt: expect.any(String),
      workspace: firstProtected,
    }, OPEN_WORKSPACE_PRESENTATION.filename);
  });

  it('ignores stale publications and notifications after unmounting a protected blocked gate', async () => {
    const initial = workspaceSnapshot({
      projects: [{ ...workspaceSnapshot().projects[0], name: 'Protected before unmount' }],
    });
    const stale = workspaceSnapshot({
      projects: [{ ...initial.projects[0], name: 'Stale after unmount' }],
    });
    const store = fakeReadyStore({ snapshot: initial });
    const originalStructuredClone = globalThis.structuredClone.bind(globalThis);
    let cloningBlockedCapture = false;
    let captureAttempts = 0;
    let staleCloneAttempts = 0;
    vi.spyOn(globalThis, 'structuredClone').mockImplementation(function countClones<T>(
      value: T,
      options?: StructuredSerializeOptions,
    ): T {
      const name = (value as WorkspaceSnapshot)?.projects?.[0]?.name;
      if (cloningBlockedCapture && name === 'Protected before unmount') captureAttempts += 1;
      if (name === 'Stale after unmount') staleCloneAttempts += 1;
      return originalStructuredClone(value, options);
    });
    let publish: WorkspaceEditorMount['onWorkspaceChange'] | undefined;
    const view = render(<WorkspaceBootstrapGate
      store={store}
      renderEditor={mount => {
        publish = mount.onWorkspaceChange;
        return <div data-testid="editor-page" />;
      }}
    />);
    await screen.findByTestId('editor-page');
    const signal = store.observers[0]?.signal;
    cloningBlockedCapture = true;
    try {
      act(() => store.emitAuthorityLost(recoveryResult(splitBrainRecovery())));
    } finally {
      cloningBlockedCapture = false;
    }
    expect(screen.getByRole('button', {
      name: OPEN_WORKSPACE_PRESENTATION.actionLabel,
    })).toBeEnabled();
    expect(captureAttempts).toBe(1);

    view.unmount();
    expect(signal?.aborted).toBe(true);
    cloningBlockedCapture = true;
    try {
      act(() => {
        publish?.(stale);
        store.emitAuthorityLost(unavailableResult({ availableExports: [] }));
      });
    } finally {
      cloningBlockedCapture = false;
    }

    expect(captureAttempts).toBe(1);
    expect(staleCloneAttempts).toBe(0);
    expect(screen.queryByTestId('editor-page')).not.toBeInTheDocument();
  });

  it('seeds a verified initial snapshot before an editor publishes', async () => {
    const initial = workspaceSnapshot({
      projects: [{ ...workspaceSnapshot().projects[0], name: 'Verified initial work' }],
    });
    const store = fakeReadyStore({ snapshot: initial });
    render(<WorkspaceBootstrapGate store={store} renderEditor={fakeEditorRenderer} />);
    await screen.findByTestId('editor-page');

    act(() => store.emitAuthorityLost(recoveryResult(splitBrainRecovery())));
    fireEvent.click(screen.getByRole('button', {
      name: OPEN_WORKSPACE_PRESENTATION.actionLabel,
    }));

    expect(downloadJson).toHaveBeenCalledWith({
      format: 'doctect.open-workspace-recovery',
      version: 1,
      capturedAt: expect.any(String),
      workspace: initial,
    }, OPEN_WORKSPACE_PRESENTATION.filename);
  });

  it('refreshes a provisional import capture before the editor mount effect publishes', async () => {
    const pending = pendingImport('layout-loss-import', 'layout-loss-project');
    const initial = workspaceSnapshot({ pendingImports: [pending] });
    const consumed = consumedSnapshot(initial, [pending]);
    const store = fakeStore({
      bootstrap: readyResult({ snapshot: initial }),
      commit: consumed,
    });
    const renderEditor = (mount: WorkspaceEditorMount) => (
      <AuthorityLossOnLayoutProbe
        mount={mount}
        onAuthorityLost={() => store.emitAuthorityLost(unavailableResult({
          availableExports: [],
        }))}
      />
    );
    render(<WorkspaceBootstrapGate store={store} renderEditor={renderEditor} />);

    expect(await screen.findByRole('heading', {
      name: 'Doctect can’t open your saved projects',
    })).toBeVisible();
    expect(screen.queryByTestId('editor-page')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', {
      name: OPEN_WORKSPACE_PRESENTATION.actionLabel,
    }));

    expect(downloadJson).toHaveBeenCalledWith({
      format: 'doctect.open-workspace-recovery',
      version: 1,
      capturedAt: expect.any(String),
      workspace: consumed,
    }, OPEN_WORKSPACE_PRESENTATION.filename);
  });

  it('refreshes a provisional capture after each import before a later import fails', async () => {
    const first = pendingImport('partial-first-import', 'partial-first-project');
    const second = pendingImport('partial-second-import', 'partial-second-project');
    const initial = workspaceSnapshot({ pendingImports: [first, second] });
    const afterFirst = consumedSnapshot(initial, [first], [second]);
    const store = fakeReadyStore({ snapshot: initial });
    store.commit
      .mockResolvedValueOnce(afterFirst)
      .mockRejectedValueOnce(new Error('second import failed'));
    render(<WorkspaceBootstrapGate store={store} renderEditor={fakeEditorRenderer} />);

    const download = await screen.findByRole('button', {
      name: OPEN_WORKSPACE_PRESENTATION.actionLabel,
    });
    expect(store.commit).toHaveBeenCalledTimes(2);
    expect(screen.queryByTestId('editor-page')).not.toBeInTheDocument();
    fireEvent.click(download);

    expect(downloadJson).toHaveBeenCalledWith({
      format: 'doctect.open-workspace-recovery',
      version: 1,
      capturedAt: expect.any(String),
      workspace: afterFirst,
    }, OPEN_WORKSPACE_PRESENTATION.filename);
  });

  it('protects a provisional seed once blocked before Try again imports finish', async () => {
    const initial = workspaceSnapshot({ activeProjectId: 'provisional-before-block' });
    const pending = pendingImport('blocked-provisional-import', 'blocked-import-project');
    const retried = workspaceSnapshot({
      activeProjectId: 'provisional-before-block',
      pendingImports: [pending],
    });
    const consumed = consumedSnapshot(retried, [pending]);
    const store = fakeStore({
      bootstrap: [
        readyResult({ snapshot: initial }),
        readyResult({ snapshot: retried }),
      ],
      commit: consumed,
    });
    render(<WorkspaceBootstrapGate store={store} renderEditor={fakeEditorRenderer} />);
    await screen.findByTestId('editor-page');
    act(() => store.emitAuthorityLost(recoveryResult(workspaceRecovery({
      recoveryId: 'protect-provisional-on-block',
      availableExports: [],
      canRetry: true,
    }))));

    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByTestId('editor-page')).toHaveTextContent('blocked-import-project');
    act(() => store.emitAuthorityLost(unavailableResult({ availableExports: [] }), 1));
    fireEvent.click(screen.getByRole('button', {
      name: OPEN_WORKSPACE_PRESENTATION.actionLabel,
    }));

    expect(downloadJson).toHaveBeenCalledWith({
      format: 'doctect.open-workspace-recovery',
      version: 1,
      capturedAt: expect.any(String),
      workspace: initial,
    }, OPEN_WORKSPACE_PRESENTATION.filename);
  });

  it('retains blocked open work through Try again until the replacement editor publishes', async () => {
    const initial = workspaceSnapshot({ activeProjectId: 'initial-project' });
    const blockedOpenWork = workspaceSnapshot({
      activeProjectId: 'initial-project',
      projects: [{ ...initial.projects[0], name: 'Blocked unsaved work' }],
    });
    const retried = workspaceSnapshot({ activeProjectId: 'retried-project' });
    const store = fakeStore({
      bootstrap: [
        readyResult({ snapshot: initial }),
        readyResult({ snapshot: retried }),
      ],
    });
    let initialPublish: WorkspaceEditorMount['onWorkspaceChange'] | undefined;
    const renderEditor = (mount: WorkspaceEditorMount) => {
      initialPublish ??= mount.onWorkspaceChange;
      return <div data-testid="editor-page">{mount.initialWorkspace.activeProjectId}</div>;
    };
    render(<WorkspaceBootstrapGate store={store} renderEditor={renderEditor} />);
    await screen.findByText('initial-project');
    act(() => initialPublish?.(blockedOpenWork));
    act(() => store.emitAuthorityLost(recoveryResult(workspaceRecovery({
      recoveryId: 'retry-retained-open-work',
      availableExports: [],
      canRetry: true,
    }))));

    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByTestId('editor-page')).toHaveTextContent('retried-project');
    act(() => store.emitAuthorityLost(recoveryResult(workspaceRecovery({
      recoveryId: 'retry-retained-open-work-again',
      availableExports: [],
    })), 1));
    fireEvent.click(screen.getByRole('button', {
      name: OPEN_WORKSPACE_PRESENTATION.actionLabel,
    }));

    expect(downloadJson).toHaveBeenCalledWith({
      format: 'doctect.open-workspace-recovery',
      version: 1,
      capturedAt: expect.any(String),
      workspace: blockedOpenWork,
    }, OPEN_WORKSPACE_PRESENTATION.filename);
  });

  it('retains blocked open work through add-separate-copies completion', async () => {
    const initial = workspaceSnapshot({ activeProjectId: 'before-recovery' });
    const blockedOpenWork = workspaceSnapshot({
      activeProjectId: 'before-recovery',
      projects: [{ ...initial.projects[0], name: 'Unsaved before recovery' }],
    });
    const recovered = workspaceSnapshot({ activeProjectId: 'recovered-project' });
    const store = fakeStore({
      bootstrap: readyResult({ snapshot: initial }),
      commit: recovered,
    });
    let initialPublish: WorkspaceEditorMount['onWorkspaceChange'] | undefined;
    const renderEditor = (mount: WorkspaceEditorMount) => {
      initialPublish ??= mount.onWorkspaceChange;
      return <div data-testid="editor-page">{mount.initialWorkspace.activeProjectId}</div>;
    };
    render(<WorkspaceBootstrapGate store={store} renderEditor={renderEditor} />);
    await screen.findByText('before-recovery');
    act(() => initialPublish?.(blockedOpenWork));
    act(() => store.emitAuthorityLost(recoveryResult(splitBrainRecovery({
      recoveryId: 'retain-through-recovery',
    }))));

    fireEvent.click(screen.getByRole('button', {
      name: 'Add changed projects without replacing anything',
    }));
    fireEvent.click(screen.getByRole('button', { name: 'Add separate copies' }));
    expect(await screen.findByTestId('editor-page')).toHaveTextContent('recovered-project');
    act(() => store.emitAuthorityLost(unavailableResult({ availableExports: [] })));
    fireEvent.click(screen.getByRole('button', {
      name: OPEN_WORKSPACE_PRESENTATION.actionLabel,
    }));

    expect(downloadJson).toHaveBeenCalledWith({
      format: 'doctect.open-workspace-recovery',
      version: 1,
      capturedAt: expect.any(String),
      workspace: blockedOpenWork,
    }, OPEN_WORKSPACE_PRESENTATION.filename);
  });

  it('retains blocked open work while a retry receipt finishes', async () => {
    const initial = workspaceSnapshot({ activeProjectId: 'before-receipt' });
    const blockedOpenWork = workspaceSnapshot({
      activeProjectId: 'before-receipt',
      projects: [{ ...initial.projects[0], name: 'Unsaved before receipt' }],
    });
    const retried = workspaceSnapshot({ activeProjectId: 'after-receipt' });
    const store = fakeStore({
      bootstrap: [
        readyResult({ snapshot: initial }),
        readyResult({
          snapshot: retried,
          receipt: migrationReceipt({ id: 'retained-open-work-receipt' }),
        }),
      ],
    });
    let initialPublish: WorkspaceEditorMount['onWorkspaceChange'] | undefined;
    const renderEditor = (mount: WorkspaceEditorMount) => {
      initialPublish ??= mount.onWorkspaceChange;
      return <div data-testid="editor-page">{mount.initialWorkspace.activeProjectId}</div>;
    };
    render(<WorkspaceBootstrapGate store={store} renderEditor={renderEditor} />);
    await screen.findByText('before-receipt');
    act(() => initialPublish?.(blockedOpenWork));
    act(() => store.emitAuthorityLost(recoveryResult(workspaceRecovery({
      recoveryId: 'receipt-retry',
      availableExports: [],
      canRetry: true,
    }))));

    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await screen.findByRole('heading', { name: 'Your projects are ready' });
    fireEvent.click(screen.getByRole('button', { name: 'Continue to editor' }));
    expect(await screen.findByTestId('editor-page')).toHaveTextContent('after-receipt');
    act(() => store.emitAuthorityLost(unavailableResult({ availableExports: [] }), 1));
    fireEvent.click(screen.getByRole('button', {
      name: OPEN_WORKSPACE_PRESENTATION.actionLabel,
    }));

    expect(downloadJson).toHaveBeenCalledWith({
      format: 'doctect.open-workspace-recovery',
      version: 1,
      capturedAt: expect.any(String),
      workspace: blockedOpenWork,
    }, OPEN_WORKSPACE_PRESENTATION.filename);
  });

  it('retains blocked open work while Try again consumes a pending import', async () => {
    const initial = workspaceSnapshot({ activeProjectId: 'before-import' });
    const blockedOpenWork = workspaceSnapshot({
      activeProjectId: 'before-import',
      projects: [{ ...initial.projects[0], name: 'Unsaved before import' }],
    });
    const pending = pendingImport('retained-open-work-import', 'imported-project');
    const retried = workspaceSnapshot({
      activeProjectId: 'before-import',
      pendingImports: [pending],
    });
    const consumed = consumedSnapshot(retried, [pending]);
    const store = fakeStore({
      bootstrap: [
        readyResult({ snapshot: initial }),
        readyResult({ snapshot: retried }),
      ],
      commit: consumed,
    });
    let initialPublish: WorkspaceEditorMount['onWorkspaceChange'] | undefined;
    const renderEditor = (mount: WorkspaceEditorMount) => {
      initialPublish ??= mount.onWorkspaceChange;
      return <div data-testid="editor-page">{mount.initialWorkspace.activeProjectId}</div>;
    };
    render(<WorkspaceBootstrapGate store={store} renderEditor={renderEditor} />);
    await screen.findByText('before-import');
    act(() => initialPublish?.(blockedOpenWork));
    act(() => store.emitAuthorityLost(recoveryResult(workspaceRecovery({
      recoveryId: 'pending-import-retry',
      availableExports: [],
      canRetry: true,
    }))));

    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByTestId('editor-page')).toHaveTextContent('imported-project');
    expect(store.commit).toHaveBeenCalledWith({
      type: 'consume-import',
      importId: 'retained-open-work-import',
    });
    act(() => store.emitAuthorityLost(unavailableResult({ availableExports: [] }), 1));
    fireEvent.click(screen.getByRole('button', {
      name: OPEN_WORKSPACE_PRESENTATION.actionLabel,
    }));

    expect(downloadJson).toHaveBeenCalledWith({
      format: 'doctect.open-workspace-recovery',
      version: 1,
      capturedAt: expect.any(String),
      workspace: blockedOpenWork,
    }, OPEN_WORKSPACE_PRESENTATION.filename);
  });

  it('rejects a retained prior-mount callback after Try again', async () => {
    const initial = workspaceSnapshot({ activeProjectId: 'before-stale-callback' });
    const blockedOpenWork = workspaceSnapshot({
      activeProjectId: 'before-stale-callback',
      projects: [{ ...initial.projects[0], name: 'Captured before retry' }],
    });
    const staleWorkspace = workspaceSnapshot({
      activeProjectId: 'stale-prior-mount',
      projects: [{ ...initial.projects[0], name: 'Stale callback work' }],
    });
    const retried = workspaceSnapshot({ activeProjectId: 'after-retry' });
    const store = fakeStore({
      bootstrap: [
        readyResult({ snapshot: initial }),
        readyResult({ snapshot: retried }),
      ],
    });
    const renderEditor = vi.fn((mount: WorkspaceEditorMount) => (
      <div data-testid="editor-page">{mount.initialWorkspace.activeProjectId}</div>
    ));
    render(<WorkspaceBootstrapGate store={store} renderEditor={renderEditor} />);
    await screen.findByText('before-stale-callback');
    const priorPublish = renderEditor.mock.calls.at(-1)![0].onWorkspaceChange;
    act(() => priorPublish(blockedOpenWork));
    act(() => store.emitAuthorityLost(recoveryResult(workspaceRecovery({
      recoveryId: 'stale-callback-retry',
      availableExports: [],
      canRetry: true,
    }))));

    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByTestId('editor-page')).toHaveTextContent('after-retry');
    act(() => priorPublish(staleWorkspace));
    act(() => store.emitAuthorityLost(unavailableResult({ availableExports: [] }), 1));
    fireEvent.click(screen.getByRole('button', {
      name: OPEN_WORKSPACE_PRESENTATION.actionLabel,
    }));

    expect(downloadJson).toHaveBeenCalledWith({
      format: 'doctect.open-workspace-recovery',
      version: 1,
      capturedAt: expect.any(String),
      workspace: blockedOpenWork,
    }, OPEN_WORKSPACE_PRESENTATION.filename);
  });

  it('replaces retained work when the real write hook publishes a replacement mount', async () => {
    const initialState = createBlankProject();
    const initialProject = {
      ...workspaceSnapshot().projects[0],
      name: 'Initial durable project',
      initialState,
    };
    const initial = workspaceSnapshot({ projects: [initialProject] });
    const workingProject = { ...initialProject, name: 'Blocked working project' };
    const replacementProject = { ...initialProject, name: 'Replacement durable project' };
    const replacement = workspaceSnapshot({ projects: [replacementProject] });
    const pendingSave = deferred<WorkspaceSnapshot>();
    const store = fakeStore({
      bootstrap: [
        readyResult({ snapshot: initial }),
        readyResult({ snapshot: replacement }),
      ],
      commit: pendingSave.promise,
    });
    const publications = vi.fn();
    const renderEditor = (mount: WorkspaceEditorMount) => (
      <WorkspaceWritesProbe
        mount={{
          ...mount,
          onWorkspaceChange(snapshot) {
            publications(snapshot);
            mount.onWorkspaceChange(snapshot);
          },
        }}
        workingProject={workingProject}
      />
    );
    render(<WorkspaceBootstrapGate store={store} renderEditor={renderEditor} />);
    fireEvent.click(await screen.findByTestId('editor-page'));
    expect(publications).toHaveBeenLastCalledWith(workspaceSnapshot({
      projects: [workingProject],
    }));
    act(() => store.emitAuthorityLost(recoveryResult(workspaceRecovery({
      recoveryId: 'real-hook-retry',
      availableExports: [],
      canRetry: true,
    }))));
    publications.mockClear();

    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await screen.findByTestId('editor-page');
    await waitFor(() => expect(publications).toHaveBeenCalledWith(replacement));
    expect(publications).toHaveBeenCalledOnce();
    act(() => store.emitAuthorityLost(unavailableResult({ availableExports: [] }), 1));
    fireEvent.click(screen.getByRole('button', {
      name: OPEN_WORKSPACE_PRESENTATION.actionLabel,
    }));

    expect(downloadJson).toHaveBeenCalledWith({
      format: 'doctect.open-workspace-recovery',
      version: 1,
      capturedAt: expect.any(String),
      workspace: replacement,
    }, OPEN_WORKSPACE_PRESENTATION.filename);
  });

  it('downloads nested open work published by the real write hook before save settles', async () => {
    const initialState = createBlankProject();
    const initialProject = {
      ...workspaceSnapshot().projects[0],
      initialState,
    };
    const initialWorkspace = workspaceSnapshot({ projects: [initialProject] });
    const workingProject = {
      ...initialProject,
      initialState: {
        ...initialState,
        nodes: {
          ...initialState.nodes,
          [initialState.rootId]: {
            ...initialState.nodes[initialState.rootId],
            title: 'Unsaved nested authority-loss work',
          },
        },
      },
    };
    const openWorkspace = { ...initialWorkspace, projects: [workingProject] };
    const pendingCommit = deferred<ReturnType<typeof workspaceSnapshot>>();
    const store = fakeStore({
      bootstrap: readyResult({ snapshot: initialWorkspace }),
      commit: pendingCommit.promise,
    });
    const renderEditor = (mount: WorkspaceEditorMount) => (
      <WorkspaceWritesProbe mount={mount} workingProject={workingProject} />
    );
    render(<WorkspaceBootstrapGate store={store} renderEditor={renderEditor} />);

    fireEvent.click(await screen.findByTestId('editor-page'));
    expect(store.commit).toHaveBeenCalledWith({
      type: 'save-project',
      project: workingProject,
    });
    act(() => store.emitAuthorityLost(recoveryResult(splitBrainRecovery())));
    expect(screen.queryByTestId('editor-page')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', {
      name: OPEN_WORKSPACE_PRESENTATION.actionLabel,
    }));
    expect(downloadJson).toHaveBeenCalledWith({
      format: 'doctect.open-workspace-recovery',
      version: 1,
      capturedAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/),
      workspace: openWorkspace,
    }, OPEN_WORKSPACE_PRESENTATION.filename);
  });

  it('requires confirmation before adding changed legacy data as separate copies', async () => {
    const recovered = workspaceSnapshot({ activeProjectId: 'recovered-project' });
    const recovery = splitBrainRecovery({ recoveryId: 'recovery-confirmed' });
    const store = fakeStore({
      bootstrap: recoveryResult(recovery),
      commit: recovered,
    });
    render(<WorkspaceBootstrapGate store={store} renderEditor={fakeEditorRenderer} />);
    await screen.findByRole('heading', { name: 'We found two different saved project sets' });

    fireEvent.click(screen.getByRole('button', {
      name: 'Add changed projects without replacing anything',
    }));
    const dialog = screen.getByRole('dialog', {
      name: 'Add changed projects as separate copies?',
    });
    expect(within(dialog).getByText(/Cloud links are removed from working copies\./)).toBeVisible();
    expect(store.commit).not.toHaveBeenCalled();

    fireEvent.click(within(dialog).getByRole('button', { name: 'Add separate copies' }));
    await waitFor(() => expect(store.commit).toHaveBeenCalledWith({
      type: 'recover-legacy-as-copies',
      recoveryId: 'recovery-confirmed',
    }));
    expect(await screen.findByTestId('editor-page')).toHaveTextContent('recovered-project');
  });

  it('requires fresh confirmation when the recovery identity changes', async () => {
    const recoveryA = splitBrainRecovery({ recoveryId: 'recovery-a' });
    const recoveryB = splitBrainRecovery({ recoveryId: 'recovery-b' });
    const store = fakeStore({ bootstrap: recoveryResult(recoveryA) });
    render(<WorkspaceBootstrapGate store={store} renderEditor={fakeEditorRenderer} />);
    await screen.findByRole('heading', { name: 'We found two different saved project sets' });

    fireEvent.click(screen.getByRole('button', {
      name: 'Add changed projects without replacing anything',
    }));
    const staleConfirm = screen.getByRole('button', { name: 'Add separate copies' });

    act(() => store.emitAuthorityLost(recoveryResult(recoveryB)));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    fireEvent.click(staleConfirm);
    expect(store.commit).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', {
      name: 'Add changed projects without replacing anything',
    }));
    fireEvent.click(screen.getByRole('button', { name: 'Add separate copies' }));
    await waitFor(() => expect(store.commit).toHaveBeenCalledWith({
      type: 'recover-legacy-as-copies',
      recoveryId: 'recovery-b',
    }));
    expect(store.commit).not.toHaveBeenCalledWith({
      type: 'recover-legacy-as-copies',
      recoveryId: 'recovery-a',
    });
  });

  it('contains confirmation focus, closes on Escape, and restores the recovery trigger', async () => {
    const store = fakeStore({ bootstrap: recoveryResult(splitBrainRecovery()) });
    render(<WorkspaceBootstrapGate store={store} renderEditor={fakeEditorRenderer} />);
    await screen.findByRole('heading', { name: 'We found two different saved project sets' });
    const trigger = screen.getByRole('button', {
      name: 'Add changed projects without replacing anything',
    });
    const alert = screen.getByRole('alert');
    const recoveryContent = alert.closest('section');
    expect(recoveryContent).not.toBeNull();

    fireEvent.click(trigger);
    const dialog = screen.getByRole('dialog', {
      name: 'Add changed projects as separate copies?',
    });
    const close = within(dialog).getByRole('button', {
      name: 'Close recovery confirmation',
    });
    const confirm = within(dialog).getByRole('button', { name: 'Add separate copies' });
    expect(trigger).toHaveClass('min-h-11');
    expect(close).toHaveClass('size-11');
    expect(confirm).toHaveClass('min-h-11');
    expect(confirm).toHaveFocus();
    expect(recoveryContent).toHaveAttribute('inert');
    expect(recoveryContent).toHaveAttribute('aria-hidden', 'true');
    expect(dialog.closest('[inert]')).toBeNull();

    confirm.focus();
    fireEvent.keyDown(dialog, { key: 'Tab' });
    expect(close).toHaveFocus();
    close.focus();
    fireEvent.keyDown(dialog, { key: 'Tab', shiftKey: true });
    expect(confirm).toHaveFocus();

    fireEvent.keyDown(dialog, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(recoveryContent).not.toHaveAttribute('inert');
    expect(recoveryContent).not.toHaveAttribute('aria-hidden');
    expect(trigger).toHaveFocus();
  });

  it('keeps recovery blocking and reports a failed recover command', async () => {
    const recoveryCommit = deferred<ReturnType<typeof workspaceSnapshot>>();
    const store = fakeStore({
      bootstrap: recoveryResult(splitBrainRecovery()),
      commit: recoveryCommit.promise,
    });
    render(<WorkspaceBootstrapGate store={store} renderEditor={fakeEditorRenderer} />);
    await screen.findByRole('heading', { name: 'We found two different saved project sets' });

    fireEvent.click(screen.getByRole('button', {
      name: 'Add changed projects without replacing anything',
    }));
    fireEvent.click(screen.getByRole('button', { name: 'Add separate copies' }));
    expect(screen.getByRole('button', { name: 'Adding separate copies' })).toBeDisabled();
    await act(async () => recoveryCommit.reject(new Error('quota exhausted')));

    expect(await screen.findByText(SEPARATE_COPIES_ERROR)).toBeVisible();
    expect(screen.getByRole('button', {
      name: 'Add changed projects without replacing anything',
    })).toBeEnabled();
    expect(screen.queryByTestId('editor-page')).not.toBeInTheDocument();
  });

  it('aborts its retained bootstrap observer on unmount', () => {
    const bootstrap = deferred<ReturnType<typeof readyResult>>();
    const store = fakeStore({ bootstrap: bootstrap.promise });
    const view = render(
      <WorkspaceBootstrapGate store={store} renderEditor={fakeEditorRenderer} />,
    );
    const signal = store.observers[0]?.signal;
    expect(signal?.aborted).toBe(false);

    view.unmount();

    expect(signal?.aborted).toBe(true);
  });
});

describe('recovery export capabilities', () => {
  const sources = [
    'legacy-current',
    'legacy-original',
    'indexeddb-workspace',
  ] as const satisfies readonly RecoverySource[];
  const combinations = Array.from({ length: 2 ** sources.length }, (_, mask) =>
    sources.filter((_, index) => (mask & (1 << index)) !== 0));

  it('downloads every durable project set with its shared filename', async () => {
    const store = fakeStore({ bootstrap: recoveryResult(splitBrainRecovery()) });
    render(<WorkspaceBootstrapGate store={store} renderEditor={fakeEditorRenderer} />);
    await screen.findByRole('heading', { name: 'We found two different saved project sets' });

    for (const [index, source] of sources.entries()) {
      const button = screen.getByRole('button', {
        name: RECOVERY_SOURCE_PRESENTATION[source].actionLabel,
      });
      fireEvent.click(button);
      await waitFor(() => expect(downloadBlob).toHaveBeenCalledTimes(index + 1));
      expect(downloadBlob).toHaveBeenNthCalledWith(
        index + 1,
        expect.any(Blob),
        RECOVERY_SOURCE_PRESENTATION[source].filename,
      );
      await waitFor(() => expect(button).toBeEnabled());
    }
  });

  it('reports the shared project error when a durable download fails', async () => {
    const store = fakeStore({ bootstrap: recoveryResult(splitBrainRecovery()) });
    store.exportRecoveryBundle.mockRejectedValueOnce(new Error('download blocked'));
    render(<WorkspaceBootstrapGate store={store} renderEditor={fakeEditorRenderer} />);
    await screen.findByRole('heading', { name: 'We found two different saved project sets' });

    fireEvent.click(screen.getByRole('button', {
      name: RECOVERY_SOURCE_PRESENTATION['legacy-current'].actionLabel,
    }));

    expect(await screen.findByText(PROJECT_DOWNLOAD_ERROR)).toBeVisible();
  });

  it('explains each advertised project set after the primary split-brain action', () => {
    render(<WorkspaceRecoveryScreen
      result={recoveryResult(splitBrainRecovery())}
      onExport={vi.fn()}
      onRecoverAsCopies={vi.fn()}
    />);

    expect(screen.getByRole('heading', {
      name: 'We found two different saved project sets',
    })).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Save project copies' })).toBeVisible();
    const primaryAction = screen.getByRole('button', {
      name: 'Add changed projects without replacing anything',
    });
    const copiesHeading = screen.getByRole('heading', { name: 'Save project copies' });
    expect(primaryAction.compareDocumentPosition(copiesHeading)
      & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    for (const source of sources) {
      const presentation = RECOVERY_SOURCE_PRESENTATION[source];
      expect(screen.getByRole('heading', { name: presentation.title })).toBeVisible();
      expect(screen.getByText(presentation.explanation)).toBeVisible();
      expect(screen.getByRole('button', { name: presentation.actionLabel })).toBeEnabled();
    }
  });

  it('keeps recovery loaders visible but static under reduced motion', () => {
    const view = render(<WorkspaceRecoveryScreen
      result={recoveryResult(splitBrainRecovery())}
      onExport={vi.fn()}
      onRecoverAsCopies={vi.fn()}
      activeExport="legacy-current"
      isRecovering
    />);

    const loaders = Array.from(view.container.querySelectorAll('.animate-spin'));
    expect(loaders).toHaveLength(2);
    for (const loader of loaders) {
      expect(loader).toHaveClass('motion-reduce:animate-none');
    }
  });

  it.each(['recovery', 'unavailable'] as const)(
    'renders exactly every advertised export combination for %s state',
    state => {
      for (const availableExports of combinations) {
        cleanup();
        const onExport = vi.fn();
        const result = state === 'recovery'
          ? recoveryResult(splitBrainRecovery({
            availableExports: [...availableExports],
            canRecoverLegacyAsCopies: false,
          }))
          : unavailableResult({ availableExports: [...availableExports] });
        render(<WorkspaceRecoveryScreen result={result} onExport={onExport} />);

        for (const source of sources) {
          const button = screen.queryByRole('button', {
            name: RECOVERY_SOURCE_PRESENTATION[source].actionLabel,
          });
          if (availableExports.includes(source)) {
            expect(button).toBeEnabled();
            fireEvent.click(button!);
          } else {
            expect(button).not.toBeInTheDocument();
          }
        }
        expect(onExport.mock.calls.map(([source]) => source)).toEqual(availableExports);
      }
    },
  );
});

describe('MigrationReceipt', () => {
  it('keeps its download loader visible but static under reduced motion', () => {
    const view = render(<MigrationReceipt
      receipt={migrationReceipt()}
      onContinue={vi.fn()}
      onDownloadOriginal={vi.fn()}
      isDownloading
    />);

    expect(view.container.querySelector('.animate-spin'))
      .toHaveClass('motion-reduce:animate-none');
    expect(screen.getByText('Preparing project file')).toBeVisible();
  });

  it('shows receipt before editor, downloads pre-update projects, then records acknowledgement', async () => {
    const receipt = migrationReceipt({
      id: 'receipt-ordering',
      projectCount: 3,
      customPresetCount: 2,
      pendingImportPreserved: true,
    });
    const store = fakeReadyStore({ receipt });
    const renderEditor = vi.fn(fakeEditorRenderer);
    render(<WorkspaceBootstrapGate store={store} renderEditor={renderEditor} />);

    expect(await screen.findByRole('heading', { name: 'Your projects are ready' })).toBeVisible();
    expect(screen.getByText('Doctect moved and checked your local projects.')).toBeVisible();
    expect(screen.getByText('3 projects')).toBeVisible();
    expect(screen.getByText('2 custom presets')).toBeVisible();
    expect(screen.getByText('Pending import preserved')).toBeVisible();
    expect(screen.getByText(
      'Doctect kept the previous saved project data unchanged in case recovery is needed.',
    )).toBeVisible();
    expect(renderEditor).not.toHaveBeenCalled();

    const download = screen.getByRole('button', {
      name: 'Download projects from before the update',
    });
    const continueToEditor = screen.getByRole('button', { name: 'Continue to editor' });
    expect(download).toBeEnabled();
    expect(download).toHaveClass('min-h-11');
    expect(continueToEditor).toHaveClass('min-h-11');
    fireEvent.click(download);
    await waitFor(() => expect(store.exportRecoveryBundle).toHaveBeenCalledWith('legacy-original'));
    await waitFor(() => expect(downloadBlob).toHaveBeenCalledOnce());
    expect(downloadBlob).toHaveBeenCalledWith(
      expect.any(Blob),
      RECOVERY_SOURCE_PRESENTATION['legacy-original'].filename,
    );
    expect(renderEditor).not.toHaveBeenCalled();

    fireEvent.click(continueToEditor);
    expect(await screen.findByTestId('editor-page')).toBeVisible();
    expect(window.localStorage.getItem(
      'doctect_workspace_migration_receipt_seen:receipt-ordering',
    )).toBe('1');
  });

  it('uses singular and plural receipt counts and truthful pending-import wording', () => {
    const props = {
      onContinue: vi.fn(),
      onDownloadOriginal: vi.fn(),
    };
    const first = render(<MigrationReceipt
      receipt={migrationReceipt({
        projectCount: 1,
        customPresetCount: 1,
        pendingImportPreserved: true,
      })}
      {...props}
    />);
    expect(screen.getByText('1 project')).toBeVisible();
    expect(screen.getByText('1 custom preset')).toBeVisible();
    expect(screen.getByText('Pending import preserved')).toBeVisible();
    first.unmount();

    render(<MigrationReceipt
      receipt={migrationReceipt({
        projectCount: 2,
        customPresetCount: 0,
        pendingImportPreserved: false,
      })}
      {...props}
    />);
    expect(screen.getByText('2 projects')).toBeVisible();
    expect(screen.getByText('0 custom presets')).toBeVisible();
    expect(screen.getByText('No pending import was waiting')).toBeVisible();
  });

  it('skips a receipt whose preference is already acknowledged', async () => {
    const receipt = migrationReceipt({ id: 'receipt-seen' });
    window.localStorage.setItem(
      'doctect_workspace_migration_receipt_seen:receipt-seen',
      '1',
    );
    const store = fakeReadyStore({ receipt });
    render(<WorkspaceBootstrapGate store={store} renderEditor={fakeEditorRenderer} />);

    expect(await screen.findByTestId('editor-page')).toBeVisible();
    expect(screen.queryByRole('heading', { name: 'Your projects are ready' }))
      .not.toBeInTheDocument();
  });

  it('allows editor entry after a preference write failure and shows receipt next bootstrap', async () => {
    const receipt = migrationReceipt({ id: 'receipt-write-failed' });
    const setItem = vi.spyOn(Storage.prototype, 'setItem')
      .mockImplementationOnce(() => { throw new Error('preferences blocked'); });
    const first = render(
      <WorkspaceBootstrapGate
        store={fakeReadyStore({ receipt })}
        renderEditor={fakeEditorRenderer}
      />,
    );
    await screen.findByRole('heading', { name: 'Your projects are ready' });

    fireEvent.click(screen.getByRole('button', { name: 'Continue to editor' }));
    expect(await screen.findByTestId('editor-page')).toBeVisible();
    expect(setItem).toHaveBeenCalledWith(
      'doctect_workspace_migration_receipt_seen:receipt-write-failed',
      '1',
    );
    expect(window.localStorage.getItem(
      'doctect_workspace_migration_receipt_seen:receipt-write-failed',
    )).toBeNull();
    first.unmount();

    render(<WorkspaceBootstrapGate
      store={fakeReadyStore({ receipt })}
      renderEditor={fakeEditorRenderer}
    />);
    expect(await screen.findByRole('heading', { name: 'Your projects are ready' })).toBeVisible();
    expect(screen.queryByTestId('editor-page')).not.toBeInTheDocument();
  });
});
