import React, { useEffect, useState } from 'react';
import { X, RotateCcw } from 'lucide-react';
import { cloudApi, CommitMeta, ApiError } from '../../services/cloudApi';
import { migrateState } from '../../services/migration';
import { AppState } from '../../types';

interface HistoryModalProps {
    cloudProjectId: string;
    onRestore: (state: AppState) => void;
    onClose: () => void;
}

export function HistoryModal({ cloudProjectId, onRestore, onClose }: HistoryModalProps) {
    const [commits, setCommits] = useState<CommitMeta[] | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [busyId, setBusyId] = useState<string | null>(null);

    useEffect(() => {
        cloudApi.listCommits(cloudProjectId)
            .then(setCommits)
            .catch(e => setError(e instanceof ApiError ? e.message : 'Failed to load history'));
    }, [cloudProjectId]);

    const restore = async (commitId: string) => {
        if (!window.confirm('Replace the current editor contents with this version? (Unsaved local changes will be lost — your cloud history is untouched.)')) return;
        setBusyId(commitId); setError(null);
        try {
            const commit = await cloudApi.getCommit(cloudProjectId, commitId);
            onRestore(migrateState(commit.state));
        } catch (e) {
            setError(e instanceof ApiError ? e.message : 'Restore failed');
        } finally {
            setBusyId(null);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/40 z-[100] flex items-center justify-center" onClick={onClose}>
            <div className="bg-white rounded-xl shadow-2xl w-[480px] max-h-[70vh] flex flex-col" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between px-4 py-3 border-b">
                    <h2 className="font-semibold text-slate-800 text-sm">Version history</h2>
                    <button onClick={onClose} className="text-slate-400 hover:text-slate-700"><X size={16} /></button>
                </div>
                <div className="overflow-y-auto p-2">
                    {error && <div className="text-xs text-red-600 p-2">{error}</div>}
                    {!commits && !error && <div className="text-xs text-slate-400 p-2">Loading…</div>}
                    {commits?.map((c, i) => (
                        <div key={c.id} className="flex items-center justify-between gap-2 px-2 py-2 rounded hover:bg-slate-50">
                            <div className="min-w-0">
                                <div className="text-xs font-medium text-slate-800 truncate">
                                    {c.message} {i === 0 && <span className="text-[10px] text-green-600 font-semibold ml-1">HEAD</span>}
                                </div>
                                <div className="text-[10px] text-slate-400">{new Date(c.createdAt).toLocaleString()}</div>
                            </div>
                            <button disabled={busyId !== null} onClick={() => restore(c.id)}
                                className="flex items-center gap-1 text-[11px] text-blue-600 hover:text-blue-800 disabled:opacity-50 flex-shrink-0">
                                <RotateCcw size={11} /> {busyId === c.id ? 'Loading…' : 'Restore'}
                            </button>
                        </div>
                    ))}
                    {commits?.length === 0 && <div className="text-xs text-slate-400 p-2">No versions yet.</div>}
                </div>
            </div>
        </div>
    );
}
