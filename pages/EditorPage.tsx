import React, { useEffect, useRef, useState } from 'react';
import { Link, useBlocker } from 'react-router-dom';
import { AlertTriangle, Coffee, Github, Square, X } from 'lucide-react';
import clsx from 'clsx';
import { ProjectEditor } from '../components/ProjectEditor';
import { TabBar } from '../components/TabBar';
import { NewProjectModal } from '../components/NewProjectModal';
import { CloseProjectConfirmModal } from '../components/CloseProjectConfirmModal';
import { AccountMenu } from '../components/AccountMenu';
import { CloudMenu } from '../components/cloud/CloudMenu';
import { LocalSaveStatus } from '../components/workspace/LocalSaveStatus';
import { UnsavedNavigationDialog } from '../components/workspace/UnsavedNavigationDialog';
import { KOFI_URL } from '../constants/editor';
import {
  useWorkspaceProjectWrites,
  type StructuralWorkspaceCommand,
} from '../hooks/useWorkspaceProjectWrites';
import { downloadJson } from '../services/browserDownload';
import { createGeneratedAppState } from '../services/generatedProjectState';
import { trackEvent } from '../services/analytics';
import {
  createBlankProject,
  createNotebookProject,
  createPlannerProject,
  type ProjectPreset,
} from '../services/presets';
import type { GeneratorSourceDraft } from '../services/generatorVisualPreview';
import type {
  LocalWorkspaceStore,
  WorkspaceProject,
  WorkspaceSnapshot,
} from '../services/localWorkspace/index';
import type { GeneratedProject } from '../services/validateGeneratedProject';
import type { AppState } from '../types';

export type Project = WorkspaceProject;

export interface EditorPageProps {
  store: LocalWorkspaceStore;
  initialWorkspace: WorkspaceSnapshot;
  initialWarnings: string[];
  onWorkspaceChange?: (snapshot: WorkspaceSnapshot) => void;
}

const newProjectId = (): string => `proj_${crypto.randomUUID()}`;
const newCustomPresetId = (): string => `custom_${crypto.randomUUID()}`;

const projectJsonFilename = (project: WorkspaceProject): string => {
  const safeName = project.name.trim().replace(/\s+/g, '_') || 'Project';
  return `${safeName}_${new Date().toISOString().split('T')[0]}.json`;
};

const commandErrorMessage = (error: unknown): string => (
  error instanceof Error ? error.message : 'Local workspace command failed.'
);

