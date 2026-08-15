import React, { StrictMode } from 'react';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import {
  createMemoryRouter,
  RouterProvider,
} from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EditorPage } from '../../pages/EditorPage';
import { createBlankProject } from '../../services/presets';
import {
  WorkspaceStoreError,
  type LocalWorkspaceStore,
  type WorkspaceCommand,
  type WorkspaceCustomPreset,
  type WorkspaceProject,
  type WorkspaceSnapshot,
} from '../../services/localWorkspace/index';
import type { AppState } from '../../types';
import { LEGACY_KEYS } from '../helpers/localWorkspaceFixtures';

const trackEvent = vi.hoisted(() => vi.fn());
const downloadJson = vi.hoisted(() => vi.fn());
const generatedResult = vi.hoisted(() => ({ current: undefined as boolean | undefined }));
const presetSaveResult = vi.hoisted(() => ({ current: undefined as boolean | undefined }));
const cloudResults = vi.hoisted(() => ({
  link: undefined as boolean | undefined,
  restore: undefined as boolean | undefined,
}));

const generatedProject = {
  schemaVersion: 11 as const,
  rootId: 'generated-root',
  activeVariantId: 'generated-variant',
  nodes: {
    'generated-root': {
      id: 'generated-root',
      parentId: null,
      type: 'generated-page',
      title: 'Generated',
      data: {},
      children: [],
    },
  },
  variants: {
    'generated-variant': {
      id: 'generated-variant',
      name: 'Generated Variant',
      templates: {
        'generated-page': {
          id: 'generated-page',
          name: 'Generated Page',
          width: 500,
          height: 700,
          layers: [],
          elements: [],
        },
      },
    },
  },
};

const generatorSource = {
  formatVersion: 1 as const,
  templateScript: 'return generatedTemplates;',
  hierarchyScript: 'return generatedHierarchy;',
};

vi.mock('../../components/ProjectEditor', () => ({
  ProjectEditor: (props: any) => (
    <section data-testid={`editor-${props.projectId}`} data-active={String(props.isActive)}>
      <h2>{props.projectName}</h2>
      <output data-testid={`state-${props.projectId}`}>{JSON.stringify(props.initialState)}</output>
      <button
        type="button"
        onClick={() => props.onStateChange({ ...props.initialState, scale: 9 })}
      >
        Edit {props.projectName}
      </button>
      <button
        type="button"
        onClick={() => props.onNameChange(`${props.projectName} renamed`)}
      >
        Rename {props.projectName}
      </button>
      <button
        type="button"
        onClick={() => {
          props.onNameChange(`${props.projectName} renamed`);
          props.onStateChange({ ...props.initialState, scale: 17 });
        }}
      >
        Rename and edit {props.projectName}
      </button>
      <button
        type="button"
        onClick={async () => {
          generatedResult.current = await props.onCreateGeneratedProject(
            'Generated Copy',
            generatedProject,
            generatorSource,
          );
        }}
      >
        Generate from {props.projectName}
      </button>
      <button
        type="button"
        onClick={async () => {
          if (typeof props.onSaveCustomPreset !== 'function') {
            presetSaveResult.current = false;
            return;
          }
          presetSaveResult.current = await props.onSaveCustomPreset(
            `Saved ${props.projectName}`,
            'Reusable project layout',
            {
              ...props.initialState,
              selectedElementIds: [],
              selectedNodeId: props.initialState.rootId,
              clipboard: [],
            },
          );
        }}
      >
        Save {props.projectName} as preset
      </button>
    </section>
  ),
}));

vi.mock('../../components/TabBar', () => ({
  TabBar: ({ projects, activeProjectId, onSelect, onClose, onNew }: any) => (
    <nav aria-label="Projects">
      {projects.map((project: WorkspaceProject) => (
        <span key={project.id}>
          <button type="button" onClick={() => onSelect(project.id)}>
            Open {project.name}
          </button>
          <button type="button" onClick={() => onClose(project.id)}>
            Close {project.name}
          </button>
          {project.id === activeProjectId && <span>Active {project.name}</span>}
        </span>
      ))}
      <button type="button" onClick={onNew}>New project</button>
    </nav>
  ),
}));

vi.mock('../../components/NewProjectModal', () => ({
  NewProjectModal: ({
    isOpen,
    customPresets = [],
    busy = false,
    error,
    onClose,
    onSelectPreset,
    onDeleteCustomPreset,
  }: any) => isOpen ? (
    <div role="dialog" aria-label="New project" aria-busy={busy || undefined}>
      {error && <div role="alert">{error}</div>}
      <output data-testid="custom-preset-order">
        {customPresets.map((preset: WorkspaceCustomPreset) => preset.title).join('|')}
      </output>
      <button type="button" disabled={busy} onClick={() => onSelectPreset('blank')}>Create blank</button>
      {customPresets.map((preset: WorkspaceCustomPreset) => (
        <React.Fragment key={preset.id}>
          <button type="button" disabled={busy} onClick={() => onSelectPreset(preset.id)}>
            Create {preset.title}
          </button>
          <button type="button" disabled={busy} onClick={() => onDeleteCustomPreset(preset.id)}>
            Delete {preset.title}
          </button>
        </React.Fragment>
      ))}
      <button type="button" disabled={busy} onClick={() => onSelectPreset('missing-preset')}>Create missing preset</button>
      <button type="button" disabled={busy} onClick={onClose}>Cancel new project</button>
    </div>
  ) : null,
}));

