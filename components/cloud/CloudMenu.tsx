import React, { useState, useRef, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Cloud, History, UploadCloud, Globe, GitPullRequest, Pencil } from 'lucide-react';
import { useSession } from '../../lib/auth-client';
import { cloudApi, ApiError, CloudProject } from '../../services/cloudApi';
import { AppState } from '../../types';
import { HistoryModal } from './HistoryModal';
import { PublishModal } from './PublishModal';
import { ProposeChangesModal } from './ProposeChangesModal';
import { LazyEditListingModal } from './LazyEditListingModal';
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
    const [showEditListing, setShowEditListing] = useState(false);
    const [showPropose, setShowPropose] = useState(false);
    const [cloudProject, setCloudProject] = useState<CloudProject | null>(null);
    const [saveConflict, setSaveConflict] = useState(false);
    const ref = useRef<HTMLDivElement>(null);
    const location = useLocation();
    const navigate = useNavigate();

    useEffect(() => {
        const onClick = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) { setOpen(false); setError(null); }
        };
        document.addEventListener('mousedown', onClick);
        return () => document.removeEventListener('mousedown', onClick);
    }, []);

    useEffect(() => {
        if (open && project.cloud && !cloudProject) {
            cloudApi.getProject(project.cloud.projectId).then(setCloudProject).catch(() => {});
        }
    }, [open, project.cloud, cloudProject]);

    const saveToCloud = async () => {
        const message = window.prompt('Describe this save (commit message):', project.cloud ? 'Update' : 'Initial save');
        if (message === null) return;
        setBusy(true); setError(null); setSaveConflict(false);
        try {
            if (!project.cloud) {
                const res = await cloudApi.createProject({ name: project.name, state: project.initialState, message });
                onLinkCloud({ projectId: res.project.id, lastSyncedCommitId: res.commit.id });
            } else {
                const res = await cloudApi.saveCommit(project.cloud.projectId, project.cloud.lastSyncedCommitId, { state: project.initialState, message });
                onLinkCloud({ projectId: project.cloud.projectId, lastSyncedCommitId: res.commit.id });
            }
            setOpen(false);
        } catch (e) {
            if (e instanceof ApiError && e.code === 'USERNAME_REQUIRED') {
                navigate('/welcome', { state: { from: location.pathname } });
                return;
            }
            if (e instanceof ApiError && e.code === 'PROJECT_HEAD_CHANGED') {
                setSaveConflict(true);
                setError('Cloud project changed since your last save. Local edits are unchanged.');
                return;
            }
            setError(e instanceof ApiError ? e.message : 'Save failed');
        } finally {
            setBusy(false);
        }
    };

    const reloadCloudVersion = async () => {
        if (!project.cloud) return;
        setBusy(true); setError(null);
        try {
            const latest = await cloudApi.getProject(project.cloud.projectId);
            if (!latest.headCommitId) throw new Error('Cloud project has no saved version.');
            const commit = await cloudApi.getCommit(project.cloud.projectId, latest.headCommitId);
            onRestoreState(commit.state);
            onLinkCloud({ projectId: project.cloud.projectId, lastSyncedCommitId: latest.headCommitId });
            setCloudProject(latest);
            setSaveConflict(false);
            setOpen(false);
        } catch (e) {
            setError(e instanceof ApiError ? e.message : 'Could not reload cloud version');
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
                        <Link to="/login" state={{ from: location.pathname }} className="block px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50">
                            Sign in to save to cloud
                        </Link>
                    ) : !session.user.username ? (
                        <Link to="/welcome" state={{ from: location.pathname }} className="block px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50">
                            Set a username to use cloud features
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
                            {cloudProject?.forkedFromProjectId && (
                                <Link to={`/gallery/${cloudProject.forkedFromProjectId}`}
                                    className="block px-3 py-1.5 text-[11px] text-slate-400 hover:bg-slate-50">
                                    ↳ forked from upstream — view source
                                </Link>
                            )}
                            {project.cloud && (
                                <button onClick={() => { setShowPublish(true); setOpen(false); }}
                                    className="w-full text-left flex items-center gap-1.5 px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50">
                                    <Globe size={12} /> Publish to gallery…
                                </button>
                            )}
                            {cloudProject?.visibility === 'public' && (
                                <button onClick={() => { setShowEditListing(true); setOpen(false); }}
                                    className="w-full text-left flex items-center gap-1.5 px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50">
                                    <Pencil size={12} /> Edit gallery listing…
                                </button>
                            )}
                            {cloudProject?.forkedFromProjectId && (
                                <button onClick={() => { setShowPropose(true); setOpen(false); }}
                                    className="w-full text-left flex items-center gap-1.5 px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50">
                                    <GitPullRequest size={12} /> Propose changes to upstream…
                                </button>
                            )}
                            {error && <div className="px-3 py-1.5 text-xs text-red-600">{error}</div>}
                            {saveConflict && (
                                <button disabled={busy} onClick={reloadCloudVersion}
                                    className="w-full text-left px-3 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-50 disabled:opacity-50">
                                    Reload cloud version
                                </button>
                            )}
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
            {showEditListing && project.cloud && (
                <LazyEditListingModal projectId={project.cloud.projectId}
                    onClose={() => setShowEditListing(false)}
                    onSaved={() => {
                        setShowEditListing(false);
                        // Dropping the cached project makes the menu refetch on its next open, so
                        // a listing edited and then unpublished elsewhere cannot keep offering
                        // this item from stale state.
                        setCloudProject(null);
                        window.alert('Listing updated. Your published version is unchanged.');
                    }} />
            )}
            {showPropose && project.cloud && (
                <ProposeChangesModal sourceProjectId={project.cloud.projectId} onClose={() => setShowPropose(false)} />
            )}
        </div>
    );
}
