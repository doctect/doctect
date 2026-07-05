import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Search, Square, GitFork, Download } from 'lucide-react';
import { cloudApi, GalleryItem, API_BASE } from '../services/cloudApi';
import { AccountMenu } from '../components/AccountMenu';
import { GalleryLink } from '../components/gallery/GalleryLink';

export function GalleryPage() {
    const [items, setItems] = useState<GalleryItem[]>([]);
    const [q, setQ] = useState('');
    const [sort, setSort] = useState<'recent' | 'popular'>('recent');
    const [page, setPage] = useState(0);
    const [hasMore, setHasMore] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const t = setTimeout(() => {
            cloudApi.gallery({ q, sort, page })
                .then(res => { setItems(res.items); setHasMore(res.hasMore); setError(null); })
                .catch(() => setError('Could not load the gallery.'));
        }, 250);
        return () => clearTimeout(t);
    }, [q, sort, page]);

    return (
        <div className="min-h-screen bg-slate-50">
            <header className="h-14 bg-white border-b flex items-center px-6 gap-4 sticky top-0 z-10">
                <Link to="/" className="flex items-center gap-2 font-bold text-slate-800">
                    <div className="w-7 h-7 bg-blue-600 rounded-lg flex items-center justify-center text-white"><Square size={16} fill="currentColor" /></div>
                    Gallery
                </Link>
                <div className="flex-1 max-w-md relative">
                    <Search size={14} className="absolute left-2.5 top-2.5 text-slate-400" />
                    <input value={q} onChange={e => { setQ(e.target.value); setPage(0); }}
                        placeholder="Search planners and notebooks…"
                        className="w-full border rounded-lg pl-8 pr-3 py-1.5 text-sm" />
                </div>
                <select value={sort} onChange={e => { setSort(e.target.value as any); setPage(0); }} className="border rounded-lg px-2 py-1.5 text-sm">
                    <option value="recent">Newest</option>
                    <option value="popular">Popular</option>
                </select>
                <Link to="/app" className="text-xs font-medium text-slate-500 hover:text-blue-600">Editor</Link>
                <AccountMenu />
            </header>
            <main className="max-w-6xl mx-auto p-6">
                {error && <div className="text-sm text-red-600">{error}</div>}
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                    {items.map(item => (
                        <GalleryLink key={item.id} projectId={item.id} className="bg-white border rounded-xl overflow-hidden hover:shadow-md transition-shadow">
                            <div className="aspect-[3/4] bg-slate-100 flex items-center justify-center">
                                {item.thumbnailId
                                    ? <img src={`${API_BASE}/api/thumbnails/${item.thumbnailId}`} alt={item.name} className="w-full h-full object-contain" loading="lazy" />
                                    : <Square size={32} className="text-slate-300" />}
                            </div>
                            <div className="p-3">
                                <div className="text-sm font-semibold text-slate-800 truncate">{item.name}</div>
                                <div className="text-xs text-slate-500">by {item.author}</div>
                                <div className="flex gap-3 mt-1 text-[10px] text-slate-400">
                                    <span className="flex items-center gap-0.5"><GitFork size={10} /> {item.forkCount}</span>
                                    <span className="flex items-center gap-0.5"><Download size={10} /> {item.downloadCount}</span>
                                </div>
                            </div>
                        </GalleryLink>
                    ))}
                </div>
                {items.length === 0 && !error && <div className="text-sm text-slate-400 text-center py-16">Nothing here yet. Publish the first project!</div>}
                <div className="flex justify-center gap-2 mt-6">
                    {page > 0 && <button onClick={() => setPage(p => p - 1)} className="text-xs px-3 py-1.5 border rounded">Previous</button>}
                    {hasMore && <button onClick={() => setPage(p => p + 1)} className="text-xs px-3 py-1.5 border rounded">Next</button>}
                </div>
            </main>
        </div>
    );
}
