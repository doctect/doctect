import React, { useEffect, useRef, useState } from 'react';
import { downloadBlob } from '../../services/browserDownload';
import type {
  LocalWorkspaceStore,
  MigrationReceipt,
  RecoverySource,
  WorkspaceBootstrapPhase,
  WorkspaceBootstrapResult,
  WorkspaceSnapshot,
} from '../../services/localWorkspace/index';
import { MigrationReceipt as MigrationReceiptScreen } from './MigrationReceipt';
import { WorkspaceBootstrapScreen } from './WorkspaceBootstrapScreen';
import {
  WorkspaceRecoveryScreen,
  type WorkspaceBlockingResult,
} from './WorkspaceRecoveryScreen';

export interface WorkspaceEditorMount {
  store: LocalWorkspaceStore;
  initialWorkspace: WorkspaceSnapshot;
  initialWarnings: string[];
}

export interface WorkspaceBootstrapGateProps {
  store: LocalWorkspaceStore;
  renderEditor: (mount: WorkspaceEditorMount) => React.ReactElement;
}

type ReadyResult = Extract<WorkspaceBootstrapResult, { status: 'ready' }>;

type GateState =
  | { kind: 'bootstrapping'; store: LocalWorkspaceStore; phase: WorkspaceBootstrapPhase }
  | { kind: 'blocked'; store: LocalWorkspaceStore; result: WorkspaceBlockingResult }
  | { kind: 'ready'; store: LocalWorkspaceStore; result: ReadyResult; showReceipt: boolean };

const RECEIPT_PREFERENCE_PREFIX = 'doctect_workspace_migration_receipt_seen:';

const DOWNLOAD_FILENAMES: Record<RecoverySource, string> = {
  'legacy-current': 'doctect-current-browser-copy.json',
  'legacy-original': 'doctect-original-browser-backup.json',
  'indexeddb-workspace': 'doctect-editor-copy.json',
};

const rejectedBootstrapResult = (error: unknown): WorkspaceBlockingResult => ({
  status: 'recovery',
  recovery: {
    recoveryId: 'workspace-bootstrap-rejected',
    kind: 'migration-failed',
    category: 'bootstrap-rejected',
    message: error instanceof Error
      ? error.message
      : 'Local workspace migration could not be completed.',
    availableExports: ['legacy-current'],
    canRetry: true,
    canRecoverLegacyAsCopies: false,
  },
});

const receiptPreferenceKey = (receipt: MigrationReceipt): string =>
  `${RECEIPT_PREFERENCE_PREFIX}${receipt.id}`;

const receiptWasSeen = (receipt: MigrationReceipt): boolean => {
  try {
    return window.localStorage.getItem(receiptPreferenceKey(receipt)) === '1';
  } catch {
    return false;
  }
};

