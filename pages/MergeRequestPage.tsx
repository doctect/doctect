import React, { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { ArrowLeft, GitMerge, XCircle, AlertTriangle, Eye } from 'lucide-react';
import { cloudApi, MrDetail, ChangeSetDto, ApiError } from '../services/cloudApi';
import { AppHeader } from '../components/AppHeader';
import { GalleryLink } from '../components/gallery/GalleryLink';
import { computePageOrder } from '../services/pdfService';
import { generateThumbnails } from '../services/thumbnailService';
import { migrateState } from '../services/migration';

const statusStyles: Record<string, string> = {
    open: 'bg-green-100 text-green-700',
    merged: 'bg-purple-100 text-purple-700',
    closed: 'bg-slate-200 text-slate-600',
    conflicted: 'bg-red-100 text-red-700'
};

const statusGuidance = (status: string, isTargetOwner: boolean): string | null => {
    switch (status) {
        case 'open':
            return isTargetOwner
                ? 'You own the target project — review the changes below, then merge or close.'
                : 'Waiting for the project owner to review this merge request.';
        case 'conflicted':
            return "The target project has changed since this was proposed — it can't be merged as-is. Update your fork and propose the changes again.";
        case 'merged':
            return 'This merge request was merged into the target project.';
        case 'closed':
            return 'This merge request was closed without merging.';
        default:
            return null;
    }
};

function ChangeList({ cs }: { cs: ChangeSetDto }) {
    const rows: string[] = [];
    cs.variantsAdded.forEach(v => rows.push(`+ Variant added: ${v}`));
    cs.variantsRemoved.forEach(v => rows.push(`− Variant removed: ${v}`));
    Object.entries(cs.variantsRenamed).forEach(([v, n]) => rows.push(`~ Variant renamed: ${v} → "${n}"`));
    Object.entries(cs.templatesAdded).forEach(([v, ts]) => ts.forEach(t => rows.push(`+ Template added: ${v}/${t}`)));
    Object.entries(cs.templatesModified).forEach(([v, ts]) => ts.forEach(t => rows.push(`~ Template modified: ${v}/${t}`)));
    Object.entries(cs.templatesRemoved).forEach(([v, ts]) => ts.forEach(t => rows.push(`− Template removed: ${v}/${t}`)));
    if (cs.nodesChanged) rows.push('~ Page hierarchy (nodes) changed');
    if (rows.length === 0) return <div className="text-xs text-slate-400">No changes.</div>;
    return (
        <ul className="text-xs font-mono space-y-1">
            {rows.map((r, i) => (
                <li key={i} className={r.startsWith('+') ? 'text-green-700' : r.startsWith('−') ? 'text-red-700' : 'text-amber-700'}>{r}</li>
            ))}
        </ul>
    );
}

export function MergeRequestPage() {
    const { id } = useParams<{ id: string }>();
    const [detail, setDetail] = useState<MrDetail | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const [previews, setPreviews] = useState<{ before: string; after: string } | null>(null);
    const [rendering, setRendering] = useState(false);

    const load = useCallback(() => {
        if (!id) return;
        cloudApi.getMr(id).then(setDetail).catch(e => setError(e instanceof ApiError ? e.message : 'Not found'));
    }, [id]);
    useEffect(load, [load]);

    const merge = async () => {
        if (!id || !window.confirm('Merge these changes into your project? A new version will be created.')) return;
        setBusy(true); setError(null);
        try { await cloudApi.mergeMr(id); load(); }
        catch (e) { setError(e instanceof ApiError ? e.message : 'Merge failed'); }
        finally { setBusy(false); }
    };

    const close = async () => {
        if (!id || !window.confirm('Close this merge request without merging?')) return;
        setBusy(true);
        try { await cloudApi.closeMr(id); load(); } finally { setBusy(false); }
    };

    // Renders a before/after preview of the first page whose template the MR modifies.
    const renderPreviews = async () => {
        if (!detail?.diff || !detail.sourceState || !detail.targetState) return;
        setRendering(true);
        try {
            const modified = Object.values(detail.diff.source.templatesModified).flat();
            const added = Object.values(detail.diff.source.templatesAdded).flat();
            const interesting = new Set([...modified, ...added]);
            const srcState = migrateState(detail.sourceState);
            const tgtState = migrateState(detail.targetState);
            const order = computePageOrder(srcState);
            const pageNode = order.find(nid => interesting.has(srcState.nodes[nid]?.type)) ?? order[0];
            const [after] = await generateThumbnails(srcState, [pageNode]);
            const [before] = await generateThumbnails(tgtState, [pageNode]);
            setPreviews({ before: before ?? '', after: after ?? '' });
        } catch { setError('Preview rendering failed'); }
        finally { setRendering(false); }
    };

    if (error && !detail) return <div className="p-10 text-sm text-red-600">{error}</div>;
    if (!detail) return <div className="p-10 text-sm text-slate-400">Loading…</div>;
    const mr = detail.mergeRequest;
    // Server-computed (server/routes/mergeRequests.js's loadMrForParticipant) -- never re-derive
    // this from "am I not the author": that heuristic breaks when the same user is both the fork's
    // author and the target's owner (a self-fork), since they'd then genuinely be the author too.
    const isOwner = detail.isTargetOwner;
    const actionable = mr.status === 'open' || mr.status === 'conflicted';
    const guidance = statusGuidance(mr.status, isOwner);

    return (
        <div className="h-screen overflow-y-auto bg-slate-50">
            <AppHeader />
            <main className="max-w-3xl mx-auto p-6">
                <GalleryLink projectId={mr.targetProjectId} className="flex items-center gap-1 text-sm text-slate-600 hover:text-blue-600 mb-4">
                    <ArrowLeft size={14} /> {mr.targetProjectName}
                </GalleryLink>
                <div className="flex items-center gap-3">
                    <h1 className="text-xl font-bold text-slate-800">{mr.title}</h1>
                    <span className={`text-[10px] font-semibold rounded-full px-2 py-0.5 uppercase ${statusStyles[mr.status]}`}>{mr.status}</span>
                </div>
                <div className="text-xs text-slate-500 mt-1">
                    by {mr.authorUsername} · from <span className="font-mono">{mr.sourceProjectName}</span> · {new Date(mr.createdAt).toLocaleString()}
                </div>
                {guidance && <p className="text-sm text-slate-500 mt-1">{guidance}</p>}
                {mr.description && <p className="text-sm text-slate-600 mt-3 whitespace-pre-wrap">{mr.description}</p>}

                {detail.diff && (
                    <div className="bg-white border rounded-xl p-4 mt-5">
                        <h2 className="text-sm font-semibold text-slate-700 mb-2">Proposed changes</h2>
                        <ChangeList cs={detail.diff.source} />
                        {detail.diff.conflicts.length > 0 && (
                            <div className="mt-3 bg-red-50 border border-red-200 rounded p-3">
                                <div className="flex items-center gap-1 text-xs font-semibold text-red-700"><AlertTriangle size={12} /> Conflicts</div>
                                <ul className="text-xs text-red-600 mt-1 list-disc ml-4">
                                    {detail.diff.conflicts.map((c, i) => <li key={i}>{c.description}</li>)}
                                </ul>
                                <p className="text-[11px] text-red-500 mt-1">The fork author should fork the latest version again and re-apply their changes.</p>
                            </div>
                        )}
                        <div className="mt-3">
                            <button onClick={renderPreviews} disabled={rendering}
                                className="text-xs flex items-center gap-1 text-blue-600 hover:text-blue-800 disabled:opacity-50">
                                <Eye size={12} /> {rendering ? 'Rendering…' : 'Render before/after preview'}
                            </button>
                            {previews && (
                                <div className="grid grid-cols-2 gap-3 mt-3">
                                    <div><div className="text-[10px] text-slate-400 mb-1">Current (upstream)</div>
                                        {previews.before && <img src={previews.before} className="border rounded w-full" alt="before" />}</div>
                                    <div><div className="text-[10px] text-slate-400 mb-1">Proposed</div>
                                        {previews.after && <img src={previews.after} className="border rounded w-full" alt="after" />}</div>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {error && <div className="text-xs text-red-600 mt-3">{error}</div>}

                {actionable && (
                    <div className="flex gap-2 mt-5">
                        {isOwner && mr.status === 'open' && (
                            <button onClick={merge} disabled={busy}
                                className="flex items-center gap-1.5 bg-purple-600 text-white rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50">
                                <GitMerge size={14} /> Merge
                            </button>
                        )}
                        <button onClick={close} disabled={busy}
                            className="flex items-center gap-1.5 border border-slate-300 rounded-lg px-4 py-2 text-sm text-slate-700 disabled:opacity-50">
                            <XCircle size={14} /> Close
                        </button>
                    </div>
                )}
            </main>
        </div>
    );
}
