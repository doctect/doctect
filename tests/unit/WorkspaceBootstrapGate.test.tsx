import { Suspense, startTransition, useLayoutEffect, useState } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { downloadBlob } from '../../services/browserDownload';
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
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('WorkspaceBootstrapGate', () => {
  it('does not mount the editor while bootstrap is pending', () => {
    const bootstrap = deferred<ReturnType<typeof readyResult>>();
    const store = fakeStore({ bootstrap: bootstrap.promise });

    render(<WorkspaceBootstrapGate store={store} renderEditor={fakeEditorRenderer} />);

    expect(screen.getByRole('status')).toHaveTextContent('Opening local storage');
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
    expect(within(alert).getByRole('button', { name: 'Retry' })).toBeEnabled();

    fireEvent.click(within(alert).getByRole('button', { name: 'Download backup' }));
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

    fireEvent.click(trigger);
    const dialog = screen.getByRole('dialog', {
      name: 'Recover changed projects as copies?',
    });
    const close = within(dialog).getByRole('button', {
      name: 'Close recovery confirmation',
    });
    const confirm = within(dialog).getByRole('button', { name: 'Recover as copies' });
    expect(confirm).toHaveFocus();

    confirm.focus();
    fireEvent.keyDown(dialog, { key: 'Tab' });
    expect(close).toHaveFocus();
    close.focus();
    fireEvent.keyDown(dialog, { key: 'Tab', shiftKey: true });
    expect(confirm).toHaveFocus();

    fireEvent.keyDown(dialog, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
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

    fireEvent.click(screen.getByRole('button', { name: 'Download original backup' }));
    await waitFor(() => expect(store.exportRecoveryBundle).toHaveBeenCalledWith('legacy-original'));
    await waitFor(() => expect(downloadBlob).toHaveBeenCalledOnce());
    expect(renderEditor).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Continue to editor' }));
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
