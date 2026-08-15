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
  | { kind: 'bootstrapping'; phase: WorkspaceBootstrapPhase }
  | { kind: 'blocked'; result: WorkspaceBlockingResult }
  | { kind: 'ready'; result: ReadyResult; showReceipt: boolean };

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
    phase: 'opening-local-storage',
  });
  const [activeExport, setActiveExport] = useState<RecoverySource | null>(null);
  const [isRecovering, setIsRecovering] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const attemptRef = useRef(0);
  const authorityVersionRef = useRef(0);
  const actionRef = useRef(0);

  const resetActions = () => {
    actionRef.current += 1;
    setActiveExport(null);
    setIsRecovering(false);
    setActionError(null);
  };

  const publishResult = (result: WorkspaceBootstrapResult) => {
    resetActions();
    if (result.status === 'ready') {
      setState({
        kind: 'ready',
        result,
        showReceipt: Boolean(result.receipt && !receiptWasSeen(result.receipt)),
      });
      return;
    }
    setState({ kind: 'blocked', result });
  };

  const beginBootstrap = async (controller: AbortController) => {
    const attempt = ++attemptRef.current;
    authorityVersionRef.current += 1;
    let authorityLost = false;
    resetActions();
    setState({ kind: 'bootstrapping', phase: 'opening-local-storage' });
    const isCurrent = () => !controller.signal.aborted && attemptRef.current === attempt;

    try {
      const result = await store.bootstrap({
        signal: controller.signal,
        onPhase(phase) {
          if (isCurrent() && !authorityLost) {
            setState({ kind: 'bootstrapping', phase });
          }
        },
        onAuthorityLost(result) {
          if (!isCurrent()) return;
          authorityLost = true;
          authorityVersionRef.current += 1;
          resetActions();
          setState({ kind: 'blocked', result });
        },
      });
      if (isCurrent() && !authorityLost) publishResult(result);
    } catch (error) {
      if (isCurrent() && !authorityLost) publishResult(rejectedBootstrapResult(error));
    }
  };

  useEffect(() => {
    const controller = new AbortController();
    controllerRef.current = controller;
    void beginBootstrap(controller);
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
    if (!controller || controller.signal.aborted) return;
    void beginBootstrap(controller);
  };

  const exportRecovery = async (source: RecoverySource) => {
    const action = ++actionRef.current;
    const attempt = attemptRef.current;
    const authorityVersion = authorityVersionRef.current;
    setActionError(null);
    setActiveExport(source);
    try {
      const blob = await store.exportRecoveryBundle(source);
      if (actionRef.current !== action
        || attemptRef.current !== attempt
        || authorityVersionRef.current !== authorityVersion
        || controllerRef.current?.signal.aborted) {
        return;
      }
      downloadBlob(blob, DOWNLOAD_FILENAMES[source]);
    } catch {
      if (actionRef.current === action
        && attemptRef.current === attempt
        && authorityVersionRef.current === authorityVersion) {
        setActionError('Backup download failed. Nothing was changed. Try again.');
      }
    } finally {
      if (actionRef.current === action) setActiveExport(null);
    }
  };

  const recoverAsCopies = async () => {
    if (state.kind !== 'blocked' || state.result.status !== 'recovery') return;
    const { recoveryId } = state.result.recovery;
    const action = ++actionRef.current;
    const attempt = attemptRef.current;
    const authorityVersion = authorityVersionRef.current;
    setActionError(null);
    setIsRecovering(true);
    try {
      const snapshot = await store.commit({
        type: 'recover-legacy-as-copies',
        recoveryId,
      });
      if (actionRef.current !== action
        || attemptRef.current !== attempt
        || authorityVersionRef.current !== authorityVersion
        || controllerRef.current?.signal.aborted) {
        return;
      }
      setState({
        kind: 'ready',
        result: { status: 'ready', snapshot },
        showReceipt: false,
      });
    } catch {
      if (actionRef.current === action
        && attemptRef.current === attempt
        && authorityVersionRef.current === authorityVersion) {
        setActionError(
          'Recovery failed. Nothing was overwritten. Try again or download a backup.',
        );
      }
    } finally {
      if (actionRef.current === action) setIsRecovering(false);
    }
  };

  const continueFromReceipt = () => {
    if (state.kind !== 'ready' || !state.result.receipt) return;
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

  if (state.kind === 'bootstrapping') {
    return <WorkspaceBootstrapScreen phase={state.phase} />;
  }

  if (state.kind === 'blocked') {
    return (
      <WorkspaceRecoveryScreen
        result={state.result}
        onRetry={state.result.status === 'recovery' && state.result.recovery.canRetry
          ? retry
          : undefined}
        onExport={source => { void exportRecovery(source); }}
        onRecoverAsCopies={state.result.status === 'recovery'
          && state.result.recovery.canRecoverLegacyAsCopies
          ? () => { void recoverAsCopies(); }
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
        onDownloadOriginal={() => { void exportRecovery('legacy-original'); }}
        isDownloading={activeExport === 'legacy-original'}
        downloadError={actionError}
      />
    );
  }

  return renderEditor({
    store,
    initialWorkspace: state.result.snapshot,
    initialWarnings: [],
  });
}
