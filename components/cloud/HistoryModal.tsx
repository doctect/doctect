import React, { useEffect, useState } from 'react';
import { X, RotateCcw, ExternalLink } from 'lucide-react';
import { cloudApi, CommitMeta, ApiError } from '../../services/cloudApi';
import { loadProjectState } from '../../services/loadProjectState';
import { IMPORT_STAGE_ERROR_MESSAGE } from '../../services/importProject';
import type { AppState } from '../../types';

type HistoryModalProps =
    { cloudProjectId: string; onClose: () => void } &
    (
        | { mode?: 'restore'; onRestore: (state: AppState) => void }
        | { mode: 'clone'; onClone: (args: { state: unknown }) => Promise<void> }
    );

export function HistoryModal(props: HistoryModalProps) {
    const { cloudProjectId, onClose } = props;
    const isClone = props.mode === 'clone';
    const [commits, setCommits] = useState<CommitMeta[] | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [busyId, setBusyId] = useState<string | null>(null);

    useEffect(() => {
        cloudApi.listCommits(cloudProjectId)
            .then(setCommits)
            .catch(e => setError(e instanceof ApiError ? e.message : 'Failed to load history'));
    }, [cloudProjectId]);

    const select = async (commitId: string) => {
        // Restoring overwrites whatever's currently open in the editor, so it gets a confirm
        // dialog; cloning always creates a brand-new local project and touches nothing the
        // viewer already has open, so it doesn't need one.
        if (props.mode !== 'clone' && !window.confirm('Replace the current editor contents with this version? (Unsaved local changes will be lost — your cloud history is untouched.)')) return;
        setBusyId(commitId); setError(null);
        try {
            const commit = await cloudApi.getCommit(cloudProjectId, commitId);
            if (props.mode === 'clone') {
                try {
                    await props.onClone({ state: commit.state });
                } catch {
                    setError(IMPORT_STAGE_ERROR_MESSAGE);
                }
            } else {
                const loaded = loadProjectState(commit.state);
                props.onRestore(loaded.state);
                if (loaded.warnings.length > 0) window.alert(loaded.warnings.join('\n'));
            }
        } catch (e) {
            setError(e instanceof ApiError ? e.message : (props.mode === 'clone' ? 'Could not open this version' : 'Restore failed'));
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
                    {error && <div role="alert" className="text-xs text-red-600 p-2">{error}</div>}
                    {!commits && !error && <div className="text-xs text-slate-400 p-2">Loading…</div>}
                    {commits?.map((c, i) => (
                        <div key={c.id} className="flex items-center justify-between gap-2 px-2 py-2 rounded hover:bg-slate-50">
                            <div className="min-w-0">
                                <div className="text-xs font-medium text-slate-800 truncate">
                                    {c.message} {i === 0 && <span className="text-[10px] text-green-600 font-semibold ml-1">HEAD</span>}
                                </div>
                                <div className="text-[10px] text-slate-400">{new Date(c.createdAt).toLocaleString()}</div>
                            </div>
                            <button disabled={busyId !== null} onClick={() => select(c.id)}
                                className="flex items-center gap-1 text-[11px] text-blue-600 hover:text-blue-800 disabled:opacity-50 flex-shrink-0">
                                {isClone ? <ExternalLink size={11} /> : <RotateCcw size={11} />}
                                {' '}{busyId === c.id ? 'Loading…' : (isClone ? 'Open in editor' : 'Restore')}
                            </button>
                        </div>
                    ))}
                    {commits?.length === 0 && <div className="text-xs text-slate-400 p-2">No versions yet.</div>}
                </div>
            </div>
        </div>
    );
}
