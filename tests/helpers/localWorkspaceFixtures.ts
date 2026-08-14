import type { AppState, TemplateElement } from '../../types';
import type {
  WorkspaceSnapshot,
} from '../../services/localWorkspace/contracts';
import {
  LEGACY_DOCUMENT_KEYS,
  LEGACY_KEYS,
  type LegacyDocumentKey,
  type LegacySnapshot,
} from '../../services/localWorkspace/legacyTypes';

export { LEGACY_KEYS };

type LegacyOverride = string | null | LegacySnapshot[LegacyDocumentKey];

const clone = <T>(value: T): T => structuredClone(value);

const elementForVersion = (version: number): TemplateElement => ({
  id: 'title',
  type: 'text',
  x: 12,
  y: 24,
  w: 240,
  h: 48,
  rotation: 0,
  fill: '#ffffff',
  stroke: '#111111',
  strokeWidth: 1,
  opacity: 1,
  text: 'Café ☕ 😀',
  ...(version >= 1 ? { autoWidth: false } : {}),
  ...(version >= 8 ? { layerId: 'content' } : {}),
  ...(version >= 10 ? { textOverflow: 'visible' as const, textWrap: true } : {}),
  ...(version >= 11
    ? { textPadding: { top: 0, right: 1.25, bottom: 2, left: 3 } }
    : {}),
});

const templateForVersion = (version: number) => ({
  id: 'page',
  name: 'Page',
  width: 500,
  height: 700,
  elements: [elementForVersion(version)],
  ...(version >= 8
    ? {
        layers: [{
          id: 'content',
          name: 'Content',
          order: 0,
          visible: true,
          locked: false,
        }],
      }
    : {}),
});

export const legacySnapshot = (
  overrides: Partial<Record<LegacyDocumentKey, LegacyOverride>> = {},
): LegacySnapshot => {
  const snapshot = Object.fromEntries(LEGACY_DOCUMENT_KEYS.map(key => {
    if (!Object.hasOwn(overrides, key) || overrides[key] === undefined) {
      return [key, { present: false, raw: null }];
    }
    const override = overrides[key];
    if (override !== null && typeof override === 'object') {
      return [key, clone(override)];
    }
    return [key, { present: true, raw: override }];
  })) as LegacySnapshot;
  return clone(snapshot);
};

export const historicalState = (version: number): AppState => {
  if (!Number.isInteger(version) || version < 0 || version > 11) {
    throw new Error(`Unsupported fixture schema version: ${version}`);
  }

  const common = {
    nodes: {
      root: {
        id: 'root',
        parentId: null,
        type: 'page',
        title: 'Racine 根',
        data: { label: 'Café ☕' },
        children: [],
      },
    },
    rootId: 'root',
    viewMode: 'hierarchy' as const,
    selectedNodeId: 'root',
    selectedNodeIds: ['root'],
    selectedTemplateId: 'page',
    selectedTemplateIds: ['page'],
    selectedElementIds: [],
    scale: 0.8,
    tool: 'select' as const,
    showJsonModal: false,
    sidebarWidth: 288,
    propertiesPanelWidth: 320,
    snapToGrid: false,
    showGrid: false,
    showNodeSelector: false,
    nodeSelectorMode: 'grid_source' as const,
    editingElementId: null,
    clipboard: [],
  };
  const template = templateForVersion(version);
  const state = version < 4
    ? { ...common, templates: { page: template } }
    : {
        ...common,
        variants: {
          default: {
            id: 'default',
            name: 'Default',
            templates: { page: template },
          },
        },
        activeVariantId: 'default',
      };

  return clone({
    ...state,
    ...(version > 0 ? { schemaVersion: version } : {}),
    ...(version >= 9
      ? {
          generator: {
            formatVersion: 1 as const,
            templateScript: 'const café = "☕";\nreturn {};',
            hierarchyScript: 'return { rootId: "根" };\n',
            generatedAt: '2026-08-14T12:34:56.000Z',
          },
        }
      : {}),
  } as unknown as AppState);
};

export const currentState = (): AppState => clone(historicalState(11));