vi.mock('../../components/CloseProjectConfirmModal', () => ({
  CloseProjectConfirmModal: (props: any) => props.isOpen ? (
    <div role="dialog" aria-label={`Close ${props.projectName}`}>
      <button type="button" onClick={props.onConfirmClose}>Confirm close</button>
      <button type="button" onClick={props.onSaveAndClose}>Download JSON and close</button>
      <button type="button" onClick={props.onClose}>Cancel close</button>
    </div>
  ) : null,
}));

vi.mock('../../components/AccountMenu', () => ({ AccountMenu: () => null }));
vi.mock('../../components/cloud/CloudMenu', () => ({
  CloudMenu: ({ project, onLinkCloud, onRestoreState }: any) => (
    <div>
      <output data-testid={`cloud-${project.id}`}>{JSON.stringify(project.cloud ?? null)}</output>
      <button
        type="button"
        onClick={async () => {
          cloudResults.link = await onLinkCloud({
            projectId: 'cloud-1',
            lastSyncedCommitId: 'commit-1',
          });
        }}
      >
        Link {project.name} to cloud
      </button>
      <button
        type="button"
        onClick={async () => {
          cloudResults.restore = await onRestoreState(
            { ...project.initialState, scale: 13 },
            { projectId: 'cloud-1', lastSyncedCommitId: 'commit-2' },
          );
        }}
      >
        Restore {project.name} from cloud
      </button>
    </div>
  ),
}));
vi.mock('../../services/analytics', () => ({ trackEvent }));
vi.mock('../../services/browserDownload', () => ({ downloadJson, downloadBlob: vi.fn() }));

interface Deferred<T> {
  promise: Promise<T>;
  resolve(value: T): void;
  reject(reason: unknown): void;
}

const deferred = <T,>(): Deferred<T> => {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
};

const project = (id: string, name: string, scale = 1): WorkspaceProject => ({
  id,
  name,
  initialState: { ...createBlankProject(), scale },
});

const customPreset = (id: string, title: string, scale = 1): WorkspaceCustomPreset => ({
  id,
  title,
  desc: `${title} description`,
  isCustom: true,
  initialState: { ...createBlankProject(), scale },
});

const workspace = (
  projects: WorkspaceProject[] = [project('project-a', 'Project A')],
  activeProjectId = projects[0].id,
  customPresets: WorkspaceCustomPreset[] = [],
): WorkspaceSnapshot => ({
  projects,
  activeProjectId,
  customPresets,
  pendingImports: [],
});

const applyCommand = (
  current: WorkspaceSnapshot,
  command: WorkspaceCommand,
): WorkspaceSnapshot => {
  switch (command.type) {
    case 'save-project':
      return {
        ...current,
        projects: current.projects.map(item => (
          item.id === command.project.id ? structuredClone(command.project) : item
        )),
      };
    case 'create-and-activate-project':
      return {
        ...current,
        projects: [...current.projects, structuredClone(command.project)],
        activeProjectId: command.project.id,
      };
    case 'activate-project':
      return { ...current, activeProjectId: command.projectId };
    case 'close-project': {
      const remaining = current.projects.filter(item => item.id !== command.projectId);
      if (command.successor) remaining.push(structuredClone(command.successor));
      return {
        ...current,
        projects: remaining,
        activeProjectId: current.activeProjectId === command.projectId
          ? (command.successor?.id ?? remaining.at(-1)?.id ?? '')
          : current.activeProjectId,
      };
    }
    case 'save-custom-preset': {
      const existingIndex = current.customPresets.findIndex(item => item.id === command.preset.id);
      const customPresets = current.customPresets.map(item => structuredClone(item));
      if (existingIndex === -1) customPresets.push(structuredClone(command.preset));
      else customPresets[existingIndex] = structuredClone(command.preset);
      return { ...current, customPresets };
    }
    case 'delete-custom-preset':
      return {
        ...current,
        customPresets: current.customPresets.filter(item => item.id !== command.presetId),
      };
    default:
      return current;
  }
};

