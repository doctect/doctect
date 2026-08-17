import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { AppState } from '../../types';
import type {
  LocalWorkspaceStore,
  WorkspaceCommand,
  WorkspaceProject,
  WorkspaceSnapshot,
} from '../../services/localWorkspace/index';
import { createBlankProject } from '../../services/presets';

vi.mock('../../services/analytics', () => ({ trackEvent: vi.fn() }));
vi.mock('../../components/Sidebar', () => ({
  Sidebar: ({ state, onUpdateNode }: {
    state: AppState;
    onUpdateNode: (id: string, updates: Partial<AppState['nodes'][string]>) => void;
  }) => (
    <div>
      <pre data-testid="editor-state">{JSON.stringify(state)}</pre>
      <button
        type="button"
        onClick={() => onUpdateNode(state.rootId, {
          data: { ...state.nodes[state.rootId].data, locallyEdited: 'yes' },
        })}
      >
        Edit document
      </button>
    </div>
  ),
}));
vi.mock('../../components/Canvas', () => ({ Canvas: () => <div /> }));
vi.mock('../../components/PropertiesPanel', () => ({ PropertiesPanel: () => <div /> }));
vi.mock('../../components/LayersPanel', () => ({ LayersPanel: () => <div /> }));
vi.mock('../../components/CollapsibleSection', () => ({ CollapsibleSection: () => <div /> }));
vi.mock('../../components/JsonModal', () => ({ JsonModal: () => null }));
vi.mock('../../components/NodeSelectorModal', () => ({ NodeSelectorModal: () => null }));
vi.mock('../../components/DeleteConfirmModal', () => ({ DeleteConfirmModal: () => null }));
vi.mock('../../components/HierarchyGeneratorModal', () => ({ HierarchyGeneratorModal: () => null }));
vi.mock('../../components/SavePresetModal', () => ({ SavePresetModal: () => null }));
vi.mock('../../components/NewVariantModal', () => ({ NewVariantModal: () => null }));
vi.mock('../../components/EditorToolbar', () => ({ EditorToolbar: () => null }));

import { ProjectEditor } from '../../components/ProjectEditor';
import { useWorkspaceProjectWrites } from '../../hooks/useWorkspaceProjectWrites';

const markedState = (title: string, marker: string): AppState => {
  const state = createBlankProject();
  const markerId = `${marker}-only`;
  state.nodes[state.rootId] = {
    ...state.nodes[state.rootId],
    title,
    children: [markerId],
  };
  state.nodes[markerId] = {
    id: markerId,
    parentId: state.rootId,
    type: state.nodes[state.rootId].type,
    title: `${marker} nested bytes`,
    data: { authority: marker },
    children: [],
  };
  return state;
};

const editorProps = (
  initialState: AppState,
  overrides: Partial<React.ComponentProps<typeof ProjectEditor>> = {},
): React.ComponentProps<typeof ProjectEditor> => ({
  projectId: 'project-a',
  projectName: 'Project A',
  initialState,
  isActive: true,
  onNameChange: vi.fn(),
  onStateChange: vi.fn(),
  onCreateGeneratedProject: vi.fn(async () => true),
  onSaveCustomPreset: vi.fn(async () => true),
  ...overrides,
});

const readOnlyEditorState = (container: HTMLElement = document.body): AppState => {
  const output = within(container).getByTestId('editor-state');
  return JSON.parse(output.textContent || '{}');
};

describe('ProjectEditor authoritative state reconciliation', () => {
  it('adopts changed authoritative bytes at the same project and public revision before editing', async () => {
    const stale = markedState('Stale A', 'stale-a');
    const foreign = markedState('Foreign A', 'foreign-a');
    const onStateChange = vi.fn();
    const props = editorProps(stale, { onStateChange });
    const view = render(<ProjectEditor {...props} />);

    expect(onStateChange).not.toHaveBeenCalled();
    view.rerender(<ProjectEditor {...props} initialState={foreign} />);
    fireEvent.click(screen.getByRole('button', { name: 'Edit document' }));

    await waitFor(() => expect(onStateChange).toHaveBeenCalledOnce());
    const edited = onStateChange.mock.calls[0][0] as AppState;
    expect(edited.nodes['foreign-a-only']).toMatchObject({
      title: 'foreign-a nested bytes',
      data: { authority: 'foreign-a' },
    });
    expect(edited.nodes['stale-a-only']).toBeUndefined();
    expect(edited.nodes[edited.rootId].data.locallyEdited).toBe('yes');
  });

  it('treats an equal cloned readback as a no-op without echoing or clearing history', async () => {
    const initial = markedState('Original', 'original');
    const onNameChange = vi.fn();
    const onStateChange = vi.fn();
    const props = editorProps(initial, { onNameChange, onStateChange });
    const view = render(<ProjectEditor {...props} />);

    expect(onStateChange).not.toHaveBeenCalled();
    expect(onNameChange).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Edit document' }));
    await waitFor(() => expect(onStateChange).toHaveBeenCalledOnce());
    const local = readOnlyEditorState();

    view.rerender(<ProjectEditor {...props} initialState={structuredClone(local)} />);

    expect(onStateChange).toHaveBeenCalledOnce();
    expect(onNameChange).not.toHaveBeenCalled();
    expect(screen.getByTitle('Undo (Ctrl+Z)')).toBeEnabled();
    fireEvent.click(screen.getByTitle('Undo (Ctrl+Z)'));
    await waitFor(() => expect(readOnlyEditorState().nodes[initial.rootId].data.locallyEdited).toBeUndefined());
  });

  it('resets stale history and suppresses authority state and root-title callbacks', async () => {
    const stale = markedState('Stale root', 'stale-a');
    const foreign = markedState('Foreign root', 'foreign-a');
    const onNameChange = vi.fn();
    const onStateChange = vi.fn();
    const props = editorProps(stale, { onNameChange, onStateChange });
    const view = render(<ProjectEditor {...props} />);
    fireEvent.click(screen.getByRole('button', { name: 'Edit document' }));
    await waitFor(() => expect(onStateChange).toHaveBeenCalledOnce());
    expect(screen.getByTitle('Undo (Ctrl+Z)')).toBeEnabled();
    onNameChange.mockClear();
    onStateChange.mockClear();

    view.rerender(<ProjectEditor {...props} initialState={foreign} />);

    await waitFor(() => expect(readOnlyEditorState().nodes['foreign-a-only']).toBeDefined());
    expect(onStateChange).not.toHaveBeenCalled();
    expect(onNameChange).not.toHaveBeenCalled();
    expect(screen.getByTitle('Undo (Ctrl+Z)')).toBeDisabled();
    fireEvent.keyDown(window, { key: 'z', ctrlKey: true });
    expect(readOnlyEditorState().nodes['stale-a-only']).toBeUndefined();
  });

  it('adopts while hidden so activation cannot expose stale editable bytes', async () => {
    const stale = markedState('Hidden stale', 'stale-a');
    const foreign = markedState('Hidden foreign', 'foreign-a');
    const onStateChange = vi.fn();
    const props = editorProps(stale, { isActive: false, onStateChange });
    const view = render(<ProjectEditor {...props} />);

    view.rerender(<ProjectEditor {...props} initialState={foreign} />);
    await waitFor(() => expect(readOnlyEditorState().nodes['foreign-a-only']).toBeDefined());
    view.rerender(<ProjectEditor {...props} initialState={structuredClone(foreign)} isActive />);
    fireEvent.click(screen.getByRole('button', { name: 'Edit document' }));

    await waitFor(() => expect(onStateChange).toHaveBeenCalledOnce());
    const edited = onStateChange.mock.calls[0][0] as AppState;
    expect(edited.nodes['foreign-a-only']).toBeDefined();
    expect(edited.nodes['stale-a-only']).toBeUndefined();
  });
});

