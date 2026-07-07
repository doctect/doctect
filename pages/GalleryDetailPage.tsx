import React from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { AccountMenu } from '../components/AccountMenu';
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
            <header className="h-14 bg-white border-b flex items-center px-6 gap-4">
                <Link to="/gallery" className="flex items-center gap-1 text-sm text-slate-600 hover:text-blue-600"><ArrowLeft size={14} /> Gallery</Link>
                <div className="flex-1" />
                <AccountMenu />
            </header>
            <main className="max-w-4xl mx-auto p-6 grid md:grid-cols-2 gap-8">
                <GalleryDetailBody detail={detail} />
            </main>
        </div>
    );
}
