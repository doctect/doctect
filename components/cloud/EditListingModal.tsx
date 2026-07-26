import React, { useEffect, useMemo, useRef, useState } from 'react';
import { X, Pencil, Loader } from 'lucide-react';
import { API_BASE, ApiError, cloudApi, GalleryDetail } from '../../services/cloudApi';
import { computePageOrder } from '../../services/pdfService';
import { generateThumbnails } from '../../services/thumbnailService';
import { PreviewPagePicker } from './PreviewPagePicker';
import type { AppState } from '../../types';

interface EditListingModalProps {
    projectId: string;
    onClose: () => void;
    /**
     * Fired once the listing has been written. The dialog does not close itself, so the host
     * must close or remount it from here. Keeping it mounted for a second save is NOT
     * supported: the initial selection it diffs against is captured at load and never
     * refreshed, so the next save would read an untouched selection as changed and re-render
     * and re-upload every preview -- the exact cost a tags-only edit exists to avoid.
     */
    onSaved: () => void;
}

type LoadState =
    | { status: 'loading' }
    // publishedCommitId is GalleryDetail.headCommitId, held separately because it is only
    // known to be non-null once the load has passed its own check — and it is the precondition
    // the save is refused without.
    | {
        status: 'ready'; listing: GalleryDetail; state: AppState;
        initialSelection: string[]; publishedCommitId: string;
    }
    | { status: 'error'; message: string };

const sameSelection = (a: string[], b: string[]) =>
    a.length === b.length && a.every((id, i) => id === b[i]);

// The route's own message names the cause; only the client can name the cure, because the
// cure is a UI action. Reloading the page is NOT it: the dialog snapshots the listing at
// load, so its fields still hold the pre-publish text until it is reopened.
const REPUBLISHED_MESSAGE =
    'This listing was republished while you were editing it, so nothing was saved. '
    + 'Close and reopen this dialog to edit the current version.';

