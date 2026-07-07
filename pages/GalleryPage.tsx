import React, { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Search, Square, Star, Flame, Clock, X, ArrowLeft } from 'lucide-react';
import { cloudApi, GalleryItem, GalleryTag } from '../services/cloudApi';
import { AccountMenu } from '../components/AccountMenu';
import { ProjectCard } from '../components/gallery/ProjectCard';

const SECTION_LIMIT = 8;

function SkeletonGrid({ count }: { count: number }) {
    return (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {Array.from({ length: count }, (_, i) => (
                <div key={i} data-testid="skeleton-card" className="bg-white border rounded-xl overflow-hidden animate-pulse">
                    <div className="aspect-[3/4] bg-slate-100" />
                    <div className="p-3 space-y-2">
                        <div className="h-3.5 bg-slate-200 rounded w-3/4" />
                        <div className="h-3 bg-slate-200 rounded w-1/2" />
                    </div>
                </div>
            ))}
        </div>
    );
}

const SECTIONS = [
    { key: 'rating' as const, title: 'Top rated', icon: <Star size={16} className="text-amber-500" /> },
    { key: 'popular' as const, title: 'Popular', icon: <Flame size={16} className="text-orange-500" /> },
    { key: 'recent' as const, title: 'Recently updated', icon: <Clock size={16} className="text-blue-500" /> },
];
type SectionKey = typeof SECTIONS[number]['key'];

