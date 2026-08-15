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
  type WorkspaceProject,
  type WorkspaceSnapshot,
} from '../../services/localWorkspace/index';
import type { AppState } from '../../types';

const trackEvent = vi.hoisted(() => vi.fn());
const downloadJson = vi.hoisted(() => vi.fn());
const generatedResult = vi.hoisted(() => ({ current: undefined as boolean | undefined }));

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
  NewProjectModal: ({ isOpen, onClose, onSelectPreset }: any) => isOpen ? (
    <div role="dialog" aria-label="New project">
      <button type="button" onClick={() => onSelectPreset('blank')}>Create blank</button>
      <button type="button" onClick={() => onSelectPreset('missing-preset')}>Create missing preset</button>
      <button type="button" onClick={onClose}>Cancel new project</button>
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
      <button
        type="button"
        onClick={() => onLinkCloud({ projectId: 'cloud-1', lastSyncedCommitId: 'commit-1' })}
      >
        Link {project.name} to cloud
      </button>
      <button
        type="button"
        onClick={() => onRestoreState(
          { ...project.initialState, scale: 13 },
          { projectId: 'cloud-1', lastSyncedCommitId: 'commit-2' },
        )}
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

const workspace = (
  projects: WorkspaceProject[] = [project('project-a', 'Project A')],
  activeProjectId = projects[0].id,
): WorkspaceSnapshot => ({
  projects,
  activeProjectId,
  customPresets: [],
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
  return { store, commit };
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

describe('EditorPage workspace commands', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    trackEvent.mockReset();
    downloadJson.mockReset();
    generatedResult.current = undefined;
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
    expect(localStorage.getItem('hype_projects')).toBeNull();
    expect(localStorage.getItem('hype_active_project')).toBeNull();
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

  it('clears an older command failure when a newer command succeeds', async () => {
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
    await act(async () => first.reject(new WorkspaceStoreError('First command failed.', 'io')));
    expect(await screen.findByRole('alert')).toHaveTextContent('First command failed.');

    await act(async () => second.resolve({ ...initial, activeProjectId: 'project-b' }));

    expect(await screen.findByText('Active Project B')).toBeVisible();
    expect(screen.queryByText('First command failed.')).not.toBeInTheDocument();
  });

  it('rejects a missing custom preset instead of silently creating blank content', async () => {
    const initial = workspace();
    const { store, commit } = commandStore(initial);
    renderEditor(store, initial);

    fireEvent.click(screen.getByRole('button', { name: 'New project' }));
    fireEvent.click(screen.getByRole('button', { name: 'Create missing preset' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      "Preset 'missing-preset' was not found. No project was created.",
    );
    expect(commit).not.toHaveBeenCalled();
    expect(screen.getAllByTestId(/^editor-/)).toHaveLength(1);
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
    expect(within(alert).getByRole('button', { name: 'Download JSON' })).toBeVisible();
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

  it('blocks router and beforeunload navigation while a save is pending', async () => {
    const initial = workspace();
    const save = deferred<WorkspaceSnapshot>();
    const { store } = commandStore(initial, (command, next) => (
      command.type === 'save-project' ? save.promise : next
    ));
    const { router } = renderEditor(store, initial);
    const cleanEvent = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(cleanEvent);
    expect(cleanEvent.defaultPrevented).toBe(false);

    fireEvent.click(screen.getByRole('button', { name: 'Edit Project A' }));
    expect(await screen.findByText('Saving locally…')).toBeVisible();
    const dirtyEvent = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(dirtyEvent);
    expect(dirtyEvent.defaultPrevented).toBe(true);

    fireEvent.click(screen.getByTitle('Back to Home'));
    const dialog = await screen.findByRole('alertdialog', { name: 'Leave editor?' });
    expect(dialog).toHaveTextContent('Changes are still saving or are not saved. Leaving now may lose them.');
    expect(within(dialog).getByRole('button', { name: 'Stay' })).toHaveFocus();
    expect(router.state.location.pathname).toBe('/app');

    fireEvent.click(within(dialog).getByRole('button', { name: 'Stay' }));
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTitle('Back to Home'));
    fireEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Leave editor' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/'));

    save.resolve({
      ...initial,
      projects: [{ ...initial.projects[0], initialState: { ...initial.projects[0].initialState, scale: 9 } }],
    });
  });
});
