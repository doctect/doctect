import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, User, Square, GitFork, Download } from 'lucide-react';
import { GalleryItem, API_BASE } from '../services/cloudApi';
import { AccountMenu } from '../components/AccountMenu';

export function ProfilePage() {
    const { username } = useParams<{ username: string }>();
    const [data, setData] = useState<{ user: { username: string; createdAt: string }; projects: GalleryItem[] } | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        fetch(`${API_BASE}/api/users/${username}`, { credentials: 'include' })
            .then(r => r.ok ? r.json() : Promise.reject(new Error('User not found')))
            .then(setData)
            .catch(e => setError(e.message));
    }, [username]);

    if (error) return <div className="p-10 text-sm text-red-600">{error} — <Link className="text-blue-600" to="/gallery">back to gallery</Link></div>;
    if (!data) return <div className="p-10 text-sm text-slate-400">Loading…</div>;

    return (
        <div className="min-h-screen bg-slate-50">
            <header className="h-14 bg-white border-b flex items-center px-6 gap-4">
                <Link to="/gallery" className="flex items-center gap-1 text-sm text-slate-600 hover:text-blue-600"><ArrowLeft size={14} /> Gallery</Link>
                <div className="flex-1" />
                <AccountMenu />
            </header>
            <main className="max-w-6xl mx-auto p-6">
                <div className="flex items-center gap-3 mb-6">
                    <div className="w-12 h-12 bg-slate-200 rounded-full flex items-center justify-center"><User size={20} className="text-slate-500" /></div>
                    <div>
                        <h1 className="text-xl font-bold text-slate-800">{data.user.username}</h1>
                        <div className="text-xs text-slate-400">Joined {new Date(data.user.createdAt).toLocaleDateString()}</div>
                    </div>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                    {data.projects.map(item => (
                        <Link key={item.id} to={`/gallery/${item.id}`} className="bg-white border rounded-xl overflow-hidden hover:shadow-md transition-shadow">
                            <div className="aspect-[3/4] bg-slate-100 flex items-center justify-center">
                                {item.thumbnailId
                                    ? <img src={`${API_BASE}/api/thumbnails/${item.thumbnailId}`} alt={item.name} className="w-full h-full object-contain" loading="lazy" />
                                    : <Square size={32} className="text-slate-300" />}
                            </div>
                            <div className="p-3">
                                <div className="text-sm font-semibold text-slate-800 truncate">{item.name}</div>
                                <div className="flex gap-3 mt-1 text-[10px] text-slate-400">
                                    <span className="flex items-center gap-0.5"><GitFork size={10} /> {item.forkCount}</span>
                                    <span className="flex items-center gap-0.5"><Download size={10} /> {item.downloadCount}</span>
                                </div>
                            </div>
                        </Link>
                    ))}
                </div>
                {data.projects.length === 0 && <div className="text-sm text-slate-400 text-center py-16">No published projects yet.</div>}
            </main>
        </div>
    );
}
