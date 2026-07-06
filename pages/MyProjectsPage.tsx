import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Trash2, Globe, Lock } from 'lucide-react';
import { cloudApi, MyProject, StorageUsage } from '../services/cloudApi';

const formatMB = (bytes: number) => `${(bytes / (1024 * 1024)).toFixed(1)} MB`;

export function MyProjectsPage() {
    const [projects, setProjects] = useState<MyProject[] | null>(null);
    const [usage, setUsage] = useState<StorageUsage | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [deletingId, setDeletingId] = useState<string | null>(null);

    const load = useCallback(async () => {
        try {
            const res = await cloudApi.listProjects();
            setProjects(res.projects);
            setUsage(res.usage);
            setError(null);
        } catch (e: any) {
            setError(e?.message || 'Failed to load projects');
        }
    }, []);

    useEffect(() => { load(); }, [load]);

    const onDelete = async (p: MyProject) => {
        const ok = window.confirm(
            `Delete "${p.name}" and all ${p.commitCount} of its saved versions? This cannot be undone.`
        );
        if (!ok) return;
        setDeletingId(p.id);
        try {
            await cloudApi.deleteProject(p.id);
            await load();
        } catch (e: any) {
            setError(e?.message || 'Failed to delete project');
        } finally {
            setDeletingId(null);
        }
    };

    const pct = usage ? Math.min(100, Math.round((usage.usedBytes / usage.quotaBytes) * 100)) : 0;

    return (
        <div className="min-h-screen bg-slate-50">
            <header className="h-14 bg-white border-b flex items-center px-6 gap-4">
                <Link to="/gallery" className="flex items-center gap-1 text-sm text-slate-600 hover:text-blue-600"><ArrowLeft size={14} /> Gallery</Link>
            </header>
            <main className="max-w-2xl mx-auto p-6">
                <h1 className="text-xl font-bold text-slate-800 mb-1">My projects</h1>
                <p className="text-sm text-slate-500 mb-4">Your cloud-saved projects. Delete old ones to free up storage.</p>

                {error && <div className="mb-4 p-3 bg-red-50 text-red-700 rounded text-sm">{error}</div>}

                {usage && (
                    <div className="mb-6">
                        <div className="flex justify-between text-xs text-slate-500 mb-1">
                            <span>{formatMB(usage.usedBytes)} of {formatMB(usage.quotaBytes)} used</span>
                            <span>{pct}%</span>
                        </div>
                        <div className="h-2 bg-slate-200 rounded-full overflow-hidden">
                            <div
                                className={`h-full rounded-full ${pct >= 90 ? 'bg-red-500' : 'bg-blue-500'}`}
                                style={{ width: `${pct}%` }}
                            />
                        </div>
                    </div>
                )}

                {projects === null ? (
                    <div className="p-10 flex justify-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div></div>
                ) : projects.length === 0 ? (
                    <p className="text-sm text-slate-500">No cloud projects yet. Save one from the editor's Cloud menu.</p>
                ) : (
                    <ul className="space-y-2">
                        {projects.map(p => (
                            <li key={p.id} className="bg-white border border-slate-200 rounded-lg p-4 flex items-center gap-4">
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2">
                                        <span className="font-medium text-slate-800 truncate">{p.name}</span>
                                        <span className={`inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full ${p.visibility === 'public' ? 'bg-green-50 text-green-700' : 'bg-slate-100 text-slate-500'}`}>
                                            {p.visibility === 'public' ? <Globe size={10} /> : <Lock size={10} />}
                                            {p.visibility}
                                        </span>
                                    </div>
                                    <div className="text-xs text-slate-500 mt-0.5">
                                        {formatMB(p.storedBytes)} · {p.commitCount} versions · updated {new Date(p.updatedAt).toLocaleDateString()}
                                    </div>
                                </div>
                                <button
                                    onClick={() => onDelete(p)}
                                    disabled={deletingId === p.id}
                                    className="flex items-center gap-1 text-xs text-red-600 hover:text-red-700 disabled:opacity-50"
                                >
                                    <Trash2 size={12} /> Delete
                                </button>
                            </li>
                        ))}
                    </ul>
                )}
            </main>
        </div>
    );
}
