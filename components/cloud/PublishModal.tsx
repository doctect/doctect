import React, { useEffect, useMemo, useRef, useState } from 'react';
import { X, Globe, Loader } from 'lucide-react';
import { cloudApi, ApiError } from '../../services/cloudApi';
import { computePageOrder } from '../../services/pdfService';
import { generateThumbnails } from '../../services/thumbnailService';
import type { Project } from '../../pages/EditorPage';

interface PublishModalProps {
    project: Project;
    cloudProjectId: string;
    onClose: () => void;
    onPublished: () => void;
}

type DisclosureState =
    | { status: 'loading'; projectId: string }
    | { status: 'ready'; projectId: string; headCommitId: string; state: Project['initialState']; hasGenerator: boolean }
    | { status: 'error'; projectId: string; message: string };

export function PublishModal({ project, cloudProjectId, onClose, onPublished }: PublishModalProps) {
    const [description, setDescription] = useState('');
    const [tagsText, setTagsText] = useState('');
    const [selected, setSelected] = useState<string[]>([]);
    const [previews, setPreviews] = useState<string[]>([]);
    const [phase, setPhase] = useState<'form' | 'rendering' | 'uploading'>('form');
    const [error, setError] = useState<string | null>(null);
    const [disclosure, setDisclosure] = useState<DisclosureState>({ status: 'loading', projectId: cloudProjectId });
    const [disclosureAttempt, setDisclosureAttempt] = useState(0);
    const currentProjectId = useRef(cloudProjectId);
    const descriptionRef = useRef<HTMLTextAreaElement>(null);
    const previousFocus = useRef<HTMLElement | null>(null);
    currentProjectId.current = cloudProjectId;

    useEffect(() => {
        previousFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        descriptionRef.current?.focus();
        return () => previousFocus.current?.focus();
    }, []);

    useEffect(() => {
        setDescription('');
        setTagsText('');
        setSelected([]);
        setPreviews([]);
        setPhase('form');
        setError(null);
    }, [cloudProjectId]);

    useEffect(() => {
        let cancelled = false;
        setDisclosure({ status: 'loading', projectId: cloudProjectId });
        setPhase('form');
        setError(null);
        const loadDisclosure = async () => {
            try {
                const cloudProject = await cloudApi.getProject(cloudProjectId);
                if (!cloudProject.headCommitId) throw new Error('Cloud project has no head commit.');
                const head = await cloudApi.getCommit(cloudProjectId, cloudProject.headCommitId);
                if (!cancelled) {
                    const state = head.state as Project['initialState'];
                    setDisclosure({
                        status: 'ready',
                        projectId: cloudProjectId,
                        headCommitId: cloudProject.headCommitId,
                        state,
                        hasGenerator: state.generator !== undefined,
                    });
                    setSelected(computePageOrder(state).slice(0, 1));
                }
            } catch (e) {
                if (!cancelled) {
                    const message = e instanceof Error ? e.message : 'Could not inspect cloud source disclosure.';
                    setDisclosure({ status: 'error', projectId: cloudProjectId, message });
                }
            }
        };
        loadDisclosure();
        return () => { cancelled = true; };
    }, [cloudProjectId, disclosureAttempt]);

    const pages = useMemo(() => {
        if (disclosure.status !== 'ready' || disclosure.projectId !== cloudProjectId) return [];
        const order = computePageOrder(disclosure.state);
        return order.slice(0, 100).map(id => ({ id, title: disclosure.state.nodes[id]?.title || id }));
    }, [cloudProjectId, disclosure]);

    const toggle = (id: string) => {
        setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : (prev.length >= 4 ? prev : [...prev, id]));
    };

    const publish = async () => {
        const inspected = disclosure.status === 'ready' && disclosure.projectId === cloudProjectId ? disclosure : null;
        if (!inspected || currentProjectId.current !== cloudProjectId) return;
        if (selected.length === 0) { setError('Pick at least one page for the preview.'); return; }
        setError(null);
        try {
            setPhase('rendering');
            const thumbs = await generateThumbnails(inspected.state, selected, inspected.state.activeVariantId);
            if (currentProjectId.current !== cloudProjectId) return;
            setPreviews(thumbs);
            if (thumbs.length === 0) throw new Error('Could not render previews');
            setPhase('uploading');
            const tags = tagsText.split(',').map(t => t.trim().toLowerCase()).filter(Boolean).slice(0, 10);
            await cloudApi.publish(cloudProjectId, inspected.headCommitId, { description, tags, thumbnails: thumbs });
            if (currentProjectId.current === cloudProjectId) onPublished();
        } catch (e) {
            if (currentProjectId.current !== cloudProjectId) return;
            if (e instanceof ApiError && e.code === 'PROJECT_HEAD_CHANGED') {
                setDisclosure({ status: 'loading', projectId: cloudProjectId });
                setDisclosureAttempt(value => value + 1);
            }
            setError(e instanceof ApiError ? e.message : (e as Error).message || 'Publish failed');
            setPhase('form');
        }
    };

    const hasCurrentDisclosure = disclosure.status === 'ready' && disclosure.projectId === cloudProjectId;

    const handleDialogKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
        if (event.key === 'Escape') {
            event.preventDefault();
            onClose();
            return;
        }
        if (event.key !== 'Tab') return;
        const focusable = Array.from(event.currentTarget.querySelectorAll<HTMLElement>(
            'button:not([disabled]), textarea:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ));
        if (focusable.length === 0) {
            event.preventDefault();
            return;
        }
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first.focus();
        }
    };

    return (
        <div className="fixed inset-0 bg-black/40 z-[100] flex items-center justify-center" onClick={onClose}>
            <div role="dialog" aria-modal="true" aria-labelledby="publish-dialog-title"
                className="bg-white rounded-xl shadow-2xl w-[560px] max-h-[80vh] flex flex-col"
                onClick={e => e.stopPropagation()} onKeyDown={handleDialogKeyDown}>
                <div className="flex items-center justify-between px-4 py-3 border-b">
                    <h2 id="publish-dialog-title" className="font-semibold text-slate-800 text-sm flex items-center gap-1.5"><Globe size={14} /> Publish to gallery</h2>
                    <button type="button" aria-label="Close publish dialog" onClick={onClose} className="text-slate-400 hover:text-slate-700"><X size={16} /></button>
                </div>
                <div className="p-4 overflow-y-auto space-y-3 text-sm">
                    <p className="text-xs text-slate-500">
                        Publishing makes this project's latest cloud version and previews visible to everyone.
                        Make sure you've saved to cloud first.
                    </p>
                    {(disclosure.projectId !== cloudProjectId || disclosure.status === 'loading') && (
                        <div role="status" className="rounded border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600 flex items-center gap-2">
                            <Loader size={12} className="animate-spin" /> Checking cloud source disclosure…
                        </div>
                    )}
                    {disclosure.status === 'error' && disclosure.projectId === cloudProjectId && (
                        <div role="alert" className="rounded border border-red-200 bg-red-50 p-3 text-xs text-red-700 flex items-center justify-between gap-3">
                            <span>{disclosure.message}</span>
                            <button type="button" onClick={() => setDisclosureAttempt(value => value + 1)} className="font-semibold hover:text-red-900">
                                Retry
                            </button>
                        </div>
                    )}
                    {hasCurrentDisclosure && disclosure.hasGenerator && (
                        <div role="alert" className="rounded border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
                            This project includes saved generator source. Publishing makes both scripts public. Review them for secrets, private comments, or identifying information.
                        </div>
                    )}
                    <label className="block">
                        <span className="text-xs font-medium text-slate-600">Description</span>
                        <textarea ref={descriptionRef} value={description} onChange={e => setDescription(e.target.value)} maxLength={2000}
                            className="mt-1 w-full border rounded p-2 text-xs" rows={3} placeholder="What is this planner for?" />
                    </label>
                    <label className="block">
                        <span className="text-xs font-medium text-slate-600">Tags (comma-separated)</span>
                        <input value={tagsText} onChange={e => setTagsText(e.target.value)}
                            className="mt-1 w-full border rounded p-2 text-xs" placeholder="planner, 2026, remarkable" />
                    </label>
                    <div>
                        <span className="text-xs font-medium text-slate-600">Preview pages (up to 4)</span>
                        <div className="mt-1 max-h-40 overflow-y-auto border rounded divide-y">
                            {pages.map(p => (
                                <label key={p.id} className="flex items-center gap-2 px-2 py-1.5 text-xs hover:bg-slate-50 cursor-pointer">
                                    <input type="checkbox" checked={selected.includes(p.id)} onChange={() => toggle(p.id)} />
                                    <span className="truncate">{p.title}</span>
                                </label>
                            ))}
                        </div>
                    </div>
                    {previews.length > 0 && (
                        <div className="flex gap-2">
                            {previews.map((src, i) => <img key={i} src={src} alt={`Preview ${i + 1}`} className="h-24 border rounded" />)}
                        </div>
                    )}
                    {error && <div role="alert" className="text-xs text-red-600">{error}</div>}
                </div>
                <div className="px-4 py-3 border-t flex justify-end gap-2">
                    <button onClick={onClose} className="text-xs px-3 py-1.5 rounded border text-slate-600">Cancel</button>
                    <button onClick={publish} disabled={phase !== 'form' || !hasCurrentDisclosure}
                        className="text-xs px-3 py-1.5 rounded bg-blue-600 text-white disabled:opacity-50 flex items-center gap-1">
                        {phase !== 'form' && <Loader size={11} className="animate-spin" />}
                        {phase === 'rendering' ? 'Rendering previews…' : phase === 'uploading' ? 'Publishing…' : 'Publish'}
                    </button>
                </div>
            </div>
        </div>
    );
}
