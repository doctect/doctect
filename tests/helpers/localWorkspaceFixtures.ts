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
