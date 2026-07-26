import React, { Suspense, lazy } from 'react';

// EditListingModal statically imports services/thumbnailService, which pulls in pdfjs-dist and
// sets its worker at module scope -- so it cannot be tree-shaken back out. Loading it lazily
// keeps it, and that library, off the gallery and my-projects routes, which have no other reason
// to carry either. (The editor already bundles pdfjs via PublishModal; the point is that these
// routes must not become a second, independent reason it can never be split out again.)
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

export function LazyEditListingModal(props: LazyEditListingModalProps) {
    return (
        <Suspense fallback={
            <div role="status" className="fixed inset-0 bg-black/40 z-[100] flex items-center justify-center text-white text-sm">
                Loading editor…
            </div>
        }>
            <EditListingModal {...props} />
        </Suspense>
    );
}
