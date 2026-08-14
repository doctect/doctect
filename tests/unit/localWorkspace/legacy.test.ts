// @vitest-environment node
import { webcrypto } from 'node:crypto';
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import {
  captureLegacySnapshot,
  captureStableLegacySnapshot,
  monitorLegacyKeys,
} from '../../../services/localWorkspace/legacy';
import { prepareInitialCopy } from '../../../services/localWorkspace/migration';
import { LEGACY_DOCUMENT_KEYS } from '../../../services/localWorkspace/legacyTypes';
import {
  LEGACY_KEYS,
  changingStorage,
  memoryStorage,
  secondProject,
  validLegacyValues,
} from '../../helpers/localWorkspaceFixtures';

const originalCrypto = Object.getOwnPropertyDescriptor(globalThis, 'crypto');

beforeAll(() => Object.defineProperty(globalThis, 'crypto', {
  configurable: true,
  value: webcrypto,
}));

afterAll(() => {
  if (originalCrypto) Object.defineProperty(globalThis, 'crypto', originalCrypto);
  else Reflect.deleteProperty(globalThis, 'crypto');
});

beforeEach(() => vi.spyOn(console, 'log').mockImplementation(() => {}));
afterEach(() => vi.restoreAllMocks());

describe('legacy source capture', () => {
  it('captures key presence separately from exact raw text', () => {
    const storage = memoryStorage({
      [LEGACY_KEYS.projects]: ' [{"name":"Café ☕"}]\r\n',
      [LEGACY_KEYS.activeProject]: '',
    });

    const snapshot = captureLegacySnapshot(storage);

    expect(snapshot[LEGACY_KEYS.projects]).toEqual({
      present: true,
      raw: ' [{"name":"Café ☕"}]\r\n',
    });
    expect(snapshot[LEGACY_KEYS.activeProject]).toEqual({ present: true, raw: '' });
    expect(snapshot[LEGACY_KEYS.customPresets]).toEqual({ present: false, raw: null });
  });

  it('reads every legacy key exactly once in constant order without writing', () => {
    const storage = memoryStorage(validLegacyValues());

    captureLegacySnapshot(storage);

    expect(storage.reads).toEqual(LEGACY_DOCUMENT_KEYS);
    expect(storage.mutations).toEqual([]);
  });

  it('returns preparation output only after a matching second exact capture', async () => {
    const storage = memoryStorage(validLegacyValues());
    const prepare = vi.fn(async source => ({ source, prepared: true as const }));

    const result = await captureStableLegacySnapshot(storage, prepare);

    expect(result.prepared).toBe(true);
    expect(prepare).toHaveBeenCalledOnce();
    expect(storage.reads).toEqual([
      ...LEGACY_DOCUMENT_KEYS,
      ...LEGACY_DOCUMENT_KEYS,
      ...LEGACY_DOCUMENT_KEYS,
    ]);
    expect(storage.mutations).toEqual([]);
  });

  it('stops when source changes during preparation', async () => {
    const storage = changingStorage(validLegacyValues(), {
      afterRead: 4,
      key: LEGACY_KEYS.projects,
      value: JSON.stringify([secondProject()]),
    });

    await expect(captureStableLegacySnapshot(storage, prepareInitialCopy))
      .rejects.toMatchObject({ category: 'legacy-changing' });
    expect(storage.mutations).toEqual([]);
  });
});

describe('legacy source monitoring', () => {
  it('reports only exact legacy keys and storage-clear events and unsubscribes', () => {
    let listener: ((event: StorageEvent) => void) | undefined;
    const unsubscribe = vi.fn();
    const onChange = vi.fn();
    const stop = monitorLegacyKeys(next => {
      listener = next;
      return unsubscribe;
    }, onChange);

    listener?.({ key: 'hype_projects_backup' } as StorageEvent);
    listener?.({ key: LEGACY_KEYS.projects } as StorageEvent);
    listener?.({ key: LEGACY_KEYS.pendingImport } as StorageEvent);
    listener?.({ key: null } as StorageEvent);

    expect(onChange.mock.calls.map(([event]) => event.key)).toEqual([
      LEGACY_KEYS.projects,
      LEGACY_KEYS.pendingImport,
      null,
    ]);
    stop();
    expect(unsubscribe).toHaveBeenCalledOnce();
  });
});
