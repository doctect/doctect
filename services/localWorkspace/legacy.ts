import { digestLegacySnapshot } from './canonical';
import {
  LEGACY_DOCUMENT_KEYS,
  type LegacyDocumentKey,
  type LegacySnapshot,
} from './legacyTypes';

export type LegacyStorage = Pick<Storage, 'getItem'>;

export type LegacyStorageListener = (
  listener: (event: StorageEvent) => void,
) => () => void;

export class LegacyCaptureError extends Error {
  readonly kind = 'legacy-changing' as const;
  readonly category = 'legacy-changing' as const;
  readonly canRetry = true;

  constructor(message: string) {
    super(message);
    this.name = 'LegacyCaptureError';
  }
}

export function captureLegacySnapshot(storage: LegacyStorage): LegacySnapshot {
  return Object.fromEntries(LEGACY_DOCUMENT_KEYS.map(key => {
    const raw = storage.getItem(key);
    return [key, { present: raw !== null, raw }];
  })) as LegacySnapshot;
}

export async function captureStableLegacySnapshot<T>(
  storage: LegacyStorage,
  prepare: (source: LegacySnapshot) => T | Promise<T>,
  subtle?: SubtleCrypto,
): Promise<T> {
  const source = captureLegacySnapshot(storage);
  const sourceDigest = await digestLegacySnapshot(source, subtle);
  const prepared = await prepare(source);
  const current = captureLegacySnapshot(storage);
  const currentDigest = await digestLegacySnapshot(current, subtle);

  if (currentDigest !== sourceDigest || LEGACY_DOCUMENT_KEYS.some(key =>
    current[key].present !== source[key].present || current[key].raw !== source[key].raw)) {
    throw new LegacyCaptureError('Legacy storage changed during migration preparation.');
  }
  return prepared;
}

export async function captureStableLegacySnapshotWithDigest(
  storage: LegacyStorage,
  subtle?: SubtleCrypto,
): Promise<{ snapshot: LegacySnapshot; digest: string }> {
  return captureStableLegacySnapshot(storage, async source => ({
    snapshot: structuredClone(source),
    digest: await digestLegacySnapshot(source, subtle),
  }), subtle);
}

export function monitorLegacyKeys(
  addStorageListener: LegacyStorageListener,
  onChange: (event: StorageEvent) => void,
): () => void {
  const legacyKeys = new Set<LegacyDocumentKey>(LEGACY_DOCUMENT_KEYS);
  return addStorageListener(event => {
    if (event.key === null || legacyKeys.has(event.key as LegacyDocumentKey)) onChange(event);
  });
}