export function GalleryPage() {
    const [searchParams, setSearchParams] = useSearchParams();
    const qParam = searchParams.get('q') ?? '';
    const tagParam = searchParams.get('tag') ?? '';
    const sortParam = searchParams.get('sort') ?? '';
    const page = Math.max(0, parseInt(searchParams.get('page') ?? '0', 10) || 0);
    const isFiltered = !!(qParam || tagParam || sortParam);

    const [qInput, setQInput] = useState(qParam);
    const [tags, setTags] = useState<GalleryTag[]>([]);
    const [items, setItems] = useState<GalleryItem[] | null>(null);   // grid mode; null = loading
    const [hasMore, setHasMore] = useState(false);
    const [sections, setSections] = useState<Record<SectionKey, GalleryItem[]> | null>(null);
    const [error, setError] = useState<string | null>(null);

    const setParam = (key: string, value: string | null) => {
        setSearchParams(prev => {
            const next = new URLSearchParams(prev);
            if (value) next.set(key, value); else next.delete(key);
            if (key !== 'page') next.delete('page');
            return next;
        });
    };

    // Debounce the search box into ?q= so filtered views stay shareable/bookmarkable.
    useEffect(() => {
        const t = setTimeout(() => {
            if (qInput === qParam) return;
            setSearchParams(prev => {
                const next = new URLSearchParams(prev);
                if (qInput) next.set('q', qInput); else next.delete('q');
                next.delete('page');
                return next;
            }, { replace: true });
        }, 250);
        return () => clearTimeout(t);
    }, [qInput]); // eslint-disable-line react-hooks/exhaustive-deps
    useEffect(() => { setQInput(qParam); }, [qParam]);

    useEffect(() => {
        cloudApi.galleryTags().then(setTags).catch(() => {});
    }, []);

    // Sections mode: three parallel, limit-capped fetches.
    useEffect(() => {
        if (isFiltered) return;
        setSections(null);
        Promise.all(SECTIONS.map(s => cloudApi.gallery({ sort: s.key, limit: SECTION_LIMIT })))
            .then(results => {
                const bySection = {} as Record<SectionKey, GalleryItem[]>;
                SECTIONS.forEach((s, i) => { bySection[s.key] = results[i].items; });
                setSections(bySection);
                setError(null);
            })
            .catch(() => setError('Could not load the gallery.'));
    }, [isFiltered]);

    // Grid mode: one filtered, paginated fetch.
    useEffect(() => {
        if (!isFiltered) return;
        setItems(null);
        const sort = sortParam === 'popular' || sortParam === 'rating' ? sortParam : 'recent';
        cloudApi.gallery({ q: qParam || undefined, tag: tagParam || undefined, sort, page })
            .then(res => { setItems(res.items); setHasMore(res.hasMore); setError(null); })
            .catch(() => setError('Could not load the gallery.'));
    }, [isFiltered, qParam, tagParam, sortParam, page]);

    const clearFilters = () => { setQInput(''); setSearchParams({}); };
    const galleryEmpty = sections !== null && SECTIONS.every(s => sections[s.key].length === 0);

    return (
        // h-screen + overflow-y-auto: index.html sets body{overflow:hidden}, so each page owns its scrolling
        <div className="h-screen overflow-y-auto bg-slate-50">
            <header className="h-14 bg-white border-b flex items-center px-6 gap-4 sticky top-0 z-10">
                <Link to="/" className="flex items-center gap-2 font-bold text-slate-800">
                    <div className="w-7 h-7 bg-blue-600 rounded-lg flex items-center justify-center text-white"><Square size={16} fill="currentColor" /></div>
                    Gallery
                </Link>
                <div className="flex-1 max-w-md relative">
                    <Search size={14} className="absolute left-2.5 top-2.5 text-slate-400" />
                    <input value={qInput} onChange={e => setQInput(e.target.value)}
                        placeholder="Search planners and notebooks…"
                        className="w-full border rounded-lg pl-8 pr-3 py-1.5 text-sm" />
                </div>
                {isFiltered && (
                    <select value={sortParam || 'recent'} onChange={e => setParam('sort', e.target.value)}
                        className="border rounded-lg px-2 py-1.5 text-sm">
                        <option value="recent">Newest</option>
                        <option value="popular">Popular</option>
                        <option value="rating">Top rated</option>
                    </select>
                )}
                <Link to="/app" className="text-xs font-medium text-slate-500 hover:text-blue-600">Editor</Link>
                <AccountMenu />
            </header>

            {!isFiltered && (
                <div className="bg-gradient-to-r from-blue-600 via-blue-500 to-indigo-500 text-white">
                    <div className="max-w-6xl mx-auto px-6 py-10">
                        <h1 className="text-2xl md:text-3xl font-bold">Discover planner & notebook templates</h1>
                        <p className="text-sm text-blue-100 mt-1">Browse community-published designs — open, download, or fork any of them.</p>
                        {tags.length > 0 && (
                            <div className="flex flex-wrap gap-2 mt-5">
                                {tags.map(t => (
                                    <button key={t.tag} onClick={() => setParam('tag', t.tag)}
                                        className="text-xs bg-white/15 hover:bg-white/30 rounded-full px-3 py-1 transition-colors">
                                        {t.tag} <span className="text-blue-100">({t.count})</span>
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            )}

            <main className="max-w-6xl mx-auto p-6">
                {error && <div className="text-sm text-red-600">{error}</div>}

                {!isFiltered ? (
                    galleryEmpty
                        ? <div className="text-sm text-slate-400 text-center py-16">Nothing here yet. Publish the first project!</div>
                        : SECTIONS.map(s => {
                            const rows = sections?.[s.key];
                            if (rows && rows.length === 0) return null;
                            return (
                                <section key={s.key} className="mt-8 first:mt-2">
                                    <div className="flex items-center justify-between mb-3">
                                        <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-700">{s.icon} {s.title}</h2>
                                        <button onClick={() => setParam('sort', s.key)} className="text-xs text-blue-600 hover:underline">See all →</button>
                                    </div>
                                    {rows
                                        ? <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">{rows.map(i => <ProjectCard key={i.id} item={i} />)}</div>
                                        : <SkeletonGrid count={4} />}
                                </section>
                            );
                        })
                ) : (
                    <>
                        <div className="flex items-center gap-3 mb-4">
                            <button onClick={clearFilters} className="flex items-center gap-1 text-xs text-slate-600 hover:text-blue-600">
                                <ArrowLeft size={12} /> All projects
                            </button>
                            {tagParam && (
                                <span className="flex items-center gap-1 text-xs bg-blue-100 text-blue-700 rounded-full px-3 py-1">
                                    {tagParam}
                                    <button onClick={() => setParam('tag', null)} aria-label="Remove tag filter" className="hover:text-blue-900">
                                        <X size={12} />
                                    </button>
                                </span>
                            )}
                        </div>
                        {items === null ? (
                            <SkeletonGrid count={8} />
                        ) : items.length === 0 ? (
                            <div className="text-center py-16">
                                <div className="text-sm text-slate-400">No projects match.</div>
                                <button onClick={clearFilters} className="text-xs text-blue-600 hover:underline mt-2">Clear filters</button>
                            </div>
                        ) : (
                            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                                {items.map(item => <ProjectCard key={item.id} item={item} />)}
                            </div>
                        )}
                        <div className="flex justify-center gap-2 mt-6">
                            {page > 0 && <button onClick={() => setParam('page', String(page - 1))} className="text-xs px-3 py-1.5 border rounded">Previous</button>}
                            {hasMore && <button onClick={() => setParam('page', String(page + 1))} className="text-xs px-3 py-1.5 border rounded">Next</button>}
                        </div>
                    </>
                )}
            </main>
        </div>
    );
}
