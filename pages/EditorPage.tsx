
import React, { useState, useEffect } from 'react';
import { AppState } from '../types';
import { createPlannerProject, createBlankProject, createNotebookProject, ProjectPreset, getCustomPresets } from '../services/presets';
import { migrateState } from '../services/migration';
import { loadProjectState } from '../services/loadProjectState';
import { consumeImport } from '../services/importProject';
import { ProjectEditor } from '../components/ProjectEditor';
import { TabBar } from '../components/TabBar';
import { NewProjectModal } from '../components/NewProjectModal';
import { CloseProjectConfirmModal } from '../components/CloseProjectConfirmModal';
import { Square, Home, Github, Coffee, AlertTriangle, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import clsx from 'clsx';
import { trackEvent } from '../services/analytics';
import { AccountMenu } from '../components/AccountMenu';
import { CloudMenu } from '../components/cloud/CloudMenu';
import { KOFI_URL } from '../constants/editor';
import type { GeneratedProject } from '../services/validateGeneratedProject';
import type { GeneratorSourceDraft } from '../services/generatorVisualPreview';
import { createGeneratedAppState } from '../services/generatedProjectState';

export interface Project {
    id: string;
    name: string;
    initialState: AppState;
    cloud?: { projectId: string; lastSyncedCommitId: string };
    revision?: number;
}

const persistProjects = (projects: Project[]) => {
    try {
        localStorage.setItem('hype_projects', JSON.stringify(projects));
        return true;
    } catch (e) {
        console.error("Failed to save projects to storage", e);
        return false;
    }
};

export const loadSavedProjects = (): { projects: Project[]; warnings: string[] } => {
    try {
        const saved = localStorage.getItem('hype_projects');
        if (saved) {
            const parsed = JSON.parse(saved);
            const warnings: string[] = [];
            const projects = parsed.map((project: Project) => {
                const loaded = loadProjectState(project.initialState);
                warnings.push(...loaded.warnings);
                return { ...project, initialState: loaded.state };
            });
            return { projects, warnings };
        }
    } catch (e) {
        console.warn("Failed to load projects from storage", e);
    }
    return {
        projects: [{ id: 'proj_1', name: 'Blank Project', initialState: createBlankProject() }],
        warnings: [],
    };
};

export function EditorPage() {
    const [initialLoad] = useState(loadSavedProjects);
    const [projects, setProjects] = useState<Project[]>(initialLoad.projects);
    const [loadWarnings, setLoadWarnings] = useState<string[]>(initialLoad.warnings);

    // Load active project ID or default to first
    const [activeProjectId, setActiveProjectId] = useState<string>(() => {
        const saved = localStorage.getItem('hype_active_project');
        return saved || projects[0]?.id || 'proj_1';
    });

    const [showNewProjectModal, setShowNewProjectModal] = useState(false);
    const [closingProjectId, setClosingProjectId] = useState<string | null>(null);

    // Persist projects state
    useEffect(() => {
        persistProjects(projects);
    }, [projects]);

    // Persist active project
    useEffect(() => {
        localStorage.setItem('hype_active_project', activeProjectId);
    }, [activeProjectId]);

    // Ensure active project exists
    useEffect(() => {
        if (projects.length > 0 && !projects.find(p => p.id === activeProjectId)) {
            setActiveProjectId(projects[0].id);
        } else if (projects.length === 0) {
            // If all deleted somehow, restore default
            const defaultProj = { id: 'proj_1', name: 'Blank Project', initialState: createBlankProject() };
            setProjects([defaultProj]);
            setActiveProjectId('proj_1');
        }
    }, [projects, activeProjectId]);

    // Consume a staged import from the gallery (set by stageImport before navigating here)
    useEffect(() => {
        const pending = consumeImport();
        if (!pending) return;
        const loaded = loadProjectState(pending.state);
        const newId = `proj_${Date.now()}`;
        const newProject: Project = {
            id: newId,
            name: pending.name,
            initialState: loaded.state,
            cloud: pending.cloud,
            revision: 0
        };
        setProjects(prev => [...prev, newProject]);
        setLoadWarnings(prev => [...prev, ...loaded.warnings]);
        setActiveProjectId(newId);
        trackEvent('project_imported_from_gallery', { name: pending.name });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const handleCreateProject = (preset: ProjectPreset) => {
        let newState: AppState;
        let baseName = 'New Project';

        // Explicitly check for built-in presets
        if (preset === 'planner_2026') {
            newState = createPlannerProject();
            baseName = 'Planner 2026';
        }
        else if (preset === 'notebook') {
            newState = createNotebookProject();
            baseName = 'My Notebook';
        }
        else if (preset === 'blank') {
            newState = createBlankProject();
            baseName = 'Blank Project';
        }
        else {
            // Check custom presets
            const customs = getCustomPresets();
            const found = customs.find(p => p.id === preset);
            if (found && found.initialState) {
                // Deep clone and migrate to current schema
                newState = migrateState(JSON.parse(JSON.stringify(found.initialState)));
                baseName = found.title;
            } else {
                // Fallback
                console.warn(`Preset '${preset}' not found, falling back to blank.`);
                newState = createBlankProject();
            }
        }

        const newId = `proj_${Date.now()}`;
        const newProject: Project = {
            id: newId,
            name: baseName,
            initialState: newState
        };

        setProjects([...projects, newProject]);
        setActiveProjectId(newId);
        setShowNewProjectModal(false);
        trackEvent('project_created', { preset: preset, baseName: baseName });
    };

    const initiateCloseProject = (id: string) => {
        setClosingProjectId(id);
    };

    const executeCloseProject = () => {
        if (!closingProjectId) return;
        const id = closingProjectId;

        const remainingProjects = projects.filter(p => p.id !== id);

        if (remainingProjects.length === 0) {
            // If closing the last project, replace it with a fresh blank project
            const newState = createBlankProject();
            const newId = `proj_${Date.now()}`;
            const newProject: Project = {
                id: newId,
                name: 'Blank Project',
                initialState: newState
            };
            setProjects([newProject]);
            setActiveProjectId(newId);
        } else {
            setProjects(remainingProjects);
            if (activeProjectId === id) {
                setActiveProjectId(remainingProjects[remainingProjects.length - 1].id);
            }
        }
        setClosingProjectId(null);
    };

    const downloadProjectJson = (project: Project) => {
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(project.initialState, null, 2));
        const downloadAnchorNode = document.createElement('a');
        downloadAnchorNode.setAttribute("href", dataStr);
        downloadAnchorNode.setAttribute("download", `${project.name.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.json`);
        document.body.appendChild(downloadAnchorNode);
        downloadAnchorNode.click();
        downloadAnchorNode.remove();
    };

    const handleSaveAndClose = () => {
        if (closingProjectId) {
            const project = projects.find(p => p.id === closingProjectId);
            if (project) {
                downloadProjectJson(project);
            }
            executeCloseProject();
        }
    };

    const handleUpdateProjectName = (id: string, name: string) => {
        setProjects(prev => prev.map(p => p.id === id ? { ...p, name } : p));
    };

    const handleUpdateProjectState = (id: string, state: AppState) => {
        setProjects(prev => prev.map(p => p.id === id ? { ...p, initialState: state } : p));
    };

    const handleCreateGeneratedProject = (
        sourceProjectId: string,
        name: string,
        generated: GeneratedProject,
        source: GeneratorSourceDraft,
    ) => {
        const trimmed = name.trim();
        if (!trimmed || trimmed.length > 100) return false;
        const newId = `proj_${crypto.randomUUID()}`;
        const newProject: Project = {
            id: newId,
            name: trimmed,
            initialState: createGeneratedAppState(createBlankProject(), generated, source, new Date().toISOString()),
            revision: 0,
        };
        const nextProjects = [...projects, newProject];
        if (!persistProjects(nextProjects)) return false;
        setProjects(nextProjects);
        setActiveProjectId(newId);
        trackEvent('project_created_from_generator', {
            sourceProjectId,
            nodeCount: Object.keys(generated.nodes).length,
        });
        return true;
    };

    const handleLinkCloud = (id: string, cloud: { projectId: string; lastSyncedCommitId: string }) => {
        setProjects(prev => prev.map(p => p.id === id ? { ...p, cloud } : p));
    };

    const handleRestoreState = (id: string, state: AppState) => {
        setProjects(prev => prev.map(p => p.id === id
            ? { ...p, initialState: state, revision: (p.revision || 0) + 1 }
            : p));
    };

    const closingProject = closingProjectId ? projects.find(p => p.id === closingProjectId) : null;
    const activeProject = projects.find(p => p.id === activeProjectId);

    return (
        <div className="flex flex-col h-screen w-screen overflow-hidden bg-slate-200">
            {/* Main App Header */}
            <header className="h-12 bg-white border-b flex items-center px-4 z-20 flex-shrink-0 gap-4">
                <Link to="/" className="flex items-center gap-2 font-bold text-lg text-slate-800 mr-4 hover:opacity-80 transition-opacity" title="Back to Home">
                    <div className="w-7 h-7 bg-blue-600 rounded-lg flex items-center justify-center text-white">
                        <Square size={16} fill="currentColor" className="text-white" />
                    </div>
                    <span className="hidden md:inline">PDF Architect</span>
                </Link>

                <div className="flex-1 h-full overflow-hidden">
                    <TabBar
                        projects={projects}
                        activeProjectId={activeProjectId}
                        onSelect={setActiveProjectId}
                        onClose={initiateCloseProject}
                        onNew={() => setShowNewProjectModal(true)}
                    />
                </div>

                <div className="flex items-center gap-3 hidden sm:flex">
                    <AccountMenu />
                    {activeProject && (
                        <CloudMenu
                            project={activeProject}
                            onLinkCloud={(cloud) => handleLinkCloud(activeProject.id, cloud)}
                            onRestoreState={(state) => handleRestoreState(activeProject.id, state)}
                        />
                    )}
                    <a href="https://github.com/doctect/doctect" target="_blank" rel="noopener noreferrer" className="text-slate-400 hover:text-slate-900 transition-colors" title="View on GitHub">
                        <Github size={18} />
                    </a>
                    <a href={KOFI_URL} target="_blank" rel="noopener noreferrer" className="text-slate-400 hover:text-rose-600 transition-colors" title="Support the project on Ko-fi">
                        <Coffee size={18} />
                    </a>
                    <Link to="/gallery" className="text-xs font-medium text-slate-500 hover:text-blue-600">
                        Gallery
                    </Link>
                    <Link to="/docs" className="text-xs font-medium text-slate-500 hover:text-blue-600">
                        Docs
                    </Link>
                </div>
            </header>

            {loadWarnings.length > 0 && (
                <div role="alert" className="bg-amber-50 border-b border-amber-200 px-4 py-2 text-xs text-amber-900 flex items-start gap-2">
                    <AlertTriangle size={15} className="flex-shrink-0 mt-0.5" />
                    <div className="flex-1 space-y-1">
                        {loadWarnings.map((warning, index) => <div key={`${index}:${warning}`}>{warning}</div>)}
                    </div>
                    <button
                        type="button"
                        aria-label="Dismiss project load warnings"
                        onClick={() => setLoadWarnings([])}
                        className="text-amber-700 hover:text-amber-950"
                    >
                        <X size={15} />
                    </button>
                </div>
            )}

            {/* Project Workspace Area */}
            <div className="flex-1 relative overflow-hidden bg-slate-100">
                {projects.map(project => (
                    <div
                        key={`${project.id}:${project.revision || 0}`}
                        data-testid="project-pane"
                        data-active={project.id === activeProjectId ? 'true' : 'false'}
                        className={clsx(
                            "absolute inset-0 w-full h-full",
                            project.id === activeProjectId ? "z-10 opacity-100" : "z-0 opacity-0 pointer-events-none"
                        )}
                    >
                        <ProjectEditor
                            projectId={project.id}
                            projectName={project.name}
                            initialState={project.initialState}
                            isActive={project.id === activeProjectId}
                            onNameChange={(name) => handleUpdateProjectName(project.id, name)}
                            onStateChange={(state) => handleUpdateProjectState(project.id, state)}
                            onCreateGeneratedProject={(name, generated, source) => (
                                handleCreateGeneratedProject(project.id, name, generated, source)
                            )}
                        />
                    </div>
                ))}
            </div>

            <NewProjectModal
                isOpen={showNewProjectModal}
                onClose={() => setShowNewProjectModal(false)}
                onSelectPreset={handleCreateProject}
            />

            <CloseProjectConfirmModal
                isOpen={!!closingProjectId}
                onClose={() => setClosingProjectId(null)}
                onConfirmClose={executeCloseProject}
                onSaveAndClose={handleSaveAndClose}
                projectName={closingProject?.name || 'Project'}
            />
        </div>
    );
}