export const workspaceSnapshot = (
  overrides: Partial<WorkspaceSnapshot> = {},
): WorkspaceSnapshot => {
  const firstState = currentState();
  firstState.scale = 1.25;
  const secondState = currentState();
  secondState.nodes.root.title = 'Second project';

  const snapshot: WorkspaceSnapshot = {
    projects: [
      {
        id: 'project-a',
        name: 'Café project ☕',
        initialState: firstState,
        cloud: { projectId: 'cloud-a', lastSyncedCommitId: 'commit-a' },
        revision: 4,
        retainedWrapperField: { source: 'legacy' },
      },
      {
        id: 'project-b',
        name: '',
        initialState: secondState,
      },
    ],
    activeProjectId: 'project-a',
    customPresets: [{
      id: 'preset-a',
      title: 'Résumé',
      desc: 'Saved layout',
      color: 'text-amber-500',
      isCustom: true,
      initialState: currentState(),
      retainedPresetField: ['one', 'two'],
    }],
    pendingImports: [{
      id: 'import-a',
      targetProjectId: 'project-imported',
      name: 'Imported 😀',
      state: currentState(),
      cloud: { projectId: 'cloud-import', lastSyncedCommitId: 'commit-import' },
      createdAt: '2026-08-14T13:00:00.000Z',
      warnings: [],
    }],
  };

  return clone({ ...snapshot, ...overrides });
};

export class MemoryStorage implements Storage {
  readonly reads: string[] = [];
  readonly mutations: Array<{ operation: 'set' | 'remove' | 'clear'; key?: string }> = [];

  private readonly values = new Map<string, string>();

  constructor(
    initial: Record<string, string> = {},
    private readonly afterRead?: (readCount: number, storage: MemoryStorage) => void,
  ) {
    for (const [key, value] of Object.entries(initial)) this.values.set(key, value);
  }

  get length(): number {
    return this.values.size;
  }

  clear(): void {
    this.mutations.push({ operation: 'clear' });
    this.values.clear();
  }

  getItem(key: string): string | null {
    const value = this.values.get(key) ?? null;
    this.reads.push(key);
    this.afterRead?.(this.reads.length, this);
    return value;
  }

  key(index: number): string | null {
    return [...this.values.keys()][index] ?? null;
  }

  removeItem(key: string): void {
    this.mutations.push({ operation: 'remove', key });
    this.values.delete(key);
  }

  setItem(key: string, value: string): void {
    this.mutations.push({ operation: 'set', key });
    this.values.set(key, value);
  }

  seed(key: string, value: string | null): void {
    if (value === null) this.values.delete(key);
    else this.values.set(key, value);
  }
}

export const memoryStorage = (initial: Record<string, string> = {}): MemoryStorage =>
  new MemoryStorage(initial);

export const changingStorage = (
  initial: Record<string, string>,
  change: {
    afterRead: number;
    key: string;
    value: string | null;
  },
): MemoryStorage => new MemoryStorage(initial, (readCount, storage) => {
  if (readCount === change.afterRead) storage.seed(change.key, change.value);
});

export const legacyProject = (
  id = 'project-a',
  version = 11,
  overrides: Record<string, unknown> = {},
) => clone({
  id,
  name: 'Café project ☕',
  initialState: historicalState(version),
  cloud: { projectId: `cloud-${id}`, lastSyncedCommitId: `commit-${id}` },
  revision: 4,
  retainedWrapperField: { source: 'legacy' },
  ...overrides,
});

export const secondProject = (version = 11) => {
  const initialState = historicalState(version);
  initialState.nodes.root.title = 'Second project 😀';
  return legacyProject('project-b', version, {
    name: '',
    initialState,
    cloud: undefined,
    revision: undefined,
  });
};

export const legacyCustomPreset = (
  id = 'preset-a',
  version = 11,
  overrides: Record<string, unknown> = {},
) => clone({
  id,
  title: 'Résumé',
  desc: 'Saved layout 😀',
  color: 'text-amber-500',
  isCustom: true,
  initialState: historicalState(version),
  retainedPresetField: ['one', 'two'],
  ...overrides,
});

export const legacyPendingImport = (
  version = 11,
  overrides: Record<string, unknown> = {},
) => clone({
  name: 'Imported 😀',
  state: historicalState(version),
  cloud: { projectId: 'cloud-import', lastSyncedCommitId: 'commit-import' },
  ...overrides,
});

export const validLegacyValues = (
  overrides: Partial<Record<LegacyDocumentKey, string>> = {},
): Record<LegacyDocumentKey, string> => ({
  [LEGACY_KEYS.projects]: JSON.stringify([legacyProject()]),
  [LEGACY_KEYS.activeProject]: 'project-a',
  [LEGACY_KEYS.customPresets]: JSON.stringify([legacyCustomPreset()]),
  [LEGACY_KEYS.pendingImport]: JSON.stringify(legacyPendingImport()),
  ...overrides,
});

export const deterministicEnvironment = (overrides: Partial<{
  crypto: Crypto;
  now: () => string;
  randomUUID: () => string;
  createBlankProject: () => AppState;
}> = {}) => ({
  crypto: globalThis.crypto,
  now: () => '2026-08-14T15:00:00.000Z',
  randomUUID: () => 'fixture-uuid',
  createBlankProject: currentState,
  ...overrides,
});