const commandStore = (
  initialWorkspace: WorkspaceSnapshot,
  intercept?: (
    command: WorkspaceCommand,
    next: WorkspaceSnapshot,
  ) => Promise<WorkspaceSnapshot> | WorkspaceSnapshot | undefined,
) => {
  let durable = structuredClone(initialWorkspace);
  const commit = vi.fn(async (command: WorkspaceCommand) => {
    const next = applyCommand(durable, command);
    const intercepted = intercept?.(command, next);
    if (intercepted !== undefined) {
      const result = await intercepted;
      durable = structuredClone(result);
      return structuredClone(result);
    }
    durable = structuredClone(next);
    return structuredClone(next);
  });
  const store: LocalWorkspaceStore = {
    bootstrap: vi.fn(),
    commit,
    exportRecoveryBundle: vi.fn(),
  };
  return {
    store,
    commit,
    getDurable: () => structuredClone(durable),
  };
};

const renderEditor = (
  store: LocalWorkspaceStore,
  initialWorkspace: WorkspaceSnapshot,
  options: { strict?: boolean; initialWarnings?: string[] } = {},
) => {
  const router = createMemoryRouter([
    {
      path: '/app',
      element: (
        <EditorPage
          store={store}
          initialWorkspace={initialWorkspace}
          initialWarnings={options.initialWarnings ?? []}
        />
      ),
    },
    { path: '/', element: <div>Home route</div> },
  ], { initialEntries: ['/app'] });
  const view = render(options.strict ? (
    <StrictMode><RouterProvider router={router} /></StrictMode>
  ) : (
    <RouterProvider router={router} />
  ));
  return { ...view, router };
};

const activeState = (): AppState => {
  const pane = screen.getAllByTestId(/^editor-/).find(item => item.dataset.active === 'true');
  if (!pane) throw new Error('No active project pane.');
  const output = within(pane).getByTestId(/^state-/);
  return JSON.parse(output.textContent || '{}');
};

const projectState = (projectId: string): AppState => {
  const output = screen.getByTestId(`state-${projectId}`);
  return JSON.parse(output.textContent || '{}');
};