const project = (id: string, name: string, initialState: AppState): WorkspaceProject => ({
  id,
  name,
  initialState,
  revision: 0,
});

const workspace = (
  projectA: WorkspaceProject,
  projectB: WorkspaceProject,
  activeProjectId = projectB.id,
): WorkspaceSnapshot => ({
  projects: [projectA, projectB],
  activeProjectId,
  customPresets: [],
  pendingImports: [],
});

function RealWriteHarness({
  store,
  initialWorkspace,
}: {
  store: LocalWorkspaceStore;
  initialWorkspace: WorkspaceSnapshot;
}): React.ReactElement {
  const { workspace: current, updateProject } = useWorkspaceProjectWrites(store, initialWorkspace);
  return (
    <>
      {current.projects.map(item => (
        <section
          key={`${item.id}:${item.revision ?? 0}`}
          data-testid={`project-${item.id}`}
          data-active={String(item.id === current.activeProjectId)}
        >
          <ProjectEditor
            projectId={item.id}
            projectName={item.name}
            initialState={item.initialState}
            isActive={item.id === current.activeProjectId}
            onNameChange={name => { void updateProject(item.id, value => ({ ...value, name })); }}
            onStateChange={state => {
              void updateProject(item.id, value => ({ ...value, initialState: state }));
            }}
            onCreateGeneratedProject={vi.fn(async () => true)}
            onSaveCustomPreset={vi.fn(async () => true)}
          />
        </section>
      ))}
    </>
  );
}

describe('ProjectEditor with useWorkspaceProjectWrites', () => {
  it('bases the next A save on foreign A bytes returned by a B command', async () => {
    const staleA = project('project-a', 'Project A', markedState('Stale A', 'stale-a'));
    const initialB = project('project-b', 'Project B', markedState('Initial B', 'initial-b'));
    const foreignA = project('project-a', 'Project A', markedState('Foreign A', 'foreign-a'));
    let durable = workspace(staleA, initialB);
    const commit = vi.fn(async (command: WorkspaceCommand): Promise<WorkspaceSnapshot> => {
      if (command.type !== 'save-project') return structuredClone(durable);
      if (command.project.id === 'project-b') {
        durable = workspace(foreignA, structuredClone(command.project), 'project-a');
      } else {
        durable = {
          ...durable,
          projects: durable.projects.map(item => (
            item.id === command.project.id ? structuredClone(command.project) : item
          )),
        };
      }
      return structuredClone(durable);
    });
    const store: LocalWorkspaceStore = {
      bootstrap: vi.fn(),
      commit,
      exportRecoveryBundle: vi.fn(),
    };
    render(<RealWriteHarness store={store} initialWorkspace={workspace(staleA, initialB)} />);
    const projectB = screen.getByTestId('project-project-b');

    fireEvent.click(within(projectB).getByRole('button', { name: 'Edit document' }));
    await waitFor(() => expect(commit).toHaveBeenCalledTimes(1));
    const projectA = screen.getByTestId('project-project-a');
    await waitFor(() => expect(projectA).toHaveAttribute('data-active', 'true'));
    fireEvent.click(within(projectA).getByRole('button', { name: 'Edit document' }));

    await waitFor(() => expect(commit).toHaveBeenCalledTimes(2));
    const nextACommand = commit.mock.calls[1][0] as Extract<WorkspaceCommand, { type: 'save-project' }>;
    expect(nextACommand.project.id).toBe('project-a');
    expect(nextACommand.project.initialState.nodes['foreign-a-only']).toMatchObject({
      data: { authority: 'foreign-a' },
    });
    expect(nextACommand.project.initialState.nodes['stale-a-only']).toBeUndefined();
  });
});
