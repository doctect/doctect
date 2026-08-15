// @vitest-environment node
import { webcrypto } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  canonicalStringify,
  digestLegacySnapshot,
  digestWorkspaceContent,
  sha256Hex,
} from '../../../services/localWorkspace/canonical';
import {
  LEGACY_DOCUMENT_KEYS,
  LEGACY_KEYS,
  legacySnapshot,
  workspaceSnapshot,
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

describe('canonicalStringify', () => {
  it('sorts object keys recursively but preserves array order', () => {
    expect(canonicalStringify({ z: 1, a: { y: 2, x: 3 }, rows: ['b', 'a'] }))
      .toBe('{"a":{"x":3,"y":2},"rows":["b","a"],"z":1}');
  });

  it('pins Unicode, emoji, and lone-surrogate encoding', () => {
    expect(canonicalStringify({ text: 'Café ☕', lone: '\ud800', emoji: '😀' }))
      .toBe('{"emoji":"😀","lone":"\\ud800","text":"Café ☕"}');
  });

  it('normalizes negative zero in objects and arrays', () => {
    expect(canonicalStringify({ object: -0, array: [-0] }))
      .toBe('{"array":[0],"object":0}');
  });

  it.each([
    ['undefined', undefined],
    ['NaN', Number.NaN],
    ['Infinity', Infinity],
    ['negative Infinity', -Infinity],
    ['BigInt', 1n],
    ['function', () => 1],
    ['symbol', Symbol('value')],
  ])('rejects non-JSON value %s', (_label, value) => {
    expect(() => canonicalStringify({ value } as never)).toThrow(/JSON-compatible/);
  });

  it('rejects sparse arrays and non-index array properties', () => {
    const sparse = Array(2);
    sparse[1] = 'present';
    const extended = ['value'] as string[] & { extra?: string };
    extended.extra = 'hidden from JSON array output';

    expect(() => canonicalStringify(sparse)).toThrow(/JSON-compatible/);
    expect(() => canonicalStringify(extended)).toThrow(/JSON-compatible/);
  });

  it('rejects accessors without invoking them', () => {
    let calls = 0;
    const value = Object.defineProperty({}, 'secret', {
      enumerable: true,
      get: () => {
        calls += 1;
        return 'secret';
      },
    });

    expect(() => canonicalStringify(value)).toThrow(/JSON-compatible/);
    expect(calls).toBe(0);
  });

  it('rejects custom prototypes, symbol keys, and cycles', () => {
    const custom = Object.create({ inherited: true });
    custom.value = 1;
    const symbolKeyed = { visible: true, [Symbol('hidden')]: true };
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;

    expect(() => canonicalStringify(custom)).toThrow(/JSON-compatible/);
    expect(() => canonicalStringify(symbolKeyed)).toThrow(/JSON-compatible/);
    expect(() => canonicalStringify(cyclic)).toThrow(/JSON-compatible/);
  });

  it('caps nesting at 512 containers', () => {
    const root: Record<string, unknown> = {};
    let cursor = root;
    for (let depth = 0; depth < 513; depth += 1) {
      const child: Record<string, unknown> = {};
      cursor.child = child;
      cursor = child;
    }
    expect(() => canonicalStringify(root)).toThrow(/JSON-compatible.*nesting/i);
  });
});

describe('canonical digests', () => {
  it('pins legacy document key order', () => {
    expect(LEGACY_DOCUMENT_KEYS).toEqual([
      LEGACY_KEYS.projects,
      LEGACY_KEYS.activeProject,
      LEGACY_KEYS.customPresets,
      LEGACY_KEYS.pendingImport,
    ]);
  });

  it('matches the SHA-256 golden vector', async () => {
    await expect(sha256Hex('abc')).resolves.toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });

  it('distinguishes absent and present-empty legacy keys', async () => {
    const absent = legacySnapshot({});
    const empty = legacySnapshot({ [LEGACY_KEYS.projects]: '' });
    expect(await digestLegacySnapshot(absent)).not.toBe(await digestLegacySnapshot(empty));
  });

  it('includes exact raw Unicode text and fixed legacy-key order', async () => {
    const source = legacySnapshot({
      [LEGACY_KEYS.pendingImport]: '{"name":"😀"}',
      [LEGACY_KEYS.projects]: ' [{"name":"Café ☕"}]\r\n',
    });
    const reorderedObject = {
      [LEGACY_KEYS.pendingImport]: source[LEGACY_KEYS.pendingImport],
      [LEGACY_KEYS.customPresets]: source[LEGACY_KEYS.customPresets],
      [LEGACY_KEYS.activeProject]: source[LEGACY_KEYS.activeProject],
      [LEGACY_KEYS.projects]: source[LEGACY_KEYS.projects],
    };

    expect(await digestLegacySnapshot(source)).toBe(await digestLegacySnapshot(reorderedObject));
    expect(await digestLegacySnapshot(source)).not.toBe(await digestLegacySnapshot(
      legacySnapshot({
        [LEGACY_KEYS.pendingImport]: '{"name":"😀"}',
        [LEGACY_KEYS.projects]: ' [{"name":"Cafe ☕"}]\r\n',
      }),
    ));
  });

  it('includes order, cloud metadata, UI revisions, presets, and imports in target digest', async () => {
    const base = workspaceSnapshot();
    const baseDigest = await digestWorkspaceContent(base);
    const variants = [
      { ...base, projects: [...base.projects].reverse() },
      {
        ...base,
        projects: [{ ...base.projects[0], revision: 9 }, ...base.projects.slice(1)],
      },
      {
        ...base,
        projects: [{
          ...base.projects[0],
          cloud: { ...base.projects[0].cloud!, lastSyncedCommitId: 'different' },
        }, ...base.projects.slice(1)],
      },
      { ...base, activeProjectId: 'project-b' },
      { ...base, customPresets: [{ ...base.customPresets[0], title: 'Different' }] },
      { ...base, pendingImports: [{ ...base.pendingImports[0], name: 'Different' }] },
    ];

    for (const variant of variants) {
      expect(await digestWorkspaceContent(variant)).not.toBe(baseDigest);
    }
  });

  it('keeps nested document timestamps but excludes pending-import creation time', async () => {
    const base = workspaceSnapshot();
    const changedImportTime = {
      ...base,
      pendingImports: [{ ...base.pendingImports[0], createdAt: '2030-01-01T00:00:00.000Z' }],
    };
    const changedGeneratorTime = workspaceSnapshot();
    changedGeneratorTime.projects[0].initialState.generator!.generatedAt = '2030-01-01T00:00:00.000Z';

    await expect(digestWorkspaceContent(changedImportTime))
      .resolves.toBe(await digestWorkspaceContent(base));
    await expect(digestWorkspaceContent(changedGeneratorTime))
      .resolves.not.toBe(await digestWorkspaceContent(base));
  });
});
