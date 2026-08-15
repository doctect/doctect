import { StrictMode, Suspense, startTransition, useLayoutEffect, useState } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { downloadBlob } from '../../services/browserDownload';
import { trackEvent } from '../../services/analytics';
import {
  WorkspaceBootstrapGate,
  type WorkspaceEditorMount,
} from '../../components/workspace/WorkspaceBootstrapGate';
import { MigrationReceipt } from '../../components/workspace/MigrationReceipt';
import { WorkspaceRecoveryScreen } from '../../components/workspace/WorkspaceRecoveryScreen';
import type {
  LocalWorkspaceStore,
  RecoverySource,
  WorkspaceBootstrapPhase,
  WorkspacePendingImport,
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

function ReplacementActionProbe({
  store,
  downloadDuringLayout,
}: {
  store: LocalWorkspaceStore;
  downloadDuringLayout: boolean;
}) {
  useLayoutEffect(() => {
    if (downloadDuringLayout) {
      screen.queryByRole('button', { name: 'Download current browser copy' })?.click();
    }
  }, [downloadDuringLayout, store]);

  return <WorkspaceBootstrapGate store={store} renderEditor={fakeEditorRenderer} />;
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

    expect(screen.getByRole('status')).toHaveTextContent('Opening local storage');
    expect(view.container.querySelector('.animate-spin'))
      .toHaveClass('motion-reduce:animate-none');
    expect(screen.getByRole('heading', { name: 'Preparing your local projects' })).toBeVisible();
    expect(screen.getByText(
      'Keep this tab open. Existing projects remain untouched until verification finishes.',
    )).toBeVisible();
    expect(screen.queryByTestId('editor-page')).not.toBeInTheDocument();
  });

  it('announces all five truthful bootstrap phase labels', () => {
    const bootstrap = deferred<ReturnType<typeof readyResult>>();
    const store = fakeStore({ bootstrap: bootstrap.promise });
    render(<WorkspaceBootstrapGate store={store} renderEditor={fakeEditorRenderer} />);
    const phases: Array<[WorkspaceBootstrapPhase, string]> = [
      ['opening-local-storage', 'Opening local storage'],
      ['checking-existing-projects', 'Checking existing projects'],
      ['copying-projects', 'Copying projects'],
      ['verifying-projects', 'Verifying projects'],
      ['finishing-upgrade', 'Finishing upgrade'],
    ];

    for (const [phase, label] of phases) {
      act(() => store.emitPhase(phase));
      expect(screen.getByRole('status')).toHaveTextContent(label);
    }
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
    expect(within(alert).getByRole('button', { name: 'Retry' })).toBeEnabled();
    expect(screen.queryByTestId('editor-page')).not.toBeInTheDocument();
    expect(initial.pendingImports).toEqual([pending]);
    expect(trackEvent).not.toHaveBeenCalled();

    fireEvent.click(within(alert).getByRole('button', { name: 'Retry' }));
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

    expect(await screen.findByRole('heading', { name: 'Local projects upgraded' })).toBeVisible();
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
    expect(screen.getByRole('status')).toHaveTextContent('Opening local storage');
    expect(replacementStore.bootstrap).toHaveBeenCalledOnce();
  });

  it('does not let replacement-layout recovery controls invoke the new store', async () => {
    const firstStore = fakeStore({ bootstrap: recoveryResult(splitBrainRecovery()) });
    const replacementBootstrap = deferred<ReturnType<typeof readyResult>>();
    const replacementStore = fakeStore({ bootstrap: replacementBootstrap.promise });
    const view = render(
      <ReplacementActionProbe store={firstStore} downloadDuringLayout={false} />,
    );
    await screen.findByRole('heading', { name: 'Project copies changed in another tab' });

    view.rerender(
      <ReplacementActionProbe store={replacementStore} downloadDuringLayout />,
    );

    expect(replacementStore.exportRecoveryBundle).not.toHaveBeenCalled();
    expect(firstStore.exportRecoveryBundle).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Download current browser copy' }))
      .not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Opening local storage');
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
      name: 'Project copies changed in another tab',
    })).toBeVisible();
    expect(screen.queryByTestId('editor-page')).not.toBeInTheDocument();
    expect(replacementStore.bootstrap).not.toHaveBeenCalled();
  });

  it('shows the exact initial migration failure and offers retry and backup', async () => {
    const store = fakeStore({
      bootstrap: recoveryResult(workspaceRecovery({
        kind: 'migration-failed',
        availableExports: ['legacy-current'],
      })),
    });
    render(<WorkspaceBootstrapGate store={store} renderEditor={fakeEditorRenderer} />);

    const alert = await screen.findByRole('alert');
    expect(within(alert).getByRole('heading', {
      name: "We couldn't upgrade local projects",
    })).toBeVisible();
    expect(within(alert).getByText(
      'Your existing projects remain untouched. The upgrade did not finish, and the editor did not create replacement data.',
    )).toBeVisible();
    const retry = within(alert).getByRole('button', { name: 'Retry' });
    const download = within(alert).getByRole('button', { name: 'Download backup' });
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
      name: "We couldn't upgrade local projects",
    })).toBeVisible();

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(screen.getByRole('status')).toHaveTextContent('Opening local storage');

    act(() => {
      store.emitPhase('finishing-upgrade', 0);
      store.emitAuthorityLost(unavailableResult(), 0);
    });
    expect(screen.getByRole('status')).toHaveTextContent('Opening local storage');
    expect(screen.queryByRole('heading', {
      name: 'Local project storage is unavailable',
    })).not.toBeInTheDocument();

    await act(async () => retry.resolve(readyResult()));
    expect(await screen.findByTestId('editor-page')).toBeVisible();
  });

  it('blocks the editor when local project storage is unavailable', async () => {
    const store = fakeStore({ bootstrap: unavailableResult({ availableExports: [] }) });
    render(<WorkspaceBootstrapGate store={store} renderEditor={fakeEditorRenderer} />);

    const alert = await screen.findByRole('alert');
    expect(within(alert).getByRole('heading', {
      name: 'Local project storage is unavailable',
    })).toBeVisible();
    expect(within(alert).getByText(
      'The editor cannot open safely. No existing project data was changed.',
    )).toBeVisible();
    expect(screen.queryByTestId('editor-page')).not.toBeInTheDocument();
  });

  it('unmounts a ready editor immediately when storage authority is lost', async () => {
    const store = fakeReadyStore();
    render(<WorkspaceBootstrapGate store={store} renderEditor={fakeEditorRenderer} />);
    expect(await screen.findByTestId('editor-page')).toBeVisible();

    act(() => store.emitAuthorityLost(recoveryResult(splitBrainRecovery())));

    expect(await screen.findByRole('heading', {
      name: 'Project copies changed in another tab',
    })).toBeVisible();
    expect(screen.getByText(
      'Nothing was overwritten. Download either copy before choosing how to continue.',
    )).toBeVisible();
    expect(screen.queryByTestId('editor-page')).not.toBeInTheDocument();
  });

  it('requires confirmation before recovering changed legacy data as copies', async () => {
    const recovered = workspaceSnapshot({ activeProjectId: 'recovered-project' });
    const recovery = splitBrainRecovery({ recoveryId: 'recovery-confirmed' });
    const store = fakeStore({
      bootstrap: recoveryResult(recovery),
      commit: recovered,
    });
    render(<WorkspaceBootstrapGate store={store} renderEditor={fakeEditorRenderer} />);
    await screen.findByRole('heading', { name: 'Project copies changed in another tab' });

    fireEvent.click(screen.getByRole('button', {
      name: 'Recover changed projects as copies',
    }));
    const dialog = screen.getByRole('dialog', {
      name: 'Recover changed projects as copies?',
    });
    expect(within(dialog).getByText(/Cloud links are removed from working copies\./)).toBeVisible();
    expect(store.commit).not.toHaveBeenCalled();

    fireEvent.click(within(dialog).getByRole('button', { name: 'Recover as copies' }));
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
    await screen.findByRole('heading', { name: 'Project copies changed in another tab' });

    fireEvent.click(screen.getByRole('button', {
      name: 'Recover changed projects as copies',
    }));
    const staleConfirm = screen.getByRole('button', { name: 'Recover as copies' });

    act(() => store.emitAuthorityLost(recoveryResult(recoveryB)));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    fireEvent.click(staleConfirm);
    expect(store.commit).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', {
      name: 'Recover changed projects as copies',
    }));
    fireEvent.click(screen.getByRole('button', { name: 'Recover as copies' }));
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
    await screen.findByRole('heading', { name: 'Project copies changed in another tab' });
    const trigger = screen.getByRole('button', {
      name: 'Recover changed projects as copies',
    });
    const recoveryContent = screen.getByRole('alert');

    fireEvent.click(trigger);
    const dialog = screen.getByRole('dialog', {
      name: 'Recover changed projects as copies?',
    });
    const close = within(dialog).getByRole('button', {
      name: 'Close recovery confirmation',
    });
    const confirm = within(dialog).getByRole('button', { name: 'Recover as copies' });
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
    await screen.findByRole('heading', { name: 'Project copies changed in another tab' });

    fireEvent.click(screen.getByRole('button', {
      name: 'Recover changed projects as copies',
    }));
    fireEvent.click(screen.getByRole('button', { name: 'Recover as copies' }));
    expect(screen.getByRole('button', { name: 'Recovering copies' })).toBeDisabled();
    await act(async () => recoveryCommit.reject(new Error('quota exhausted')));

    expect(await screen.findByText(
      'Recovery failed. Nothing was overwritten. Try again or download a backup.',
    )).toBeVisible();
    expect(screen.getByRole('button', {
      name: 'Recover changed projects as copies',
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
  const labels: Record<RecoverySource, string> = {
    'legacy-current': 'Download current browser copy',
    'legacy-original': 'Download original backup',
    'indexeddb-workspace': 'Download editor copy',
  };
  const combinations = Array.from({ length: 2 ** sources.length }, (_, mask) =>
    sources.filter((_, index) => (mask & (1 << index)) !== 0));

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
          const button = screen.queryByRole('button', { name: labels[source] });
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
  });

  it('shows receipt before editor, downloads original backup, then records acknowledgement', async () => {
    const receipt = migrationReceipt({
      id: 'receipt-ordering',
      projectCount: 3,
      customPresetCount: 2,
      pendingImportPreserved: true,
    });
    const store = fakeReadyStore({ receipt });
    const renderEditor = vi.fn(fakeEditorRenderer);
    render(<WorkspaceBootstrapGate store={store} renderEditor={renderEditor} />);

    expect(await screen.findByRole('heading', { name: 'Local projects upgraded' })).toBeVisible();
    expect(screen.getByText('3 projects')).toBeVisible();
    expect(screen.getByText('2 custom presets')).toBeVisible();
    expect(screen.getByText('Pending import preserved')).toBeVisible();
    expect(screen.getByText(
      'Original browser-storage values will stay unchanged for this release and the next release.',
    )).toBeVisible();
    expect(renderEditor).not.toHaveBeenCalled();

    const download = screen.getByRole('button', { name: 'Download original backup' });
    const continueToEditor = screen.getByRole('button', { name: 'Continue to editor' });
    expect(download).toHaveClass('min-h-11');
    expect(continueToEditor).toHaveClass('min-h-11');
    fireEvent.click(download);
    await waitFor(() => expect(store.exportRecoveryBundle).toHaveBeenCalledWith('legacy-original'));
    await waitFor(() => expect(downloadBlob).toHaveBeenCalledOnce());
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
    expect(screen.queryByRole('heading', { name: 'Local projects upgraded' }))
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
    await screen.findByRole('heading', { name: 'Local projects upgraded' });

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
    expect(await screen.findByRole('heading', { name: 'Local projects upgraded' })).toBeVisible();
    expect(screen.queryByTestId('editor-page')).not.toBeInTheDocument();
  });
});
