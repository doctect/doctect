import React from 'react';
import { Link, useParams } from 'react-router-dom';
import { AppHeader } from '../components/AppHeader';
import { GalleryDetailBody } from '../components/gallery/GalleryDetailBody';
import { useGalleryDetail } from '../hooks/useGalleryDetail';

export function GalleryDetailPage() {
    const { id } = useParams<{ id: string }>();
    const detail = useGalleryDetail(id);
    const { project, error } = detail;

    if (error) return <div className="p-10 text-sm text-red-600">{error} — <Link className="text-blue-600" to="/gallery">back to gallery</Link></div>;
    if (!project) return <div className="p-10 text-sm text-slate-400">Loading…</div>;

    return (
        <div className="h-screen overflow-y-auto bg-slate-50">
            <AppHeader />
            <main className="max-w-4xl mx-auto p-6 grid md:grid-cols-2 gap-8">
                <GalleryDetailBody detail={detail} />
            </main>
        </div>
    );
}