export function WorkspaceBootstrapGate({
  store,
  renderEditor,
}: WorkspaceBootstrapGateProps) {
  const [state, setState] = useState<GateState>({
    kind: 'bootstrapping',
    store,
    phase: 'opening-local-storage',
  });
  const [activeExport, setActiveExport] = useState<RecoverySource | null>(null);
  const [isRecovering, setIsRecovering] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const attemptRef = useRef(0);
  const authorityVersionRef = useRef(0);
  const actionRef = useRef(0);
  const currentStoreRef = useRef(store);
  currentStoreRef.current = store;
  const currentStateRef = useRef(state);
  currentStateRef.current = state;

  const resetActions = () => {
    actionRef.current += 1;
    setActiveExport(null);
    setIsRecovering(false);
    setActionError(null);
  };

  const publishResult = (
    resultStore: LocalWorkspaceStore,
    result: WorkspaceBootstrapResult,
  ) => {
    resetActions();
    if (result.status === 'ready') {
      setState({
        kind: 'ready',
        store: resultStore,
        result,
        showReceipt: Boolean(result.receipt && !receiptWasSeen(result.receipt)),
      });
      return;
    }
    setState({ kind: 'blocked', store: resultStore, result });
  };

  const beginBootstrap = async (
    controller: AbortController,
    bootstrapStore: LocalWorkspaceStore,
  ) => {
    const attempt = ++attemptRef.current;
    authorityVersionRef.current += 1;
    let authorityLost = false;
    resetActions();
    setState({
      kind: 'bootstrapping',
      store: bootstrapStore,
      phase: 'opening-local-storage',
    });
    const isCurrent = () => !controller.signal.aborted
      && attemptRef.current === attempt
      && currentStoreRef.current === bootstrapStore;

    try {
      const result = await bootstrapStore.bootstrap({
        signal: controller.signal,
        onPhase(phase) {
          if (isCurrent() && !authorityLost) {
            setState({ kind: 'bootstrapping', store: bootstrapStore, phase });
          }
        },
        onAuthorityLost(result) {
          if (!isCurrent()) return;
          authorityLost = true;
          authorityVersionRef.current += 1;
          resetActions();
          setState({ kind: 'blocked', store: bootstrapStore, result });
        },
      });
      if (isCurrent() && !authorityLost) publishResult(bootstrapStore, result);
    } catch (error) {
      if (isCurrent() && !authorityLost) {
        publishResult(bootstrapStore, rejectedBootstrapResult(error));
      }
    }
  };

  useEffect(() => {
    const controller = new AbortController();
    controllerRef.current = controller;
    void beginBootstrap(controller, store);
    return () => {
      attemptRef.current += 1;
      authorityVersionRef.current += 1;
      actionRef.current += 1;
      controller.abort();
      if (controllerRef.current === controller) controllerRef.current = null;
    };
  }, [store]);

  const retry = () => {
    const controller = controllerRef.current;
    if (!controller
      || controller.signal.aborted
      || state.store !== currentStoreRef.current) return;
    void beginBootstrap(controller, state.store);
  };

  const exportRecovery = async (
    actionStore: LocalWorkspaceStore,
    source: RecoverySource,
  ) => {
    if (actionStore !== currentStoreRef.current) return;
    const action = ++actionRef.current;
    const attempt = attemptRef.current;
    const authorityVersion = authorityVersionRef.current;
    setActionError(null);
    setActiveExport(source);
    try {
      const blob = await actionStore.exportRecoveryBundle(source);
      if (actionRef.current !== action
        || attemptRef.current !== attempt
        || authorityVersionRef.current !== authorityVersion
        || currentStoreRef.current !== actionStore
        || controllerRef.current?.signal.aborted) {
        return;
      }
      downloadBlob(blob, DOWNLOAD_FILENAMES[source]);
    } catch {
      if (actionRef.current === action
        && attemptRef.current === attempt
        && authorityVersionRef.current === authorityVersion
        && currentStoreRef.current === actionStore) {
        setActionError('Backup download failed. Nothing was changed. Try again.');
      }
    } finally {
      if (actionRef.current === action && currentStoreRef.current === actionStore) {
        setActiveExport(null);
      }
    }
  };

  const recoverAsCopies = async (
    actionStore: LocalWorkspaceStore,
    recoveryId: string,
  ) => {
    const currentState = currentStateRef.current;
    if (currentState.kind !== 'blocked'
      || currentState.result.status !== 'recovery'
      || currentState.result.recovery.recoveryId !== recoveryId
      || actionStore !== currentState.store
      || actionStore !== currentStoreRef.current) return;
    const action = ++actionRef.current;
    const attempt = attemptRef.current;
    const authorityVersion = authorityVersionRef.current;
    setActionError(null);
    setIsRecovering(true);
    try {
      const snapshot = await actionStore.commit({
        type: 'recover-legacy-as-copies',
        recoveryId,
      });
      if (actionRef.current !== action
        || attemptRef.current !== attempt
        || authorityVersionRef.current !== authorityVersion
        || currentStoreRef.current !== actionStore
        || controllerRef.current?.signal.aborted) {
        return;
      }
      setState({
        kind: 'ready',
        store: actionStore,
        result: { status: 'ready', snapshot },
        showReceipt: false,
      });
    } catch {
      if (actionRef.current === action
        && attemptRef.current === attempt
        && authorityVersionRef.current === authorityVersion
        && currentStoreRef.current === actionStore) {
        setActionError(
          'Recovery failed. Nothing was overwritten. Try again or download a backup.',
        );
      }
    } finally {
      if (actionRef.current === action && currentStoreRef.current === actionStore) {
        setIsRecovering(false);
      }
    }
  };

  const continueFromReceipt = () => {
    if (state.kind !== 'ready'
      || !state.result.receipt
      || state.store !== currentStoreRef.current) return;
    try {
      window.localStorage.setItem(receiptPreferenceKey(state.result.receipt), '1');
    } catch {
      // Preference failure must not block verified workspace data.
    }
    actionRef.current += 1;
    setActiveExport(null);
    setActionError(null);
    setState({ ...state, showReceipt: false });
  };

  if (state.store !== store) {
    return <WorkspaceBootstrapScreen phase="opening-local-storage" />;
  }

  if (state.kind === 'bootstrapping') {
    return <WorkspaceBootstrapScreen phase={state.phase} />;
  }

  if (state.kind === 'blocked') {
    const recovery = state.result.status === 'recovery'
      ? state.result.recovery
      : undefined;
    return (
      <WorkspaceRecoveryScreen
        key={recovery ? `recovery:${recovery.recoveryId}` : 'unavailable'}
        result={state.result}
        onRetry={recovery?.canRetry
          ? retry
          : undefined}
        onExport={source => { void exportRecovery(state.store, source); }}
        onRecoverAsCopies={recovery?.canRecoverLegacyAsCopies
          ? () => { void recoverAsCopies(state.store, recovery.recoveryId); }
          : undefined}
        activeExport={activeExport}
        isRecovering={isRecovering}
        actionError={actionError}
      />
    );
  }

  if (state.showReceipt && state.result.receipt) {
    return (
      <MigrationReceiptScreen
        receipt={state.result.receipt}
        onContinue={continueFromReceipt}
        onDownloadOriginal={() => { void exportRecovery(state.store, 'legacy-original'); }}
        isDownloading={activeExport === 'legacy-original'}
        downloadError={actionError}
      />
    );
  }

  return renderEditor({
    store: state.store,
    initialWorkspace: state.result.snapshot,
    initialWarnings: [],
  });
}
