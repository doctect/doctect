import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { downloadBlob, downloadJson } from '../../services/browserDownload';
import { trackEvent } from '../../services/analytics';
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
  onWorkspaceChange(snapshot: WorkspaceSnapshot): void;
}

export interface WorkspaceBootstrapGateProps {
  store: LocalWorkspaceStore;
  renderEditor: (mount: WorkspaceEditorMount) => React.ReactElement;
}

type ReadyResult = Extract<WorkspaceBootstrapResult, { status: 'ready' }>;

type GateState =
  | { kind: 'bootstrapping'; store: LocalWorkspaceStore; phase: WorkspaceBootstrapPhase }
  | {
      kind: 'blocked';
      store: LocalWorkspaceStore;
      result: WorkspaceBlockingResult;
      openWorkspace?: WorkspaceSnapshot;
    }
  | {
      kind: 'ready';
      store: LocalWorkspaceStore;
      result: ReadyResult;
      showReceipt: boolean;
      importsReady: boolean;
      initialWarnings: string[];
      warningImportIds: string[];
    };

interface PendingImportDescriptor {
  id: string;
  warnings: string[];
}

interface ImportDelivery {
  warnings: string[];
  analyticsEmitted: boolean;
  warningsAcknowledged: boolean;
}

interface StoreImportState {
  unresolved: PendingImportDescriptor[];
  deliveries: Map<string, ImportDelivery>;
}

interface OpenWorkspaceCapture {
  store: LocalWorkspaceStore;
  workspace: WorkspaceSnapshot;
}

const storeImportStates = new WeakMap<LocalWorkspaceStore, StoreImportState>();

const importStateFor = (store: LocalWorkspaceStore): StoreImportState => {
  const existing = storeImportStates.get(store);
  if (existing) return existing;
  const created: StoreImportState = { unresolved: [], deliveries: new Map() };
  storeImportStates.set(store, created);
  return created;
};

const descriptorsFrom = (snapshot: WorkspaceSnapshot): PendingImportDescriptor[] =>
  snapshot.pendingImports.map(pending => ({
    id: pending.id,
    warnings: [...pending.warnings],
  }));

const mergeBootstrapImports = (
  importState: StoreImportState,
  snapshot: WorkspaceSnapshot,
): void => {
  const known = new Set(importState.unresolved.map(pending => pending.id));
  for (const pending of descriptorsFrom(snapshot)) {
    if (known.has(pending.id)) continue;
    importState.unresolved.push(pending);
    known.add(pending.id);
  }
};

const reconcileConsumeResult = (
  importState: StoreImportState,
  snapshot: WorkspaceSnapshot,
): void => {
  importState.unresolved = descriptorsFrom(snapshot);
};

const recordConsumeDelivery = (
  store: LocalWorkspaceStore,
  pending: PendingImportDescriptor,
): void => {
  const importState = importStateFor(store);
  let delivery = importState.deliveries.get(pending.id);
  if (!delivery) {
    delivery = {
      warnings: [...pending.warnings],
      analyticsEmitted: false,
      warningsAcknowledged: pending.warnings.length === 0,
    };
    importState.deliveries.set(pending.id, delivery);
  }
  if (!delivery.analyticsEmitted) {
    delivery.analyticsEmitted = true;
    void trackEvent('project_imported_from_gallery');
  }
};

const unacknowledgedWarnings = (store: LocalWorkspaceStore) => {
  const warningImportIds: string[] = [];
  const initialWarnings: string[] = [];
  for (const [importId, delivery] of importStateFor(store).deliveries) {
    if (delivery.warningsAcknowledged || delivery.warnings.length === 0) continue;
    warningImportIds.push(importId);
    initialWarnings.push(...delivery.warnings);
  }
  return { warningImportIds, initialWarnings };
};

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

