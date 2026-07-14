import React, { useMemo, useState } from 'react';
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

export function PublishModal({ project, cloudProjectId, onClose, onPublished }: PublishModalProps) {
    const [description, setDescription] = useState('');
    const [tagsText, setTagsText] = useState('');
    const [selected, setSelected] = useState<string[]>(() => computePageOrder(project.initialState).slice(0, 1));
    const [previews, setPreviews] = useState<string[]>([]);
    const [phase, setPhase] = useState<'form' | 'rendering' | 'uploading'>('form');
    const [error, setError] = useState<string | null>(null);

    const pages = useMemo(() => {
        const order = computePageOrder(project.initialState);
        return order.slice(0, 100).map(id => ({ id, title: project.initialState.nodes[id]?.title || id }));
    }, [project.initialState]);

    const toggle = (id: string) => {
        setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : (prev.length >= 4 ? prev : [...prev, id]));
    };

    const publish = async () => {
        if (selected.length === 0) { setError('Pick at least one page for the preview.'); return; }
        setError(null);
        try {
            setPhase('rendering');
            const thumbs = await generateThumbnails(project.initialState, selected, project.initialState.activeVariantId);
            setPreviews(thumbs);
            if (thumbs.length === 0) throw new Error('Could not render previews');
            setPhase('uploading');
            const tags = tagsText.split(',').map(t => t.trim().toLowerCase()).filter(Boolean).slice(0, 10);
            await cloudApi.publish(cloudProjectId, { description, tags, thumbnails: thumbs });
            onPublished();
        } catch (e) {
            setError(e instanceof ApiError ? e.message : (e as Error).message || 'Publish failed');
            setPhase('form');
        }
    };

    return (
        <div className="fixed inset-0 bg-black/40 z-[100] flex items-center justify-center" onClick={onClose}>
            <div className="bg-white rounded-xl shadow-2xl w-[560px] max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between px-4 py-3 border-b">
                    <h2 className="font-semibold text-slate-800 text-sm flex items-center gap-1.5"><Globe size={14} /> Publish to gallery</h2>
                    <button onClick={onClose} className="text-slate-400 hover:text-slate-700"><X size={16} /></button>
                </div>
                <div className="p-4 overflow-y-auto space-y-3 text-sm">
                    <p className="text-xs text-slate-500">
                        Publishing makes this project's latest cloud version and previews visible to everyone.
                        Make sure you've saved to cloud first.
                    </p>
                    {project.initialState.generator && (
                        <div role="alert" className="rounded border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
                            This project includes saved generator source. Publishing makes both scripts public. Review them for secrets, private comments, or identifying information. To exclude source, cancel, use “Detach Saved Generator” in Hierarchy Generator, and save to cloud before publishing.
                        </div>
                    )}
                    <label className="block">
                        <span className="text-xs font-medium text-slate-600">Description</span>
                        <textarea value={description} onChange={e => setDescription(e.target.value)} maxLength={2000}
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
                    {error && <div className="text-xs text-red-600">{error}</div>}
                </div>
                <div className="px-4 py-3 border-t flex justify-end gap-2">
                    <button onClick={onClose} className="text-xs px-3 py-1.5 rounded border text-slate-600">Cancel</button>
                    <button onClick={publish} disabled={phase !== 'form'}
                        className="text-xs px-3 py-1.5 rounded bg-blue-600 text-white disabled:opacity-50 flex items-center gap-1">
                        {phase !== 'form' && <Loader size={11} className="animate-spin" />}
                        {phase === 'rendering' ? 'Rendering previews…' : phase === 'uploading' ? 'Publishing…' : 'Publish'}
                    </button>
                </div>
            </div>
        </div>
    );
}
