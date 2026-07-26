import React, { Suspense, lazy, useEffect } from 'react';

// EditListingModal statically imports services/thumbnailService, which pulls in pdfjs-dist and
// sets its worker at module scope -- so it cannot be tree-shaken back out.
//
// What this boundary is worth, measured against a production build rather than reasoned from
// the import graph: `dist/` holds one 2.65 MB `index-*.js`, a lazy docs chunk, and this modal's
// own `EditListingModal-*.js` at 6,355 bytes -- whose only import is `./index-*.js`, the
// renderer and the preview picker included. App.tsx imports every page statically, so there is
// no route-level splitting: `index` is what /gallery and /my-projects load either way, and
// pdfjs is already in it via EditorPage -> CloudMenu -> PublishModal. So this removes pdfjs
// from no route today. What it does do is keep the modal's own code out of the entry chunk,
// and stop the gallery and my-projects routes from becoming a SECOND, independent static
// importer of the renderer -- which would pin pdfjs to them even after a future route split of
// the editor. That split is the change that would genuinely get the rasteriser off /gallery.
const EditListingModal = lazy(() =>
    import('./EditListingModal').then(m => ({ default: m.EditListingModal })));

export interface LazyEditListingModalProps {
    projectId: string;
    onClose: () => void;
    /**
     * Fired once the listing has been written. See EditListingModal: the dialog does not close
     * itself, and every host must close or remount it from here rather than leave it open.
     */
    onSaved: () => void;
}

// Escape is bound on `document` in the CAPTURE phase and stops there. On the /gallery/:id
// route these overlays sit inside GalleryDetailModal, whose own document-level (bubbling)
// handler calls navigate(-1); capturing first and stopping propagation means one press
// dismisses the overlay only, instead of also navigating the page away underneath it.
// Deliberately does not move focus: EditListingModal captures document.activeElement on mount
// so it can hand focus back on close, and an overlay that grabbed focus first would leave it
// with nothing but document.body to restore.
function useDismissOnEscape(onClose: () => void) {
    useEffect(() => {
        const onKey = (event: KeyboardEvent) => {
            if (event.key !== 'Escape') return;
            event.preventDefault();
            event.stopPropagation();
            onClose();
        };
        document.addEventListener('keydown', onKey, true);
        return () => document.removeEventListener('keydown', onKey, true);
    }, [onClose]);
}

// A full-screen overlay with no way out is a trap if the chunk is slow or never arrives, so
// this one closes on a backdrop click and on Escape like the dialog it stands in for.
function LoadingOverlay({ onClose }: { onClose: () => void }) {
    useDismissOnEscape(onClose);
    return (
        <div role="status" onClick={onClose}
            className="fixed inset-0 bg-black/40 z-[100] flex items-center justify-center text-white text-sm">
            Loading editor…
        </div>
    );
}

function ChunkErrorOverlay({ error, onClose }: { error: Error; onClose: () => void }) {
    useDismissOnEscape(onClose);
    return (
        <div className="fixed inset-0 bg-black/40 z-[100] flex items-center justify-center p-4" onClick={onClose}>
            <div role="alert" onClick={e => e.stopPropagation()}
                className="bg-white rounded-xl shadow-2xl w-[420px] p-5 text-sm text-slate-700">
                <h2 className="font-semibold text-slate-800 mb-1">Edit gallery listing</h2>
                <p>The listing editor could not be loaded. This usually means the app was updated while
                    this page was open — reloading picks up the new version. Nothing about your listing
                    has changed.</p>
                <p className="text-xs text-slate-400 mt-2 font-mono break-words">{error.message}</p>
                <div className="flex justify-end gap-2 mt-4">
                    <button type="button" onClick={onClose} className="text-xs px-3 py-1.5 rounded border text-slate-600">Close</button>
                    <button type="button" onClick={() => window.location.reload()}
                        className="text-xs px-3 py-1.5 rounded bg-blue-600 text-white">Reload</button>
                </div>
            </div>
        </div>
    );
}

// Same shape as the app-level components/ErrorBoundary -- a class component, because React
// supports boundaries only through getDerivedStateFromError/componentDidCatch -- but scoped to
// this dialog. Without it a chunk-load rejection, the routine consequence of a stale index.html
// after a deploy, reaches the app-level boundary and replaces the whole app over one optional
// dialog. React caches a rejected lazy payload, so retrying in place would fail forever; close
// and reload are the only two offers that are actually true.
class EditListingChunkBoundary extends React.Component<
    { onClose: () => void; children: React.ReactNode },
    { error: Error | null }
> {
    state: { error: Error | null } = { error: null };

    static getDerivedStateFromError(error: Error) {
        return { error };
    }

    componentDidCatch(error: Error, info: React.ErrorInfo) {
        console.error('Edit listing dialog failed to load:', error, info.componentStack);
    }

    render() {
        if (this.state.error) {
            return <ChunkErrorOverlay error={this.state.error} onClose={this.props.onClose} />;
        }
        return this.props.children;
    }
}

export function LazyEditListingModal(props: LazyEditListingModalProps) {
    return (
        <EditListingChunkBoundary onClose={props.onClose}>
            <Suspense fallback={<LoadingOverlay onClose={props.onClose} />}>
                <EditListingModal {...props} />
            </Suspense>
        </EditListingChunkBoundary>
    );
}