const rejectedImportConsumptionResult = (): WorkspaceBlockingResult => ({
  status: 'recovery',
  recovery: {
    recoveryId: 'pending-import-consumption-failed',
    kind: 'migration-failed',
    category: 'consume-import-failed',
    message: 'A pending project import could not be committed to local storage.',
    availableExports: ['indexeddb-workspace'],
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
  const consumeAttemptRef = useRef(0);
  const consumingRef = useRef<{ store: LocalWorkspaceStore; attempt: number } | null>(null);
  const openWorkspaceRef = useRef<OpenWorkspaceCapture | null>(null);
  const committedStoreRef = useRef(store);
  const committedStateRef = useRef(state);

  useLayoutEffect(() => {
    if (committedStoreRef.current !== store) openWorkspaceRef.current = null;
    committedStoreRef.current = store;
    committedStateRef.current = state;
  }, [state, store]);

  const resetActions = () => {
    actionRef.current += 1;
    setActiveExport(null);
    setIsRecovering(false);
    setActionError(null);
  };

  const blockedState = (
    resultStore: LocalWorkspaceStore,
    result: WorkspaceBlockingResult,
  ): GateState => {
    const capture = openWorkspaceRef.current;
    return {
      kind: 'blocked',
      store: resultStore,
      result,
      ...(capture?.store === resultStore
        ? { openWorkspace: structuredClone(capture.workspace) }
        : {}),
    };
  };

  const prepareImportQueue = (
    resultStore: LocalWorkspaceStore,
    snapshot: WorkspaceSnapshot,
  ): StoreImportState => {
    const importState = importStateFor(resultStore);
    mergeBootstrapImports(importState, snapshot);
    return importState;
  };

  const publishResult = (
    resultStore: LocalWorkspaceStore,
    result: WorkspaceBootstrapResult,
  ) => {
    resetActions();
    if (result.status === 'ready') {
      openWorkspaceRef.current = {
        store: resultStore,
        workspace: structuredClone(result.snapshot),
      };
      const importState = prepareImportQueue(resultStore, result.snapshot);
      const warnings = unacknowledgedWarnings(resultStore);
      setState({
        kind: 'ready',
        store: resultStore,
        result,
        showReceipt: Boolean(result.receipt && !receiptWasSeen(result.receipt)),
        importsReady: importState.unresolved.length === 0,
        ...warnings,
      });
      return;
    }
    setState(blockedState(resultStore, result));
  };

  const beginBootstrap = async (
    controller: AbortController,
    bootstrapStore: LocalWorkspaceStore,
  ) => {
    const attempt = ++attemptRef.current;
    authorityVersionRef.current += 1;
    consumeAttemptRef.current += 1;
    consumingRef.current = null;
    let authorityLost = false;
    resetActions();
    setState({
      kind: 'bootstrapping',
      store: bootstrapStore,
      phase: 'opening-local-storage',
    });
    const isCurrent = () => !controller.signal.aborted
      && attemptRef.current === attempt
      && committedStoreRef.current === bootstrapStore;

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
          consumeAttemptRef.current += 1;
          consumingRef.current = null;
          resetActions();
          setState(blockedState(bootstrapStore, result));
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
      consumeAttemptRef.current += 1;
      consumingRef.current = null;
      controller.abort();
      if (controllerRef.current === controller) controllerRef.current = null;
    };
  }, [store]);

  const consumePendingImports = async (
    actionStore: LocalWorkspaceStore,
    initialSnapshot: WorkspaceSnapshot,
  ): Promise<void> => {
    if (consumingRef.current?.store === actionStore) return;
    const consumeAttempt = ++consumeAttemptRef.current;
    consumingRef.current = { store: actionStore, attempt: consumeAttempt };
    const bootstrapAttempt = attemptRef.current;
    const authorityVersion = authorityVersionRef.current;
    const isCurrent = () => consumeAttemptRef.current === consumeAttempt
      && attemptRef.current === bootstrapAttempt
      && authorityVersionRef.current === authorityVersion
      && committedStoreRef.current === actionStore
      && !controllerRef.current?.signal.aborted;
    let snapshot = initialSnapshot;
    const importState = importStateFor(actionStore);

    try {
      while (importState.unresolved.length > 0) {
        const pending = importState.unresolved[0];
        snapshot = await actionStore.commit({
          type: 'consume-import',
          importId: pending.id,
        });
        recordConsumeDelivery(actionStore, pending);
        reconcileConsumeResult(importState, snapshot);
        if (!isCurrent()) return;
      }

      if (!isCurrent()) return;
      const currentState = committedStateRef.current;
      if (currentState.kind !== 'ready' || currentState.store !== actionStore) return;
      const warnings = unacknowledgedWarnings(actionStore);
      openWorkspaceRef.current = {
        store: actionStore,
        workspace: structuredClone(snapshot),
      };
      setState({
        ...currentState,
        result: { ...currentState.result, snapshot },
        importsReady: true,
        ...warnings,
      });
    } catch {
      if (isCurrent()) {
        resetActions();
        setState(blockedState(actionStore, rejectedImportConsumptionResult()));
      }
    } finally {
      if (consumingRef.current?.attempt === consumeAttempt) {
        consumingRef.current = null;
      }
    }
  };

  useEffect(() => {
    if (state.kind !== 'ready'
      || state.showReceipt
      || state.importsReady
      || state.store !== store) return;
    void consumePendingImports(state.store, state.result.snapshot);
  }, [state, store]);

  useEffect(() => {
    if (state.kind !== 'ready'
      || state.showReceipt
      || !state.importsReady
      || state.store !== store
      || state.warningImportIds.length === 0) return;
    const deliveries = importStateFor(state.store).deliveries;
    for (const importId of state.warningImportIds) {
      const delivery = deliveries.get(importId);
      if (delivery) delivery.warningsAcknowledged = true;
    }
  }, [state, store]);

  const retry = () => {
    const controller = controllerRef.current;
    if (!controller
      || controller.signal.aborted
      || state.store !== committedStoreRef.current) return;
    void beginBootstrap(controller, state.store);
  };

  const exportRecovery = async (
    actionStore: LocalWorkspaceStore,
    source: RecoverySource,
  ) => {
    if (actionStore !== committedStoreRef.current) return;
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
        || committedStoreRef.current !== actionStore
        || controllerRef.current?.signal.aborted) {
        return;
      }
      downloadBlob(blob, DOWNLOAD_FILENAMES[source]);
    } catch {
      if (actionRef.current === action
        && attemptRef.current === attempt
        && authorityVersionRef.current === authorityVersion
        && committedStoreRef.current === actionStore) {
        setActionError('Backup download failed. Nothing was changed. Try again.');
      }
    } finally {
      if (actionRef.current === action && committedStoreRef.current === actionStore) {
        setActiveExport(null);
      }
    }
  };

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

  const recoverAsCopies = async (
    actionStore: LocalWorkspaceStore,
    recoveryId: string,
  ) => {
    const currentState = committedStateRef.current;
    if (currentState.kind !== 'blocked'
      || currentState.result.status !== 'recovery'
      || currentState.result.recovery.recoveryId !== recoveryId
      || actionStore !== currentState.store
      || actionStore !== committedStoreRef.current) return;
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
        || committedStoreRef.current !== actionStore
        || controllerRef.current?.signal.aborted) {
        return;
      }
      publishResult(actionStore, { status: 'ready', snapshot });
    } catch {
      if (actionRef.current === action
        && attemptRef.current === attempt
        && authorityVersionRef.current === authorityVersion
        && committedStoreRef.current === actionStore) {
        setActionError(
          'Recovery failed. Nothing was overwritten. Try again or download a backup.',
        );
      }
    } finally {
      if (actionRef.current === action && committedStoreRef.current === actionStore) {
        setIsRecovering(false);
      }
    }
  };

  const continueFromReceipt = () => {
    if (state.kind !== 'ready'
      || !state.result.receipt
      || state.store !== committedStoreRef.current) return;
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
        onExportOpenWorkspace={state.openWorkspace
          ? () => exportOpenWorkspace(state.openWorkspace!)
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

  if (!state.importsReady) {
    return <WorkspaceBootstrapScreen phase="finishing-upgrade" />;
  }

  return renderEditor({
    store: state.store,
    initialWorkspace: state.result.snapshot,
    initialWarnings: state.initialWarnings,
    onWorkspaceChange(snapshot) {
      const current = committedStateRef.current;
      if (current.kind !== 'ready'
        || current.store !== state.store
        || state.store !== committedStoreRef.current) return;
      openWorkspaceRef.current = {
        store: state.store,
        workspace: structuredClone(snapshot),
      };
    },
  });
}
