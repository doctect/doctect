import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sparkles } from 'lucide-react';
import { cloudApi, GalleryItem } from '../../services/cloudApi';
import { IMPORT_STAGE_ERROR_MESSAGE, stageImport } from '../../services/importProject';
import { GalleryLink } from './GalleryLink';
import { RollingPreview } from './RollingPreview';
import { StarRating } from './StarRating';

export function Spotlight({ item }: { item: GalleryItem }) {
    const navigate = useNavigate();
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Same sequence as useGalleryDetail.openInEditor — anonymous clone into the local editor.
    const openInEditor = async () => {
        setBusy(true);
        setError(null);
        try {
            const res = await cloudApi.galleryState(item.id);
            await stageImport({ name: res.name, state: res.state });
            navigate('/app');
        } catch {
            setError(IMPORT_STAGE_ERROR_MESSAGE);
            setBusy(false);
        }
    };

    return (
        <section className="flex flex-col md:flex-row gap-6 bg-white border rounded-xl p-5 mb-8">
            <RollingPreview thumbnailIds={item.thumbnailIds} alt={item.name} autoPlay intervalMs={2000}
                className="md:w-72 aspect-[3/4] bg-slate-100 rounded-lg overflow-hidden shrink-0"
                imgClassName="w-full h-full object-contain" />
            <div className="flex flex-col min-w-0">
                <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-blue-600 mb-1">
                    <Sparkles size={12} /> In the spotlight
                </div>
                <h2 className="text-xl font-bold text-slate-900 truncate">{item.name}</h2>
                <div className="text-xs text-slate-500 mt-0.5 flex items-center gap-2">
                    by {item.author}
                    {item.ratingCount > 0 && <StarRating value={item.ratingAvg} count={item.ratingCount} size={12} />}
                </div>
                {item.description && <p className="text-sm text-slate-600 mt-3 line-clamp-4">{item.description}</p>}
                <div className="flex items-center gap-3 mt-auto pt-4">
                    <button onClick={openInEditor} disabled={busy}
                        className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg px-4 py-2">
                        Open in editor
                    </button>
                    <GalleryLink projectId={item.id} className="text-sm text-blue-600 hover:underline">
                        See details
                    </GalleryLink>
                </div>
                {error && (
                    <p role="alert" className="mt-3 max-w-[65ch] text-xs leading-5 text-red-700">
                        {error}
                    </p>
                )}
            </div>
        </section>
    );
}
