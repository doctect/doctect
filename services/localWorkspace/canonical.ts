import type { WorkspaceSnapshot } from './contracts';
import {
  LEGACY_DOCUMENT_KEYS,
  type LegacySnapshot,
} from './legacyTypes';

const MAX_CANONICAL_NESTING = 512;

const rejectJsonValue = (reason: string): never => {
  throw new TypeError(`Value must be JSON-compatible: ${reason}`);
};

const serialize = (
  value: unknown,
  nesting: number,
  ancestors: Set<object>,
): string => {
  if (value === null) return 'null';
  if (typeof value === 'string' || typeof value === 'boolean') {
    return JSON.stringify(value);
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) rejectJsonValue('numbers must be finite');
    return Object.is(value, -0) ? '0' : JSON.stringify(value);
  }
  if (typeof value !== 'object') {
    rejectJsonValue(`${typeof value} values are not supported`);
  }
  if (nesting > MAX_CANONICAL_NESTING) {
    rejectJsonValue(`nesting exceeds ${MAX_CANONICAL_NESTING}`);
  }
  const objectValue = value as object;
  if (ancestors.has(objectValue)) rejectJsonValue('cycles are not supported');

  const prototype = Object.getPrototypeOf(objectValue);
  const isArray = Array.isArray(value);
  if (isArray ? prototype !== Array.prototype : prototype !== Object.prototype) {
    rejectJsonValue('custom prototypes are not supported');
  }

  const keys = Reflect.ownKeys(objectValue);
  if (keys.some(key => typeof key === 'symbol')) {
    rejectJsonValue('symbol keys are not supported');
  }

  ancestors.add(objectValue);
  try {
    if (isArray) {
      const array = value as unknown[];
      const names = keys as string[];
      if (names.length !== array.length + 1 || !names.includes('length')) {
        rejectJsonValue('arrays may contain only dense indexed values');
      }
      const serialized: string[] = [];
      for (let index = 0; index < array.length; index += 1) {
        const key = String(index);
        const descriptor = Object.getOwnPropertyDescriptor(array, key);
        if (!descriptor || !('value' in descriptor)) {
          rejectJsonValue('sparse arrays and accessors are not supported');
        }
        serialized.push(serialize(descriptor.value, nesting + 1, ancestors));
      }
      return `[${serialized.join(',')}]`;
    }

    const descriptors = Object.getOwnPropertyDescriptors(objectValue);
    const names = (keys as string[]).sort();
    const serialized = names.map(key => {
      const descriptor = descriptors[key];
      if (!descriptor || !('value' in descriptor)) {
        rejectJsonValue('getters and setters are not supported');
      }
      if (!descriptor.enumerable) {
        rejectJsonValue('non-enumerable properties are not supported');
      }
      return `${JSON.stringify(key)}:${serialize(descriptor.value, nesting + 1, ancestors)}`;
    });
    return `{${serialized.join(',')}}`;
  } finally {
    ancestors.delete(objectValue);
  }
};

export function canonicalStringify(value: unknown): string {
  return serialize(value, 0, new Set());
}

export async function sha256Hex(
  value: string,
  subtle: SubtleCrypto = globalThis.crypto.subtle,
): Promise<string> {
  const digest = await subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

export async function digestLegacySnapshot(
  snapshot: LegacySnapshot,
  subtle?: SubtleCrypto,
): Promise<string> {
  const envelope = {
    format: 'doctect-legacy-source',
    version: 1,
    entries: LEGACY_DOCUMENT_KEYS.map(key => ({
      key,
      present: snapshot[key].present,
      raw: snapshot[key].present ? snapshot[key].raw : null,
    })),
  };
  return sha256Hex(canonicalStringify(envelope), subtle);
}

export async function digestWorkspaceContent(
  snapshot: WorkspaceSnapshot,
  subtle?: SubtleCrypto,
): Promise<string> {
  const envelope = {
    format: 'doctect-indexeddb-workspace',
    version: 1,
    projectOrder: snapshot.projects.map(project => project.id),
    projects: snapshot.projects,
    activeProjectId: snapshot.activeProjectId,
    customPresets: snapshot.customPresets,
    pendingImports: snapshot.pendingImports.map(({ createdAt: _createdAt, ...pending }) => pending),
  };
  return sha256Hex(canonicalStringify(envelope), subtle);
}