export function EditListingModal({ projectId, onClose, onSaved }: EditListingModalProps) {
    const [load, setLoad] = useState<LoadState>({ status: 'loading' });
    const [description, setDescription] = useState('');
    const [tagsText, setTagsText] = useState('');
    const [selected, setSelected] = useState<string[]>([]);
    const [phase, setPhase] = useState<'form' | 'rendering' | 'saving'>('form');
    const [error, setError] = useState<string | null>(null);
    const [attempt, setAttempt] = useState(0);
    const dialogRef = useRef<HTMLDivElement>(null);
    const previousFocus = useRef<HTMLElement | null>(null);

    // The dialog itself takes focus rather than a field, because the form does not exist yet
    // while the listing loads -- and without focus inside it, the Escape handler below would
    // never see a keydown to act on.
    useEffect(() => {
        previousFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        dialogRef.current?.focus();
        return () => previousFocus.current?.focus();
    }, []);

    useEffect(() => {
        let cancelled = false;
        setLoad({ status: 'loading' });
        setError(null);
        (async () => {
            try {
                const listing = await cloudApi.galleryDetail(projectId);
                if (!listing.headCommitId) throw new Error('This listing has no published version.');
                const commit = await cloudApi.getCommit(projectId, listing.headCommitId);
                if (cancelled) return;
                // A preview published before migration 016 has no recorded source page,
                // so it cannot be pre-checked. Those listings open unchecked instead.
                const initialSelection = listing.previews
                    .map(p => p.nodeId)
                    .filter((id): id is string => !!id);
                setLoad({
                    status: 'ready',
                    listing,
                    state: commit.state as AppState,
                    initialSelection,
                    publishedCommitId: listing.headCommitId,
                });
                setDescription(listing.description);
                setTagsText(listing.tags.join(', '));
                setSelected(initialSelection);
            } catch (e) {
                if (!cancelled) {
                    setLoad({ status: 'error', message: e instanceof Error ? e.message : 'Could not load this listing.' });
                }
            }
        })();
        return () => { cancelled = true; };
    }, [projectId, attempt]);

    const pages = useMemo(() => {
        if (load.status !== 'ready') return [];
        return computePageOrder(load.state).slice(0, 100)
            .map(id => ({ id, title: load.state.nodes[id]?.title || id }));
    }, [load]);

    const legacyPreviews = load.status === 'ready' && load.initialSelection.length === 0
        ? load.listing.previews
        : [];

    const save = async () => {
        if (load.status !== 'ready') return;
        setError(null);
        const tags = tagsText.split(',').map(t => t.trim().toLowerCase()).filter(Boolean).slice(0, 10);
        let saved = false;
        try {
            // Left alone, the published previews are left alone: an untouched selection sends no
            // thumbnails at all, which the route reads as "keep them" -- so a tag fix costs no
            // render and no re-upload, and a legacy listing keeps images it could not pre-check.
            let thumbnails: string[] | undefined;
            let previewNodeIds: string[] | undefined;
            if (!sameSelection(selected, load.initialSelection)) {
                if (selected.length === 0) {
                    setError('Pick at least one preview page, or leave the current previews as they are.');
                    return;
                }
                setPhase('rendering');
                const rendered = await generateThumbnails(load.state, selected, load.state.activeVariantId);
                // The same short-render guard PublishModal uses, and it matters more here:
                // replaceThumbnails deletes the whole published set before inserting the new
                // one in a single transaction, and nothing snapshots thumbnails anywhere --
                // project_publications records only (project_id, commit_id, published_at). A
                // short render would therefore destroy live public images that were correct,
                // with no server-side copy to restore from. Subsumes the fully-empty case:
                // `selected` is non-empty by the check above. Thrown before the PATCH, so the
                // description and tags are untouched too.
                if (rendered.length !== selected.length) {
                    throw new Error(
                        `Only ${rendered.length} of ${selected.length} previews rendered. Nothing was changed — try again.`,
                    );
                }
                // Sent from the returned pairs, never zipped against `selected`: the renderer
                // is the authority on which page produced which image.
                thumbnails = rendered.map(r => r.dataUrl);
                previewNodeIds = rendered.map(r => r.nodeId);
            }
            setPhase('saving');
            await cloudApi.updatePublication(projectId, load.publishedCommitId,
                { description, tags, thumbnails, previewNodeIds });
            saved = true;
        } catch (e) {
            if (e instanceof ApiError && e.code === 'PUBLICATION_CHANGED') setError(REPUBLISHED_MESSAGE);
            else setError(e instanceof ApiError ? e.message : (e as Error).message || 'Could not save this listing.');
        } finally {
            // Interactive again either way: a rejected save has to leave a usable button behind,
            // and a successful one must not flash a dead one in the tick before the host closes.
            setPhase('form');
        }
        // Outside the try on purpose: a host callback that navigates or refetches and throws is
        // not a failed save, and must not be reported as one after the PATCH already landed.
        if (saved) onSaved();
    };

    const handleDialogKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
        if (event.key === 'Escape') {
            event.preventDefault();
            // Stops the NATIVE event too (React's stopPropagation forwards to it), which is
            // what actually matters: React's delegated listener sits on the app root, so
            // without this the key carries on up to `document` -- where GalleryDetailModal
            // has an Escape handler that calls navigate(-1). One press would then close this
            // dialog AND navigate the gallery page away, taking the unsaved edits with it.
            event.stopPropagation();
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
        // `event.currentTarget` covers the dialog container itself, which is where mount focus
        // lands: it is neither `first` nor `last`, so without it the first Shift+Tab of the
        // dialog's life falls straight out to whatever precedes the modal in document order.
        if (event.shiftKey && (document.activeElement === first || document.activeElement === event.currentTarget)) {
            event.preventDefault();
            last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first.focus();
        }
    };

    return (
        <div className="fixed inset-0 bg-black/40 z-[100] flex items-center justify-center" onClick={onClose}>
            <div ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="edit-listing-title"
                className="bg-white rounded-xl shadow-2xl w-[560px] max-h-[80vh] flex flex-col outline-none"
                onClick={e => e.stopPropagation()} onKeyDown={handleDialogKeyDown}>
                <div className="flex items-center justify-between px-4 py-3 border-b">
                    <h2 id="edit-listing-title" className="font-semibold text-slate-800 text-sm flex items-center gap-1.5">
                        <Pencil size={14} /> Edit gallery listing
                    </h2>
                    <button type="button" aria-label="Close edit listing dialog" onClick={onClose}
                        className="text-slate-400 hover:text-slate-700"><X size={16} /></button>
                </div>
                <div className="p-4 overflow-y-auto space-y-3 text-sm">
                    <p className="text-xs text-slate-500">
                        This changes what visitors see on the gallery page. It does not publish a newer
                        version of your project, and it will not move it back to the top of "recently updated."
                    </p>
                    {load.status === 'loading' && (
                        <div role="status" className="rounded border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600 flex items-center gap-2">
                            <Loader size={12} className="animate-spin" /> Loading listing…
                        </div>
                    )}
                    {load.status === 'error' && (
                        <div role="alert" className="rounded border border-red-200 bg-red-50 p-3 text-xs text-red-700 flex items-center justify-between gap-3">
                            <span>{load.message}</span>
                            <button type="button" onClick={() => setAttempt(v => v + 1)} className="font-semibold hover:text-red-900">Retry</button>
                        </div>
                    )}
                    {load.status === 'ready' && (
                        <>
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
                            {legacyPreviews.length > 0 && (
                                <div>
                                    <span className="text-xs font-medium text-slate-600">Current previews</span>
                                    <p className="text-[10px] text-slate-400">
                                        These were published before we started recording which page each preview came from.
                                        Leave the list below untouched to keep them, or pick pages to replace the whole set.
                                    </p>
                                    <div className="flex gap-2 mt-1">
                                        {legacyPreviews.map(p => (
                                            <img key={p.id} src={`${API_BASE}/api/thumbnails/${p.id}`} alt="" className="h-20 border rounded" />
                                        ))}
                                    </div>
                                </div>
                            )}
                            <PreviewPagePicker pages={pages} selected={selected} onChange={setSelected} />
                        </>
                    )}
                    {error && <div role="alert" className="text-xs text-red-600">{error}</div>}
                </div>
                <div className="px-4 py-3 border-t flex justify-end gap-2">
                    <button onClick={onClose} className="text-xs px-3 py-1.5 rounded border text-slate-600">Cancel</button>
                    <button onClick={save} disabled={phase !== 'form' || load.status !== 'ready'}
                        className="text-xs px-3 py-1.5 rounded bg-blue-600 text-white disabled:opacity-50 flex items-center gap-1">
                        {phase !== 'form' && <Loader size={11} className="animate-spin" />}
                        {phase === 'rendering' ? 'Rendering previews…' : phase === 'saving' ? 'Saving…' : 'Save changes'}
                    </button>
                </div>
            </div>
        </div>
    );
}
