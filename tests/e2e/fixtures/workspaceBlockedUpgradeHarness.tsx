import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { WorkspaceBootstrapGate } from '../../../components/workspace/WorkspaceBootstrapGate';
import { createBlankProject } from '../../../services/presets';
import {
  createLocalWorkspaceStoreForTesting,
  type LocalWorkspaceEnvironment,
} from '../../../services/localWorkspace/LocalWorkspaceStore';
import type {
  LocalWorkspaceStore,
  WorkspaceBootstrapResult,
} from '../../../services/localWorkspace/contracts';

let mountedRoot: Root | undefined;

const gate = (store: LocalWorkspaceStore) => (
  <WorkspaceBootstrapGate
    store={store}
    renderEditor={() => <div data-testid="blocked-upgrade-editor">Editor mounted</div>}
  />
);

export const mountBlockedUpgradeGate = async (
  requestedIndexedDbVersion: number,
): Promise<{ result: WorkspaceBootstrapResult; gateBootstrapCalls: number }> => {
  mountedRoot?.unmount();
  const host = document.createElement('div');
  host.dataset.testid = 'blocked-upgrade-gate';
  document.body.append(host);
  const environment: LocalWorkspaceEnvironment = {
    indexedDB: window.indexedDB,
    legacyStorage: {
      getItem: key => window.localStorage.getItem(key),
    },
    addStorageListener(listener) {
      window.addEventListener('storage', listener);
      return () => window.removeEventListener('storage', listener);
    },
    crypto: globalThis.crypto,
    now: () => new Date().toISOString(),
    randomUUID: () => globalThis.crypto.randomUUID(),
    createBlankProject,
  };
  const store = createLocalWorkspaceStoreForTesting(
    environment,
    requestedIndexedDbVersion,
  );
  let gateBootstrapCalls = 0;
  let gateOperation: Promise<WorkspaceBootstrapResult> | undefined;
  const productionBootstrap = store.bootstrap.bind(store);
  store.bootstrap = observer => {
    const fromGate = Boolean(observer?.onPhase && observer.onAuthorityLost);
    if (fromGate) {
      gateBootstrapCalls += 1;
    }
    const operation = productionBootstrap(observer);
    if (fromGate) gateOperation = operation;
    return operation;
  };
  mountedRoot = createRoot(host);
  const reactGlobal = globalThis as typeof globalThis & {
    IS_REACT_ACT_ENVIRONMENT?: boolean;
  };
  reactGlobal.IS_REACT_ACT_ENVIRONMENT = true;
  await act(async () => {
    mountedRoot?.render(gate(store));
  });
  if (!gateOperation) throw new Error('WorkspaceBootstrapGate did not start bootstrap.');
  let result: WorkspaceBootstrapResult | undefined;
  await act(async () => {
    result = await gateOperation;
  });
  if (!result) throw new Error('WorkspaceBootstrapGate bootstrap did not resolve.');
  return { result, gateBootstrapCalls };
};
