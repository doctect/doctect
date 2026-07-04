import React, { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Cloud, History, UploadCloud, Globe, GitPullRequest } from 'lucide-react';
import { useSession } from '../../lib/auth-client';
import { cloudApi, ApiError } from '../../services/cloudApi';
import { AppState } from '../../types';
import { HistoryModal } from './HistoryModal';
import { PublishModal } from './PublishModal';
import type { Project } from '../../pages/EditorPage';

interface CloudMenuProps {
    project: Project;
    onLinkCloud: (cloud: { projectId: string; lastSyncedCommitId: string }) => void;
    onRestoreState: (state: AppState) => void;
}

export function CloudMenu({ project, onLinkCloud, onRestoreState }: CloudMenuProps) {
    const { data: session } = useSession();
    const [open, setOpen] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [showHistory, setShowHistory] = useState(false);
    const [showPublish, setShowPublish] = useState(false);
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const onClick = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) { setOpen(false); setError(null); }
        };
        document.addEventListener('mousedown', onClick);
        return () => document.removeEventListener('mousedown', onClick);
    }, []);

    const saveToCloud = async () => {
        const message = window.prompt('Describe this save (commit message):', project.cloud ? 'Update' : 'Initial save');
        if (message === null) return;
        setBusy(true); setError(null);
        try {
            if (!project.cloud) {
                const res = await cloudApi.createProject({ name: project.name, state: project.initialState, message });
                onLinkCloud({ projectId: res.project.id, lastSyncedCommitId: res.commit.id });
            } else {
                const res = await cloudApi.saveCommit(project.cloud.projectId, { state: project.initialState, message });
                onLinkCloud({ projectId: project.cloud.projectId, lastSyncedCommitId: res.commit.id });
            }
            setOpen(false);
        } catch (e) {
            setError(e instanceof ApiError ? e.message : 'Save failed');
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="relative" ref={ref}>
            <button onClick={() => setOpen(o => !o)}
                className="flex items-center gap-1.5 text-xs font-medium text-slate-600 hover:text-blue-600" title="Cloud">
                <Cloud size={14} /> <span className="hidden md:inline">Cloud</span>
            </button>
            {open && (
                <div className="absolute right-0 top-7 bg-white border border-slate-200 rounded-lg shadow-lg py-1 z-50 min-w-[200px]">
                    {!session?.user ? (
                        <Link to="/login" className="block px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50">
                            Sign in to save to cloud
                        </Link>
                    ) : (
                        <>
                            <button disabled={busy} onClick={saveToCloud}
                                className="w-full text-left flex items-center gap-1.5 px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-50">
                                <UploadCloud size={12} /> {project.cloud ? 'Save to cloud' : 'Save to cloud (new)'}
                            </button>
                            {project.cloud && (
                                <button onClick={() => { setShowHistory(true); setOpen(false); }}
                                    className="w-full text-left flex items-center gap-1.5 px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50">
                                    <History size={12} /> Version history
                                </button>
                            )}
                            {project.cloud && (
                                <button onClick={() => { setShowPublish(true); setOpen(false); }}
                                    className="w-full text-left flex items-center gap-1.5 px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50">
                                    <Globe size={12} /> Publish to gallery…
                                </button>
                            )}
                            {/* Propose changes (Task 26) button is appended here in a later task */}
                            {error && <div className="px-3 py-1.5 text-xs text-red-600">{error}</div>}
                        </>
                    )}
                </div>
            )}
            {showHistory && project.cloud && (
                <HistoryModal
                    cloudProjectId={project.cloud.projectId}
                    onRestore={(state) => { onRestoreState(state); setShowHistory(false); }}
                    onClose={() => setShowHistory(false)}
                />
            )}
            {showPublish && project.cloud && (
                <PublishModal project={project} cloudProjectId={project.cloud.projectId}
                    onClose={() => setShowPublish(false)}
                    onPublished={() => { setShowPublish(false); window.alert('Published! View it in the Gallery.'); }} />
            )}
        </div>
    );
}