export function EditorPage({
  store,
  initialWorkspace,
  initialWarnings,
  onWorkspaceChange,
}: EditorPageProps): React.ReactElement {
  const {
    workspace,
    authorityEpochs,
    saveStates,
    hasUnsavedWork,
    updateProject,
    commitStructural,
    retryProject,
  } = useWorkspaceProjectWrites(store, initialWorkspace, onWorkspaceChange);
  const [loadWarnings, setLoadWarnings] = useState(initialWarnings);
  const [commandError, setCommandError] = useState<string | null>(null);
  const [showNewProjectModal, setShowNewProjectModal] = useState(false);
  const [presetCommandBusy, setPresetCommandBusy] = useState(false);
  const [closingProjectId, setClosingProjectId] = useState<string | null>(null);
  const editorShellRef = useRef<HTMLDivElement>(null);
  const presetCommandBusyRef = useRef(false);
  const blocker = useBlocker(hasUnsavedWork);
  const navigationBlocked = blocker.state === 'blocked';

  const { projects, activeProjectId } = workspace;
  const activeProject = projects.find(project => project.id === activeProjectId);
  const closingProject = closingProjectId
    ? projects.find(project => project.id === closingProjectId)
    : undefined;

  useEffect(() => {
    if (!hasUnsavedWork) return undefined;
    const preventUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', preventUnload);
    return () => window.removeEventListener('beforeunload', preventUnload);
  }, [hasUnsavedWork]);

  const commitAndApply = async (
    command: StructuralWorkspaceCommand,
  ): Promise<WorkspaceSnapshot | null> => {
    setCommandError(null);
    try {
      const snapshot = await commitStructural(command);
      setCommandError(null);
      return snapshot;
    } catch (error) {
      setCommandError(commandErrorMessage(error));
      return null;
    }
  };

  const handleCreateProject = async (preset: ProjectPreset): Promise<void> => {
    if (presetCommandBusyRef.current) return;
    let initialState: AppState;
    let name: string;

    if (preset === 'planner_2026') {
      initialState = createPlannerProject();
      name = 'Planner 2026';
    } else if (preset === 'notebook') {
      initialState = createNotebookProject();
      name = 'My Notebook';
    } else if (preset === 'blank') {
      initialState = createBlankProject();
      name = 'Blank Project';
    } else {
      const customPreset = workspace.customPresets.find(candidate => candidate.id === preset);
      if (!customPreset) {
        setCommandError('This preset is no longer available. Nothing was created.');
        return;
      }
      initialState = structuredClone(customPreset.initialState);
      name = customPreset.title;
    }

    presetCommandBusyRef.current = true;
    setPresetCommandBusy(true);
    try {
      const created = await commitAndApply({
        type: 'create-and-activate-project',
        project: { id: newProjectId(), name, initialState },
      });
      if (!created) return;
      setShowNewProjectModal(false);
      trackEvent('project_created', { preset, baseName: name });
    } finally {
      presetCommandBusyRef.current = false;
      setPresetCommandBusy(false);
    }
  };

  const handleSaveCustomPreset = async (
    title: string,
    desc: string,
    initialState: AppState,
  ): Promise<boolean> => {
    try {
      await commitStructural({
        type: 'save-custom-preset',
        preset: {
          id: newCustomPresetId(),
          title,
          desc,
          isCustom: true,
          initialState: structuredClone(initialState),
        },
      });
      return true;
    } catch {
      return false;
    }
  };

  const handleDeleteCustomPreset = async (presetId: string): Promise<void> => {
    if (presetCommandBusyRef.current) return;
    presetCommandBusyRef.current = true;
    setPresetCommandBusy(true);
    setCommandError(null);
    try {
      await commitStructural({ type: 'delete-custom-preset', presetId });
    } catch {
      setCommandError('Preset was not deleted. Nothing was changed.');
    } finally {
      presetCommandBusyRef.current = false;
      setPresetCommandBusy(false);
    }
  };

  const handleActivateProject = async (projectId: string): Promise<void> => {
    if (projectId === activeProjectId) return;
    await commitAndApply({ type: 'activate-project', projectId });
  };

  const executeCloseProject = async (): Promise<void> => {
    if (!closingProjectId) return;
    const successor = projects.length === 1
      ? {
          id: newProjectId(),
          name: 'Blank Project',
          initialState: createBlankProject(),
        }
      : undefined;
    const closed = await commitAndApply({
      type: 'close-project',
      projectId: closingProjectId,
      ...(successor ? { successor } : {}),
    });
    if (!closed) return;
    setClosingProjectId(null);
  };

  const downloadProjectJson = (project: WorkspaceProject): void => {
    downloadJson(project.initialState, projectJsonFilename(project));
  };

  const handleSaveAndClose = async (): Promise<void> => {
    if (!closingProject) return;
    downloadProjectJson(closingProject);
    await executeCloseProject();
  };

  const handleUpdateProjectName = (
    projectId: string,
    authorityEpoch: number,
    name: string,
  ): void => {
    void updateProject(projectId, project => ({ ...project, name }), authorityEpoch);
  };

  const handleUpdateProjectState = (
    projectId: string,
    authorityEpoch: number,
    initialState: AppState,
  ): void => {
    void updateProject(
      projectId,
      project => ({ ...project, initialState }),
      authorityEpoch,
    );
  };

  const handleCreateGeneratedProject = async (
    sourceProjectId: string,
    name: string,
    generated: GeneratedProject,
    source: GeneratorSourceDraft,
  ): Promise<boolean> => {
    const trimmedName = name.trim();
    if (!trimmedName || trimmedName.length > 100) return false;
    const project: WorkspaceProject = {
      id: newProjectId(),
      name: trimmedName,
      initialState: createGeneratedAppState(
        createBlankProject(),
        generated,
        source,
        new Date().toISOString(),
      ),
      revision: 0,
    };
    const created = await commitAndApply({ type: 'create-and-activate-project', project });
    if (!created) return false;
    trackEvent('project_created_from_generator', {
      sourceProjectId,
      nodeCount: Object.keys(generated.nodes).length,
    });
    return true;
  };

  const handleLinkCloud = async (
    projectId: string,
    authorityEpoch: number,
    cloud: { projectId: string; lastSyncedCommitId: string },
  ): Promise<boolean> => {
    return updateProject(projectId, project => ({ ...project, cloud }), authorityEpoch);
  };

  const handleRestoreState = async (
    projectId: string,
    authorityEpoch: number,
    initialState: AppState,
    cloud?: { projectId: string; lastSyncedCommitId: string },
  ): Promise<boolean> => {
    return updateProject(projectId, project => ({
      ...project,
      initialState,
      revision: (project.revision ?? 0) + 1,
      ...(cloud ? { cloud } : {}),
    }), authorityEpoch);
  };

  return (
    <>
    <div
      ref={editorShellRef}
      className="flex h-screen w-screen flex-col overflow-hidden bg-slate-200"
    >
      <header className="z-20 flex h-12 shrink-0 items-center gap-3 border-b bg-white px-3 sm:gap-4 sm:px-4">
        <Link
          to="/"
          className="mr-1 flex items-center gap-2 text-lg font-bold text-slate-800 transition-opacity hover:opacity-80 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 sm:mr-4"
          title="Back to Home"
        >
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-600 text-white">
            <Square size={16} fill="currentColor" className="text-white" />
          </div>
          <span className="hidden md:inline">PDF Architect</span>
        </Link>

        <div className="h-full min-w-0 flex-1 overflow-hidden">
          <TabBar
            projects={projects}
            activeProjectId={activeProjectId}
            onSelect={projectId => { void handleActivateProject(projectId); }}
            onClose={setClosingProjectId}
            onNew={() => {
              setCommandError(null);
              setShowNewProjectModal(true);
            }}
          />
        </div>

        {activeProject && (
          <LocalSaveStatus
            state={saveStates.get(activeProject.id) ?? { status: 'saved' }}
            onRetry={() => retryProject(activeProject.id)}
            onDownload={() => downloadProjectJson(activeProject)}
          />
        )}

        <div className="hidden items-center gap-3 sm:flex">
          <AccountMenu />
          {activeProject && (
            <CloudMenu
              project={activeProject}
              onLinkCloud={cloud => handleLinkCloud(
                activeProject.id,
                authorityEpochs.get(activeProject.id) ?? 0,
                cloud,
              )}
              onRestoreState={(state, cloud) => handleRestoreState(
                activeProject.id,
                authorityEpochs.get(activeProject.id) ?? 0,
                state,
                cloud,
              )}
            />
          )}
          <a
            href="https://github.com/doctect/doctect"
            target="_blank"
            rel="noopener noreferrer"
            className="text-slate-400 transition-colors hover:text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
            title="View on GitHub"
          >
            <Github size={18} />
          </a>
          <a
            href={KOFI_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="text-slate-400 transition-colors hover:text-rose-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
            title="Support the project on Ko-fi"
          >
            <Coffee size={18} />
          </a>
          <Link to="/gallery" className="text-xs font-medium text-slate-500 hover:text-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500">
            Gallery
          </Link>
          <Link to="/docs" className="text-xs font-medium text-slate-500 hover:text-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500">
            Docs
          </Link>
        </div>
      </header>

      {loadWarnings.length > 0 && (
        <div role="alert" className="flex items-start gap-2 border-b border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-900">
          <AlertTriangle size={15} className="mt-0.5 shrink-0" />
          <div className="flex-1 space-y-1">
            {loadWarnings.map((warning, index) => (
              <div key={`${index}:${warning}`}>{warning}</div>
            ))}
          </div>
          <button
            type="button"
            aria-label="Dismiss project load warnings"
            onClick={() => setLoadWarnings([])}
            className="text-amber-700 hover:text-amber-950 focus:outline-none focus:ring-2 focus:ring-amber-700"
          >
            <X size={15} />
          </button>
        </div>
      )}

      {commandError && !showNewProjectModal && (
        <div role="alert" className="flex items-center gap-2 border-b border-red-200 bg-red-50 px-4 py-2 text-xs text-red-800">
          <AlertTriangle size={15} className="shrink-0" />
          <span className="min-w-0 flex-1 break-words">{commandError}</span>
          <button
            type="button"
            aria-label="Dismiss local workspace error"
            onClick={() => setCommandError(null)}
            className="shrink-0 text-red-700 hover:text-red-950 focus:outline-none focus:ring-2 focus:ring-red-700"
          >
            <X size={15} />
          </button>
        </div>
      )}

      <div className="relative flex-1 overflow-hidden bg-slate-100">
        {projects.map(project => {
          const authorityEpoch = authorityEpochs.get(project.id) ?? 0;
          return (
            <div
              key={`${project.id}:${project.revision ?? 0}:${authorityEpoch}`}
              data-testid="project-pane"
              data-active={project.id === activeProjectId ? 'true' : 'false'}
              className={clsx(
                'absolute inset-0 h-full w-full',
                project.id === activeProjectId
                  ? 'z-10 opacity-100'
                  : 'pointer-events-none z-0 opacity-0',
              )}
            >
              <ProjectEditor
                projectId={project.id}
                projectName={project.name}
                initialState={project.initialState}
                isActive={project.id === activeProjectId}
                onNameChange={name => handleUpdateProjectName(project.id, authorityEpoch, name)}
                onStateChange={state => handleUpdateProjectState(project.id, authorityEpoch, state)}
                onCreateGeneratedProject={(name, generated, source) => (
                  handleCreateGeneratedProject(project.id, name, generated, source)
                )}
                onSaveCustomPreset={handleSaveCustomPreset}
              />
            </div>
          );
        })}
      </div>

      <NewProjectModal
        isOpen={showNewProjectModal}
        customPresets={workspace.customPresets}
        busy={presetCommandBusy}
        error={commandError}
        onClose={() => {
          if (presetCommandBusyRef.current) return;
          setShowNewProjectModal(false);
          setCommandError(null);
        }}
        onSelectPreset={handleCreateProject}
        onDeleteCustomPreset={handleDeleteCustomPreset}
      />

      <CloseProjectConfirmModal
        isOpen={Boolean(closingProjectId)}
        onClose={() => setClosingProjectId(null)}
        onConfirmClose={() => { void executeCloseProject(); }}
        onSaveAndClose={() => { void handleSaveAndClose(); }}
        projectName={closingProject?.name ?? 'Project'}
      />

    </div>
    {navigationBlocked && (
      <UnsavedNavigationDialog
        backgroundRef={editorShellRef}
        onStay={() => blocker.reset()}
        onLeave={() => blocker.proceed()}
      />
    )}
    </>
  );
}