describe('EditorPage workspace commands', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    trackEvent.mockReset();
    downloadJson.mockReset();
    generatedResult.current = undefined;
    presetSaveResult.current = undefined;
    cloudResults.link = undefined;
    cloudResults.restore = undefined;
    localStorage.clear();
    vi.spyOn(globalThis.crypto, 'randomUUID').mockReturnValue(
      '00000000-0000-4000-8000-000000000001',
    );
  });

  it('renders a verified snapshot without any persistence command, including StrictMode replay', () => {
    const initial = workspace();
    const { store, commit } = commandStore(initial);

    renderEditor(store, initial, { strict: true });

    expect(screen.getByText('Active Project A')).toBeVisible();
    expect(screen.getByText('Saved locally')).toBeVisible();
    expect(commit).not.toHaveBeenCalled();
    expect(localStorage.getItem(LEGACY_KEYS.projects)).toBeNull();
    expect(localStorage.getItem(LEGACY_KEYS.activeProject)).toBeNull();
  });

  it('creates, activates, and closes projects only from returned durable snapshots', async () => {
    const initial = workspace([
      project('project-a', 'Project A'),
      project('project-b', 'Project B'),
    ]);
    const { store, commit } = commandStore(initial);
    renderEditor(store, initial);

    fireEvent.click(screen.getByRole('button', { name: 'New project' }));
    fireEvent.click(screen.getByRole('button', { name: 'Create blank' }));
    await screen.findByText('Active Blank Project');
    expect(commit).toHaveBeenNthCalledWith(1, {
      type: 'create-and-activate-project',
      project: expect.objectContaining({
        id: 'proj_00000000-0000-4000-8000-000000000001',
        name: 'Blank Project',
      }),
    });

    fireEvent.click(screen.getByRole('button', { name: 'Open Project B' }));
    await screen.findByText('Active Project B');
    expect(commit).toHaveBeenNthCalledWith(2, {
      type: 'activate-project',
      projectId: 'project-b',
    });

    fireEvent.click(screen.getByRole('button', { name: 'Close Project B' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm close' }));
    await waitFor(() => expect(screen.queryByText('Open Project B')).not.toBeInTheDocument());
    expect(commit).toHaveBeenNthCalledWith(3, {
      type: 'close-project',
      projectId: 'project-b',
    });
  });

  it('supplies one fresh blank successor when closing the last project', async () => {
    const initial = workspace();
    const { store, commit } = commandStore(initial);
    renderEditor(store, initial);

    fireEvent.click(screen.getByRole('button', { name: 'Close Project A' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm close' }));

    await screen.findByText('Active Blank Project');
    expect(commit).toHaveBeenCalledWith({
      type: 'close-project',
      projectId: 'project-a',
      successor: expect.objectContaining({
        id: 'proj_00000000-0000-4000-8000-000000000001',
        name: 'Blank Project',
      }),
    });
  });

  it.each(['create', 'activate', 'close'] as const)(
    'preserves editor structure when a %s command fails',
    async operation => {
      const initial = workspace([
        project('project-a', 'Project A'),
        project('project-b', 'Project B'),
      ]);
      const { store } = commandStore(initial, command => {
        const matches = operation === 'create'
          ? command.type === 'create-and-activate-project'
          : operation === 'activate'
            ? command.type === 'activate-project'
            : command.type === 'close-project';
        if (matches) throw new WorkspaceStoreError('Command failed.', 'io');
        return undefined;
      });
      renderEditor(store, initial);

      if (operation === 'create') {
        fireEvent.click(screen.getByRole('button', { name: 'New project' }));
        fireEvent.click(screen.getByRole('button', { name: 'Create blank' }));
      } else if (operation === 'activate') {
        fireEvent.click(screen.getByRole('button', { name: 'Open Project B' }));
      } else {
        fireEvent.click(screen.getByRole('button', { name: 'Close Project A' }));
        fireEvent.click(screen.getByRole('button', { name: 'Confirm close' }));
      }

      expect(await screen.findByRole('alert')).toHaveTextContent('Command failed.');
      expect(screen.getByText('Active Project A')).toBeVisible();
      expect(screen.getByText('Open Project A')).toBeVisible();
      expect(screen.getByText('Open Project B')).toBeVisible();
    },
  );

  it('applies a newer structural success after an older failure', async () => {
    const initial = workspace([
      project('project-a', 'Project A'),
      project('project-b', 'Project B'),
    ]);
    const first = deferred<WorkspaceSnapshot>();
    const second = deferred<WorkspaceSnapshot>();
    let activation = 0;
    const { store } = commandStore(initial, (command, next) => {
      if (command.type !== 'activate-project') return undefined;
      activation += 1;
      return activation === 1 ? first.promise : second.promise;
    });
    renderEditor(store, initial);

    fireEvent.click(screen.getByRole('button', { name: 'Open Project B' }));
    fireEvent.click(screen.getByRole('button', { name: 'Open Project B' }));
    await act(async () => second.resolve({ ...initial, activeProjectId: 'project-b' }));
    await act(async () => {
      first.reject(new WorkspaceStoreError('First command failed.', 'io'));
      await first.promise.catch(() => undefined);
    });

    expect(await screen.findByText('Active Project B')).toBeVisible();
    expect(screen.queryByText('First command failed.')).not.toBeInTheDocument();
  });

  it('applies stale structural shape without replacing a newer saved project', async () => {
    const initial = workspace([
      project('project-a', 'Project A'),
      project('project-b', 'Project B'),
    ]);
    const activation = deferred<WorkspaceSnapshot>();
    const { store, commit } = commandStore(initial, (command, next) => {
      if (command.type === 'activate-project') return activation.promise;
      return next;
    });
    renderEditor(store, initial);

    fireEvent.click(screen.getByRole('button', { name: 'Open Project B' }));
    fireEvent.click(screen.getByRole('button', { name: 'Edit Project A' }));

    await screen.findByText('Saved locally');
    expect(projectState('project-a').scale).toBe(9);
    expect(commit).toHaveBeenNthCalledWith(1, {
      type: 'activate-project',
      projectId: 'project-b',
    });
    expect(commit).toHaveBeenNthCalledWith(2, {
      type: 'save-project',
      project: expect.objectContaining({ initialState: expect.objectContaining({ scale: 9 }) }),
    });

    await act(async () => {
      activation.resolve({
        ...initial,
        projects: [initial.projects[1], initial.projects[0]],
        activeProjectId: 'project-b',
      });
      await activation.promise;
    });

    expect(await screen.findByText('Active Project B')).toBeVisible();
    expect(screen.getAllByRole('button', { name: /^Open / }).map(button => button.textContent)).toEqual([
      'Open Project B',
      'Open Project A',
    ]);
    expect(projectState('project-a').scale).toBe(9);
    expect(screen.getByText('Saved locally')).toBeVisible();
  });

  it('applies an older structural success before reporting a newer failure', async () => {
    const initial = workspace([
      project('project-a', 'Project A'),
      project('project-b', 'Project B'),
    ]);
    const first = deferred<WorkspaceSnapshot>();
    const second = deferred<WorkspaceSnapshot>();
    let activation = 0;
    let firstSettled = false;
    let secondStartedBeforeFirstSettled = false;
    const { store, commit, getDurable } = commandStore(initial, command => {
      if (command.type !== 'activate-project') return undefined;
      activation += 1;
      if (activation === 1) return first.promise;
      secondStartedBeforeFirstSettled = !firstSettled;
      return second.promise;
    });
    renderEditor(store, initial);

    fireEvent.click(screen.getByRole('button', { name: 'Open Project B' }));
    fireEvent.click(screen.getByRole('button', { name: 'Open Project B' }));

    firstSettled = true;
    await act(async () => {
      first.resolve({
        ...initial,
        projects: [initial.projects[1], initial.projects[0]],
        activeProjectId: 'project-b',
      });
      await first.promise;
    });
    await waitFor(() => expect(commit).toHaveBeenCalledTimes(2));
    await act(async () => {
      second.reject(new WorkspaceStoreError('Newer activation failed.', 'io'));
      await second.promise.catch(() => undefined);
    });

    expect(await screen.findByRole('alert')).toHaveTextContent('Newer activation failed.');
    expect(screen.getByText('Active Project B')).toBeVisible();
    expect(screen.getAllByRole('button', { name: /^Open / }).map(button => button.textContent)).toEqual([
      'Open Project B',
      'Open Project A',
    ]);
    expect(getDurable().activeProjectId).toBe('project-b');
    expect(getDurable().projects.map(item => item.id)).toEqual(['project-b', 'project-a']);
    expect(secondStartedBeforeFirstSettled).toBe(false);
  });

  it('rejects a missing custom preset instead of silently creating blank content', async () => {
    const initial = workspace();
    const { store, commit } = commandStore(initial);
    renderEditor(store, initial);

    fireEvent.click(screen.getByRole('button', { name: 'New project' }));
    fireEvent.click(screen.getByRole('button', { name: 'Create missing preset' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'This preset is no longer available. Nothing was created.',
    );
    expect(commit).not.toHaveBeenCalled();
    expect(screen.getAllByTestId(/^editor-/)).toHaveLength(1);
  });

  it('creates a custom preset project from an independent clone after one durable command', async () => {
    const sourcePreset = customPreset('custom-source', 'Saved Source', 4);
    sourcePreset.initialState.nodes[sourcePreset.initialState.rootId].title = 'Saved root';
    const initial = workspace(undefined, undefined, [sourcePreset]);
    const pending = deferred<WorkspaceSnapshot>();
    let durableNext: WorkspaceSnapshot | undefined;
    const { store, commit } = commandStore(initial, (command, next) => {
      if (command.type !== 'create-and-activate-project') return undefined;
      durableNext = next;
      return pending.promise;
    });
    renderEditor(store, initial);

    fireEvent.click(screen.getByRole('button', { name: 'New project' }));
    fireEvent.click(screen.getByRole('button', { name: 'Create Saved Source' }));

    await waitFor(() => expect(commit).toHaveBeenCalledOnce());
    expect(screen.getByRole('dialog', { name: 'New project' })).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByText('Active Project A')).toBeVisible();
    const command = commit.mock.calls[0][0] as WorkspaceCommand;
    expect(command).toEqual({
      type: 'create-and-activate-project',
      project: {
        id: 'proj_00000000-0000-4000-8000-000000000001',
        name: 'Saved Source',
        initialState: expect.objectContaining({ scale: 4 }),
      },
    });
    if (command.type !== 'create-and-activate-project') throw new Error('Unexpected command.');
    expect(command.project.initialState).not.toBe(sourcePreset.initialState);
    expect(command.project.initialState.nodes).not.toBe(sourcePreset.initialState.nodes);
    command.project.initialState.nodes[command.project.initialState.rootId].title = 'Mutated command';
    expect(sourcePreset.initialState.nodes[sourcePreset.initialState.rootId].title).toBe('Saved root');

    await act(async () => {
      pending.resolve(durableNext!);
      await pending.promise;
    });
    expect(await screen.findByText('Active Saved Source')).toBeVisible();
    expect(screen.queryByRole('dialog', { name: 'New project' })).not.toBeInTheDocument();
  });

  it('saves a cloned custom preset with a UUID and applies returned preset order', async () => {
    const existing = customPreset('custom-existing', 'Existing Preset');
    const initial = workspace(undefined, undefined, [existing]);
    const { store, commit } = commandStore(initial);
    renderEditor(store, initial);

    fireEvent.click(screen.getByRole('button', { name: 'Save Project A as preset' }));

    await waitFor(() => expect(presetSaveResult.current).toBe(true));
    expect(commit).toHaveBeenCalledOnce();
    const command = commit.mock.calls[0][0] as WorkspaceCommand;
    expect(command).toEqual({
      type: 'save-custom-preset',
      preset: {
        id: 'custom_00000000-0000-4000-8000-000000000001',
        title: 'Saved Project A',
        desc: 'Reusable project layout',
        isCustom: true,
        initialState: expect.objectContaining({
          selectedElementIds: [],
          selectedNodeId: 'root',
          clipboard: [],
        }),
      },
    });
    if (command.type !== 'save-custom-preset') throw new Error('Unexpected command.');
    expect(command.preset.initialState).not.toBe(initial.projects[0].initialState);
    expect(command.preset.initialState.nodes).not.toBe(initial.projects[0].initialState.nodes);

    fireEvent.click(screen.getByRole('button', { name: 'New project' }));
    expect(screen.getByTestId('custom-preset-order')).toHaveTextContent(
      'Existing Preset|Saved Project A',
    );
  });

  it('retains ordered preset cards until delete commits', async () => {
    const initial = workspace(undefined, undefined, [
      customPreset('custom-a', 'Preset A'),
      customPreset('custom-b', 'Preset B'),
    ]);
    const pending = deferred<WorkspaceSnapshot>();
    let durableNext: WorkspaceSnapshot | undefined;
    const { store, commit } = commandStore(initial, (command, next) => {
      if (command.type !== 'delete-custom-preset') return undefined;
      durableNext = next;
      return pending.promise;
    });
    renderEditor(store, initial);
    fireEvent.click(screen.getByRole('button', { name: 'New project' }));

    fireEvent.click(screen.getByRole('button', { name: 'Delete Preset A' }));

    await waitFor(() => expect(commit).toHaveBeenCalledWith({
      type: 'delete-custom-preset',
      presetId: 'custom-a',
    }));
    expect(screen.getByRole('dialog', { name: 'New project' })).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByTestId('custom-preset-order')).toHaveTextContent('Preset A|Preset B');

    await act(async () => {
      pending.resolve(durableNext!);
      await pending.promise;
    });
    await waitFor(() => expect(screen.getByTestId('custom-preset-order')).toHaveTextContent('Preset B'));
    expect(screen.getByTestId('custom-preset-order')).not.toHaveTextContent('Preset A');
  });

  it('keeps a failed preset delete visible with exact recovery copy', async () => {
    const initial = workspace(undefined, undefined, [customPreset('custom-a', 'Preset A')]);
    const { store } = commandStore(initial, command => {
      if (command.type === 'delete-custom-preset') {
        throw new WorkspaceStoreError('Disk failed.', 'io');
      }
      return undefined;
    });
    renderEditor(store, initial);
    fireEvent.click(screen.getByRole('button', { name: 'New project' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete Preset A' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Preset was not deleted. Nothing was changed.',
    );
    expect(screen.getByTestId('custom-preset-order')).toHaveTextContent('Preset A');
    expect(screen.getByRole('dialog', { name: 'New project' })).not.toHaveAttribute('aria-busy');
  });

  it('keeps failed edits open and downloads JSON from the newest working copy', async () => {
    const initial = workspace();
    const { store } = commandStore(initial, command => {
      if (command.type === 'save-project') {
        throw new WorkspaceStoreError('Quota reached.', 'quota');
      }
      return undefined;
    });
    renderEditor(store, initial);

    fireEvent.click(screen.getByRole('button', { name: 'Edit Project A' }));

    expect(await screen.findByText('Not saved')).toBeVisible();
    const alert = screen.getByRole('alert');
    expect(within(alert).getByRole('button', { name: 'Retry' })).toHaveClass('min-h-11');
    expect(within(alert).getByRole('button', { name: 'Download JSON' })).toHaveClass('min-h-11');
    expect(screen.getByText('Your work remains open in this tab, but local storage failed.')).toBeVisible();
    expect(activeState().scale).toBe(9);
    fireEvent.click(screen.getByRole('button', { name: 'Download JSON' }));
    expect(downloadJson).toHaveBeenCalledWith(
      expect.objectContaining({ scale: 9 }),
      expect.stringMatching(/^Project_A_\d{4}-\d{2}-\d{2}\.json$/),
    );
  });

  it('reports storage conflicts without offering an unsafe retry', async () => {
    const initial = workspace();
    const { store } = commandStore(initial, command => {
      if (command.type === 'save-project') {
        throw new WorkspaceStoreError('Another writer won.', 'conflict');
      }
      return undefined;
    });
    renderEditor(store, initial);

    fireEvent.click(screen.getByRole('button', { name: 'Edit Project A' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Storage conflict');
    expect(alert).toHaveTextContent('Another save changed this project. Your open work was not overwritten.');
    expect(within(alert).queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument();
    const download = within(alert).getByRole('button', { name: 'Download JSON' });
    expect(download).toBeVisible();
    expect(download).toHaveClass('min-h-11');
    expect(activeState().scale).toBe(9);
  });

  it('retries a failed edit with its latest working generation', async () => {
    const initial = workspace();
    let attempts = 0;
    const { store, commit } = commandStore(initial, (command, next) => {
      if (command.type !== 'save-project') return undefined;
      attempts += 1;
      if (attempts === 1) throw new WorkspaceStoreError('Write failed.', 'io');
      return next;
    });
    renderEditor(store, initial);
    fireEvent.click(screen.getByRole('button', { name: 'Edit Project A' }));
    await screen.findByText('Not saved');

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));

    await screen.findByText('Saved locally');
    expect(commit).toHaveBeenLastCalledWith({
      type: 'save-project',
      project: expect.objectContaining({ initialState: expect.objectContaining({ scale: 9 }) }),
    });
  });

  it('composes same-render name and state changes into the latest save', async () => {
    const initial = workspace();
    const { store, commit } = commandStore(initial);
    renderEditor(store, initial);

    fireEvent.click(screen.getByRole('button', { name: 'Rename and edit Project A' }));

    await screen.findByText('Active Project A renamed');
    await waitFor(() => expect(commit).toHaveBeenLastCalledWith({
      type: 'save-project',
      project: expect.objectContaining({
        name: 'Project A renamed',
        initialState: expect.objectContaining({ scale: 17 }),
      }),
    }));
    expect(activeState().scale).toBe(17);
  });

  it('creates generated projects with source metadata and tracks only durable success', async () => {
    const initial = workspace();
    const save = deferred<WorkspaceSnapshot>();
    const { store, commit } = commandStore(initial, (command, next) => (
      command.type === 'create-and-activate-project' ? save.promise : next
    ));
    renderEditor(store, initial);

    fireEvent.click(screen.getByRole('button', { name: 'Generate from Project A' }));

    expect(trackEvent).not.toHaveBeenCalled();
    expect(screen.queryByText('Active Generated Copy')).not.toBeInTheDocument();
    const generatedCommand = commit.mock.calls[0][0] as WorkspaceCommand;
    expect(generatedCommand).toEqual({
      type: 'create-and-activate-project',
      project: expect.objectContaining({
        id: 'proj_00000000-0000-4000-8000-000000000001',
        name: 'Generated Copy',
        revision: 0,
        initialState: expect.objectContaining({
          rootId: 'generated-root',
          generator: expect.objectContaining(generatorSource),
        }),
      }),
    });

    await act(async () => {
      save.resolve(applyCommand(initial, generatedCommand));
      await save.promise;
    });

    expect(await screen.findByText('Active Generated Copy')).toBeVisible();
    expect(generatedResult.current).toBe(true);
    expect(trackEvent).toHaveBeenCalledWith('project_created_from_generator', {
      sourceProjectId: 'project-a',
      nodeCount: 1,
    });
  });

  it('returns false and emits no analytics when generated project persistence fails', async () => {
    const initial = workspace();
    const { store } = commandStore(initial, command => {
      if (command.type === 'create-and-activate-project') {
        throw new WorkspaceStoreError('No space.', 'quota');
      }
      return undefined;
    });
    renderEditor(store, initial);

    fireEvent.click(screen.getByRole('button', { name: 'Generate from Project A' }));

    await waitFor(() => expect(generatedResult.current).toBe(false));
    expect(screen.getAllByTestId(/^editor-/)).toHaveLength(1);
    expect(screen.getByText('Active Project A')).toBeVisible();
    expect(trackEvent).not.toHaveBeenCalled();
  });

  it('persists cloud linkage and restore through one save command each', async () => {
    const initial = workspace();
    const { store, commit } = commandStore(initial);
    renderEditor(store, initial);

    fireEvent.click(screen.getByRole('button', { name: 'Link Project A to cloud' }));
    await waitFor(() => expect(commit).toHaveBeenCalledWith({
      type: 'save-project',
      project: expect.objectContaining({
        cloud: { projectId: 'cloud-1', lastSyncedCommitId: 'commit-1' },
      }),
    }));

    fireEvent.click(screen.getByRole('button', { name: 'Restore Project A from cloud' }));
    await waitFor(() => expect(commit).toHaveBeenLastCalledWith({
      type: 'save-project',
      project: expect.objectContaining({
        revision: 1,
        cloud: { projectId: 'cloud-1', lastSyncedCommitId: 'commit-2' },
        initialState: expect.objectContaining({ scale: 13 }),
      }),
    }));
    await waitFor(() => expect(activeState().scale).toBe(13));
  });

  it('keeps a cloud link and newer editor state when save completions arrive backward', async () => {
    const initial = workspace();
    const editSave = deferred<WorkspaceSnapshot>();
    const linkSave = deferred<WorkspaceSnapshot>();
    const savedProjects: WorkspaceProject[] = [];
    const { store } = commandStore(initial, command => {
      if (command.type !== 'save-project') return undefined;
      savedProjects.push(command.project);
      return savedProjects.length === 1 ? editSave.promise : linkSave.promise;
    });
    renderEditor(store, initial);

    fireEvent.click(screen.getByRole('button', { name: 'Edit Project A' }));
    fireEvent.click(screen.getByRole('button', { name: 'Link Project A to cloud' }));
    await waitFor(() => expect(savedProjects).toHaveLength(2));
    expect(savedProjects[1]).toMatchObject({
      initialState: { scale: 9 },
      cloud: { projectId: 'cloud-1', lastSyncedCommitId: 'commit-1' },
    });

    await act(async () => {
      linkSave.resolve({ ...initial, projects: [savedProjects[1]] });
      await linkSave.promise;
    });
    await waitFor(() => expect(cloudResults.link).toBe(true));
    await act(async () => {
      editSave.resolve({ ...initial, projects: [savedProjects[0]] });
      await editSave.promise;
    });

    expect(activeState().scale).toBe(9);
    expect(screen.getByTestId('cloud-project-a')).toHaveTextContent('commit-1');
    expect(screen.getByText('Saved locally')).toBeVisible();
  });

  it('retains a failed cloud link in the hook working copy for local retry', async () => {
    const initial = workspace();
    let attempts = 0;
    const { store, commit } = commandStore(initial, (command, next) => {
      if (command.type !== 'save-project') return undefined;
      attempts += 1;
      if (attempts === 1) throw new WorkspaceStoreError('Cloud link write failed.', 'io');
      return next;
    });
    renderEditor(store, initial);

    fireEvent.click(screen.getByRole('button', { name: 'Link Project A to cloud' }));

    expect(await screen.findByText('Not saved')).toBeVisible();
    await waitFor(() => expect(cloudResults.link).toBe(false));
    expect(screen.getByTestId('cloud-project-a')).toHaveTextContent('commit-1');
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));

    await screen.findByText('Saved locally');
    expect(commit).toHaveBeenLastCalledWith({
      type: 'save-project',
      project: expect.objectContaining({
        cloud: { projectId: 'cloud-1', lastSyncedCommitId: 'commit-1' },
      }),
    });
  });

  it('keeps a cloud restore when a newer edit supersedes its completion', async () => {
    const initial = workspace();
    const restoreSave = deferred<WorkspaceSnapshot>();
    const editSave = deferred<WorkspaceSnapshot>();
    const savedProjects: WorkspaceProject[] = [];
    const { store } = commandStore(initial, command => {
      if (command.type !== 'save-project') return undefined;
      savedProjects.push(command.project);
      return savedProjects.length === 1 ? restoreSave.promise : editSave.promise;
    });
    renderEditor(store, initial);

    fireEvent.click(screen.getByRole('button', { name: 'Restore Project A from cloud' }));
    fireEvent.click(screen.getByRole('button', { name: 'Edit Project A' }));
    await waitFor(() => expect(savedProjects).toHaveLength(2));
    expect(savedProjects[1]).toMatchObject({
      revision: 1,
      initialState: { scale: 9 },
      cloud: { projectId: 'cloud-1', lastSyncedCommitId: 'commit-2' },
    });

    await act(async () => {
      editSave.resolve({ ...initial, projects: [savedProjects[1]] });
      await editSave.promise;
    });
    await act(async () => {
      restoreSave.resolve({ ...initial, projects: [savedProjects[0]] });
      await restoreSave.promise;
    });

    expect(activeState().scale).toBe(9);
    expect(screen.getByTestId('cloud-project-a')).toHaveTextContent('commit-2');
  });

  it('blocks router and beforeunload navigation while a save is pending', async () => {
    const initial = workspace();
    const save = deferred<WorkspaceSnapshot>();
    const { store } = commandStore(initial, (command, next) => (
      command.type === 'save-project' ? save.promise : next
    ));
    const { router, container } = renderEditor(store, initial);
    const cleanEvent = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(cleanEvent);
    expect(cleanEvent.defaultPrevented).toBe(false);

    fireEvent.click(screen.getByRole('button', { name: 'Edit Project A' }));
    const savingStatus = await screen.findByText('Saving locally…');
    expect(savingStatus).toBeVisible();
    const dirtyEvent = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(dirtyEvent);
    expect(dirtyEvent.defaultPrevented).toBe(true);

    const opener = screen.getByTitle('Back to Home');
    opener.focus();
    fireEvent.click(opener);
    const dialog = await screen.findByRole('alertdialog', { name: 'Leave editor?' });
    const shell = container.firstElementChild;
    const stay = within(dialog).getByRole('button', { name: 'Stay' });
    const leave = within(dialog).getByRole('button', { name: 'Leave editor' });
    expect(dialog).toHaveTextContent('Changes are still saving or are not saved. Leaving now may lose them.');
    expect(stay).toHaveFocus();
    expect(stay).toHaveClass('min-h-11');
    expect(leave).toHaveClass('min-h-11');
    expect(savingStatus.closest('[role="status"]')?.querySelector('.animate-spin'))
      .toHaveClass('motion-reduce:animate-none');
    expect(shell).toHaveAttribute('inert');
    expect(router.state.location.pathname).toBe('/app');

    fireEvent.keyDown(dialog, { key: 'Tab' });
    expect(leave).toHaveFocus();
    fireEvent.keyDown(dialog, { key: 'Tab', shiftKey: true });
    expect(stay).toHaveFocus();

    fireEvent.click(stay);
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    await waitFor(() => expect(opener).toHaveFocus());
    expect(shell).not.toHaveAttribute('inert');
    fireEvent.click(opener);
    fireEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Leave editor' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/'));

    save.resolve({
      ...initial,
      projects: [{ ...initial.projects[0], initialState: { ...initial.projects[0].initialState, scale: 9 } }],
    });
  });
});
