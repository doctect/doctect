
import React, { useState, useEffect } from 'react';
import { AppState } from '../types';
import { createPlannerProject, createBlankProject, createNotebookProject, ProjectPreset, getCustomPresets } from '../services/presets';
import { ProjectEditor } from '../components/ProjectEditor';
import { TabBar } from '../components/TabBar';
import { NewProjectModal } from '../components/NewProjectModal';
import { CloseProjectConfirmModal } from '../components/CloseProjectConfirmModal';
import { Square, Home, Github } from 'lucide-react';
import { Link } from 'react-router-dom';
import clsx from 'clsx';
import { trackEvent } from '../services/analytics';

interface Project {
    id: string;
    name: string;
    initialState: AppState;
}

export function EditorPage() {
    // Load projects from local storage or initialize with default
    const [projects, setProjects] = useState<Project[]>(() => {
        try {
            const saved = localStorage.getItem('hype_projects');
            if (saved) return JSON.parse(saved);
        } catch (e) {
            console.warn("Failed to load projects from storage", e);
        }
        return [{ id: 'proj_1', name: 'Blank Project', initialState: createBlankProject() }];
    });

    // Load active project ID or default to first
    const [activeProjectId, setActiveProjectId] = useState<string>(() => {
        const saved = localStorage.getItem('hype_active_project');
        return saved || projects[0]?.id || 'proj_1';
    });

    const [showNewProjectModal, setShowNewProjectModal] = useState(false);
    const [closingProjectId, setClosingProjectId] = useState<string | null>(null);

    // Persist projects state
    useEffect(() => {
        try {
            localStorage.setItem('hype_projects', JSON.stringify(projects));
        } catch (e) {
            console.error("Failed to save projects to storage", e);
        }
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
                // Deep clone to avoid mutations affecting the source preset
                newState = JSON.parse(JSON.stringify(found.initialState));
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

    const closingProject = closingProjectId ? projects.find(p => p.id === closingProjectId) : null;

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
                    <a href="https://github.com/doctect/doctect" target="_blank" rel="noopener noreferrer" className="text-slate-400 hover:text-slate-900 transition-colors" title="View on GitHub">
                        <Github size={18} />
                    </a>
                    <Link to="/docs" className="text-xs font-medium text-slate-500 hover:text-blue-600">
                        Docs
                    </Link>
                </div>
            </header>

            {/* Project Workspace Area */}
            <div className="flex-1 relative overflow-hidden bg-slate-100">
                {projects.map(project => (
                    <div
                        key={project.id}
                        className={clsx(
                            "absolute inset-0 w-full h-full",
                            project.id === activeProjectId ? "z-10 opacity-100" : "z-0 opacity-0 pointer-events-none"
                        )}
                    >
                        <ProjectEditor
                            projectId={project.id}
                            initialState={project.initialState}
                            isActive={project.id === activeProjectId}
                            onNameChange={(name) => handleUpdateProjectName(project.id, name)}
                            onStateChange={(state) => handleUpdateProjectState(project.id, state)}
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
