import React, { useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { X } from 'lucide-react';
import { useGalleryDetail } from '../../hooks/useGalleryDetail';
import { GalleryDetailBody } from './GalleryDetailBody';

export function GalleryDetailModal() {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const detail = useGalleryDetail(id);

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') navigate(-1); };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [navigate]);

    return (
        <div data-testid="modal-backdrop" className="fixed inset-0 bg-black/40 z-[90] flex items-center justify-center p-4" onClick={() => navigate(-1)}>
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto relative" onClick={e => e.stopPropagation()}>
                <button onClick={() => navigate(-1)} aria-label="Close" className="absolute top-3 right-3 text-slate-400 hover:text-slate-700 z-10">
                    <X size={18} />
                </button>
                <div className="p-6">
                    {detail.error && <div className="text-sm text-red-600">{detail.error}</div>}
                    {!detail.error && !detail.project && <div className="text-sm text-slate-400 text-center py-10">Loading…</div>}
                    {detail.project && (
                        <div className="grid md:grid-cols-2 gap-8">
                            <GalleryDetailBody detail={detail} />
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
